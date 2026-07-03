// ETL — ACOMPANHAMENTO intra-anual da execução orçamentária (RREO do bimestre vigente, SICONFI).
// Receita prevista × arrecadada e despesa orçada × empenhada ATÉ O BIMESTRE, por município. Atualiza a cada bimestre.
// node scripts/ingest_acompanhamento_sc.mjs   (ANO opcional; default = ano corrente)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = Number(process.env.ANO || new Date().getFullYear());
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const COL_PREV_ATU = "PREVISÃO ATUALIZADA (a)", COL_REC_ATE = "Até o Bimestre (c)";
const COL_DOT_ATU = "DOTAÇÃO ATUALIZADA (a)", COL_EMP_ATE = "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)";
const RE_REC_TOTAL = /receitas?\s*\(exceto intra|^total\s+receitas|^receitas\s+\(i\)/i;
const RE_DESP_TOTAL = /despesas?\s*\(exceto intra/i;

async function fetchAnexo(ano, periodo, anexo, id) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=${periodo}&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%20${anexo}&co_esfera=M&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) { await sleep(1500 * (t + 1)); continue; }
      return (await r.json()).items || [];
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
const acha = (items, reConta, coluna) => { const x = items.find((i) => reConta.test(String(i.conta || "").trim()) && i.coluna === coluna); return x ? Number(x.valor) || 0 : null; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS acompanhamento_sc (cod_ibge TEXT, ano INT, bimestre INT, receita_prevista NUMERIC, receita_realizada NUMERIC, despesa_dotacao NUMERIC, despesa_empenhada NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC' ORDER BY cod_ibge`)).rows;

  // descobre o último bimestre publicado (testa 6..1 no 1º ente)
  let bim = 0;
  for (let p = 6; p >= 1; p--) { const it = await fetchAnexo(ANO, p, "01", entes[0].cod_ibge); if (it && it.length) { bim = p; break; } }
  if (!bim) { console.log(`Sem RREO publicado para ${ANO}.`); await db.end(); return; }
  console.log(`${ANO}: último bimestre publicado = ${bim} (até mês ${bim * 2})`);

  let ok = 0;
  for (const e of entes) {
    const a01 = await fetchAnexo(ANO, bim, "01", e.cod_ibge);
    const a02 = await fetchAnexo(ANO, bim, "02", e.cod_ibge);
    if (!a01 || !a02) continue;
    const recPrev = acha(a01, RE_REC_TOTAL, COL_PREV_ATU), recReal = acha(a01, RE_REC_TOTAL, COL_REC_ATE);
    const despDot = acha(a02, RE_DESP_TOTAL, COL_DOT_ATU), despEmp = acha(a02, RE_DESP_TOTAL, COL_EMP_ATE);
    if (recPrev == null && despDot == null) continue;
    await q(`INSERT INTO acompanhamento_sc (cod_ibge,ano,bimestre,receita_prevista,receita_realizada,despesa_dotacao,despesa_empenhada) VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (cod_ibge,ano) DO UPDATE SET bimestre=EXCLUDED.bimestre,receita_prevista=EXCLUDED.receita_prevista,receita_realizada=EXCLUDED.receita_realizada,despesa_dotacao=EXCLUDED.despesa_dotacao,despesa_empenhada=EXCLUDED.despesa_empenhada,atualizado=now()`,
      [e.cod_ibge, ANO, bim, recPrev, recReal, despDot, despEmp]);
    ok++;
    if (ok % 50 === 0) console.log(`  ${ok} municípios`);
    await sleep(80);
  }
  const c = await db.query(`SELECT count(*) n, round(avg(receita_realizada/NULLIF(receita_prevista,0))*100,1) rec_med, round(avg(despesa_empenhada/NULLIF(despesa_dotacao,0))*100,1) desp_med FROM acompanhamento_sc WHERE ano=$1`, [ANO]);
  console.log(`Concluído ${ANO}/bim${bim}: ${ok} municípios · receita média ${c.rows[0].rec_med}% · despesa empenhada média ${c.rows[0].desp_med}%`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
