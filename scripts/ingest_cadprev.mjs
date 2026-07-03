// ETL GENÉRICO — espelha (mirror raw) os demais recursos do CADPREV, fielmente, por UF.
// Captura "tudo que a API expõe": cria cadprev_<recurso> com todas as colunas da fonte + cod_ibge,
// e atualiza por substituição-por-UF (idempotente: DELETE WHERE sg_uf=UF; INSERT). Mantém fidelidade total.
// CRP tem ETL tipado próprio (ingest_rpps_crp.mjs) e fica de fora para não duplicar.
//   UF=SC node scripts/ingest_cadprev.mjs
//   RECURSOS=DIPR,DAIR_CARTEIRA UF=SC node scripts/ingest_cadprev.mjs   (subconjunto)
import { SG_UF } from "./_uf.mjs";
import { pool, withRetry, carregarEntes, fetchAll, sleep } from "./_cadprev.mjs";

// 37 recursos (todos menos RPPS_CRP). DRAA_VALORES_COMPROMISSOS também é espelhado (fidelidade total),
// complementando a tabela tipada rpps_atuarial_sc (déficit/ativos).
const TODOS = [
  "RPPS_ALIQUOTA", "RPPS_REGIME_PREVIDENCIARIO",
  "DAIR_IDENTIFICACAO", "DAIR_CARTEIRA", "DAIR_APLICACOES_RESGATE", "DAIR_FORMA_GESTAO",
  "DAIR_FUNDO_INVEST_ANALISADOS", "DAIR_GOVERNANCA", "DAIR_INSTITUICAO_CREDENCIADA", "DAIR_REGIME_ATA",
  "DIPR",
  "DRAA_BASE_CALCULO_AMORTIZACAO", "DRAA_BASE_CALCULO_ENTE", "DRAA_COMPARATIVO_AVALIACAO",
  "DRAA_COMPARATIVO_RECEITA", "DRAA_CONTRIBUICAO", "DRAA_CUSTO_NORMAL_BENEF_CAPIT",
  "DRAA_CUSTO_NORMAL_BENEF_COB", "DRAA_CUSTO_NORMAL_REP_APOS", "DRAA_CUSTO_NORMAL_REP_AUX",
  "DRAA_DADOS_CONSOLIDADOS", "DRAA_ENCAMINHAMENTO", "DRAA_ESTATISTICA", "DRAA_FLUXO_ATUARIAL",
  "DRAA_FORMA_AMORTIZACAO", "DRAA_HIPOTESE_ATUARIAL", "DRAA_HIPOTESE_BIOMETRICA", "DRAA_NOTIFICACAO",
  "DRAA_ORGAO_ENTIDADE", "DRAA_PARECER_ATUARIAL", "DRAA_PLANO_AMORTIZACAO",
  "DRAA_PLANO_AMORTIZACAO_DEFICIT", "DRAA_PLANO_BENEFICIO", "DRAA_PLANO_CUSTEIO",
  "DRAA_RETIFICACAO_NOTIFICACAO", "DRAA_SEGREGACAO_MASSA", "DRAA_VALORES_COMPROMISSOS",
];
const RECURSOS = (process.env.RECURSOS ? process.env.RECURSOS.split(",").map((s) => s.trim()) : TODOS).filter(Boolean);
const tabela = (rec) => `cadprev_${rec.toLowerCase()}`;
const ident = (s) => `"${String(s).replace(/"/g, "")}"`;
const CHUNK = 500;
const log = (m) => process.stdout.write(`[CADPREV ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

async function espelhar(db, q, rec, codDe) {
  const { data, erro } = await fetchAll(rec, SG_UF, { log });
  if (erro) { log(`${rec}: falha de rede — pula (não mexe na tabela existente)`); return 0; }
  if (!data.length) { log(`${rec}: 0 registros`); return 0; }
  // colunas = união das chaves de todos os registros (alguns vêm com campos opcionais)
  const cols = [...new Set(data.flatMap((r) => Object.keys(r)))];
  const tab = tabela(rec);
  await q(`CREATE TABLE IF NOT EXISTS ${ident(tab)} (cod_ibge TEXT, ${cols.map((c) => `${ident(c)} TEXT`).join(", ")})`);
  // garante colunas novas que possam surgir entre execuções
  for (const c of cols) await q(`ALTER TABLE ${ident(tab)} ADD COLUMN IF NOT EXISTS ${ident(c)} TEXT`).catch(() => {});
  // substituição-por-UF: mirror fiel e idempotente
  await q(`DELETE FROM ${ident(tab)} WHERE sg_uf = $1`, [SG_UF]);
  const allCols = ["cod_ibge", ...cols];
  let gravados = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const vals = []; const ph = [];
    slice.forEach((r, j) => {
      const base = j * allCols.length;
      ph.push(`(${allCols.map((_, k) => `$${base + k + 1}`).join(",")})`);
      vals.push(codDe(r.no_ente) || null, ...cols.map((c) => (r[c] == null ? null : String(r[c]))));
    });
    await q(`INSERT INTO ${ident(tab)} (${allCols.map(ident).join(",")}) VALUES ${ph.join(",")}`, vals);
    gravados += slice.length;
  }
  const casados = data.filter((r) => codDe(r.no_ente)).length;
  log(`${rec.padEnd(30)} → ${tab}: ${gravados} linhas (${casados} com cod_ibge) · ${cols.length} colunas`);
  return gravados;
}

async function main() {
  const db = pool();
  const q = withRetry(db);
  // heartbeat/auditoria: 1 linha por recurso espelhado (progresso monotônico p/ o supervisor do orquestrador)
  await q(`CREATE TABLE IF NOT EXISTS cadprev_sync_log (id SERIAL PRIMARY KEY, recurso TEXT, uf TEXT, linhas INTEGER, ts TIMESTAMPTZ DEFAULT now())`);
  const { codDe } = await carregarEntes(db);
  log(`espelhando ${RECURSOS.length} recurso(s) CADPREV · UF=${SG_UF}`);
  for (const rec of RECURSOS) {
    let linhas = 0;
    try { linhas = await espelhar(db, q, rec, codDe); } catch (e) { log(`${rec}: ERRO ${e.message || e}`); }
    await q(`INSERT INTO cadprev_sync_log (recurso, uf, linhas) VALUES ($1,$2,$3)`, [rec, SG_UF, linhas]).catch(() => {});
    await sleep(1200); // espaçamento anti-throttle (420)
  }
  log("espelhamento concluído.");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
