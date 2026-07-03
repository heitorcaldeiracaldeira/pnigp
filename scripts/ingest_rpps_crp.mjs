// ETL — CRP (Certificado de Regularidade Previdenciária) dos RPPS via CADPREV (SPREV).
// Fonte: apicadprev.trabalho.gov.br /RPPS_CRP. É o mesmo dado da tela "Consultas Públicas → Pesquisar Ente",
// mas puxando a UF inteira de uma vez e casando no_ente → cod_ibge (sem busca manual por nome).
//   UF=SC node scripts/ingest_rpps_crp.mjs
import { SG_UF } from "./_uf.mjs";
import { pool, withRetry, carregarEntes, fetchAll } from "./_cadprev.mjs";

// "dd/mm/yyyy" → "yyyy-mm-dd" (ou null)
const toISO = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const log = (m) => process.stdout.write(`[CRP] ${m}\n`);

async function main() {
  const db = pool();
  const q = withRetry(db);
  await q(`CREATE TABLE IF NOT EXISTS rpps_crp_sc (
    cod_ibge TEXT, nr_cnpj_entidade TEXT, no_ente TEXT, sg_uf TEXT,
    nr_crp TEXT, ds_situacao TEXT, tp_crp TEXT,
    dt_emissao DATE, dt_validade DATE,
    PRIMARY KEY (cod_ibge, nr_crp))`);
  const { codDe } = await carregarEntes(db);

  log(`coletando RPPS_CRP · UF=${SG_UF}…`);
  const { data, erro } = await fetchAll("RPPS_CRP", SG_UF, { log });
  if (erro) { log("falha de rede — abortando sem gravar parcial"); await db.end(); process.exit(1); }
  log(`${data.length} CRPs retornados pela API`);

  // dedup por (cod_ibge, nr_crp) no lote — a API pode repetir; fica o registro de emissão mais recente
  const semCasar = new Map(); const porChave = new Map();
  for (const r of data) {
    const cod = codDe(r.no_ente);
    if (!cod) { semCasar.set(r.no_ente, (semCasar.get(r.no_ente) || 0) + 1); continue; }
    if (!r.nr_crp) continue;
    const k = `${cod}|${r.nr_crp}`;
    const prev = porChave.get(k);
    const emis = toISO(r.dt_emissao);
    if (!prev || (emis && (!prev._emis || emis > prev._emis))) porChave.set(k, { cod, r, _emis: emis });
  }
  const linhas = [...porChave.values()];
  const COLS = 9, CHUNK = 500;
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const slice = linhas.slice(i, i + CHUNK);
    const vals = []; const ph = [];
    slice.forEach(({ cod, r }, j) => {
      const b = j * COLS;
      ph.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
      vals.push(cod, r.nr_cnpj_entidade, r.no_ente, r.sg_uf, r.nr_crp, r.ds_situacao, r.tp_crp, toISO(r.dt_emissao), toISO(r.dt_validade));
    });
    await q(`INSERT INTO rpps_crp_sc (cod_ibge,nr_cnpj_entidade,no_ente,sg_uf,nr_crp,ds_situacao,tp_crp,dt_emissao,dt_validade)
             VALUES ${ph.join(",")}
             ON CONFLICT (cod_ibge,nr_crp) DO UPDATE SET
               ds_situacao=EXCLUDED.ds_situacao, tp_crp=EXCLUDED.tp_crp,
               dt_emissao=EXCLUDED.dt_emissao, dt_validade=EXCLUDED.dt_validade,
               nr_cnpj_entidade=EXCLUDED.nr_cnpj_entidade, no_ente=EXCLUDED.no_ente`, vals);
    gravados += slice.length;
  }

  // Não descartar em silêncio: reportar os entes que não casaram (diretriz "privilegiar os dados").
  if (semCasar.size) {
    const top = [...semCasar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    log(`${semCasar.size} no_ente não casaram com entes_sc (${[...semCasar.values()].reduce((a, b) => a + b, 0)} CRPs ignorados):`);
    for (const [n, c] of top) log(`   · ${n} (${c})`);
  }
  const resumo = await db.query(`
    SELECT count(DISTINCT cod_ibge) entes, count(*) crps,
           count(*) FILTER (WHERE tp_crp ILIKE '%VENC%' OR dt_validade < current_date) vencidos
    FROM rpps_crp_sc`);
  log(`concluído: ${gravados} CRPs gravados · ${JSON.stringify(resumo.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
