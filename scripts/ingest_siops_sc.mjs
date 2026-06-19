// ETL — SIOPS (Saúde): % da receita própria aplicada em ASPS conforme LC 141 (mínimo constitucional 15%).
// Fonte oficial: API pública SIOPS/Min. Saúde (indicador 3.2). co_municipio = 6 primeiros dígitos do cod_ibge.
// Idempotente/resumível. node scripts/ingest_siops_sc.mjs [cod_ibge]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://siops-consulta-publica-api.saude.gov.br/v1";
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getIndic(co6, ano) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${API}/indicador/municipal/${co6}/${ano}/2`, { signal: AbortSignal.timeout(30000) });
      if (r.status === 204 || r.status === 404) return [];
      if (!r.ok) throw 0;
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(600 * (t + 1)); }
  }
  return null;
}
const pctCalc = (x) => { if (!x) return null; const num = Number(x.numerador) || 0, den = Number(x.denominador) || 0; let p = den > 0 ? (num / den) * 100 : null; if (p == null && x.indicador_calculado) { const v = parseFloat(String(x.indicador_calculado).replace(/\./g, "").replace(",", ".")); if (isFinite(v)) p = v; } return p == null ? null : Math.round(p * 100) / 100; };
function saudeDe(arr) {
  const ind = (c) => (arr || []).find((i) => i.numero_indicador === c);
  const x = ind("3.2"); if (!x) return null;
  const pct = pctCalc(x); if (pct == null) return null;
  const t13 = ind("1.3"), t14 = ind("1.4"); // % transf. para saúde (SUS) e % transf. da União p/ saúde — "de onde vem o dinheiro da saúde"
  return {
    saude_pct: pct, saude_valor: Number(x.numerador) || 0,
    transf_saude_pct: pctCalc(t13), transf_saude_valor: t13 ? Number(t13.numerador) || 0 : null,
    transf_uniao_pct: pctCalc(t14), transf_uniao_valor: t14 ? Number(t14.numerador) || 0 : null,
  };
}

async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS siops_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL, saude_pct NUMERIC, saude_valor NUMERIC, saude_min NUMERIC DEFAULT 15,
    PRIMARY KEY (cod_ibge, ano) );`);
  for (const c of ["transf_saude_pct", "transf_uniao_pct"]) await db.query(`ALTER TABLE siops_sc ADD COLUMN IF NOT EXISTS ${c} NUMERIC`);
  for (const c of ["transf_saude_valor", "transf_uniao_valor"]) await db.query(`ALTER TABLE siops_sc ADD COLUMN IF NOT EXISTS ${c} NUMERIC`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };

  const arg = process.argv[2];
  if (arg) { for (const ano of ANOS) console.log(`${arg} ${ano}:`, JSON.stringify(saudeDe(await getIndic(arg.slice(0, 6), ano)))); await db.end(); return; }

  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = process.env.REFRESH === "1" ? new Set() : new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM siops_sc`)).rows.map((r) => r.k));
  let n = 0;
  await pool(entes, 4, async (e) => {
    const co6 = e.cod_ibge.slice(0, 6);
    for (const ano of ANOS) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const arr = await getIndic(co6, ano);
      if (arr === null) continue;
      const s = saudeDe(arr);
      if (!s) continue;
      await q(`INSERT INTO siops_sc (cod_ibge,ano,saude_pct,saude_valor,transf_saude_pct,transf_saude_valor,transf_uniao_pct,transf_uniao_valor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET saude_pct=EXCLUDED.saude_pct, saude_valor=EXCLUDED.saude_valor, transf_saude_pct=EXCLUDED.transf_saude_pct, transf_saude_valor=EXCLUDED.transf_saude_valor, transf_uniao_pct=EXCLUDED.transf_uniao_pct, transf_uniao_valor=EXCLUDED.transf_uniao_valor`,
        [e.cod_ibge, ano, s.saude_pct, s.saude_valor, s.transf_saude_pct, s.transf_saude_valor, s.transf_uniao_pct, s.transf_uniao_valor]);
      n++;
    }
  });
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) entes, count(*) FILTER (WHERE saude_pct<15) abaixo FROM siops_sc`);
  console.log(`Concluído: ${n} novas | ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
