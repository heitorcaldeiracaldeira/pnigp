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
function saudeDe(arr) {
  const x = (arr || []).find((i) => i.numero_indicador === "3.2");
  if (!x) return null;
  const num = Number(x.numerador) || 0, den = Number(x.denominador) || 0;
  let pct = den > 0 ? (num / den) * 100 : null;
  if (pct == null && x.indicador_calculado) { const p = parseFloat(String(x.indicador_calculado).replace(/\./g, "").replace(",", ".")); if (isFinite(p)) pct = p; }
  return pct == null ? null : { saude_pct: Math.round(pct * 100) / 100, saude_valor: num };
}

async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS siops_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL, saude_pct NUMERIC, saude_valor NUMERIC, saude_min NUMERIC DEFAULT 15,
    PRIMARY KEY (cod_ibge, ano) );`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };

  const arg = process.argv[2];
  if (arg) { for (const ano of ANOS) console.log(`${arg} ${ano}:`, JSON.stringify(saudeDe(await getIndic(arg.slice(0, 6), ano)))); await db.end(); return; }

  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM siops_sc`)).rows.map((r) => r.k));
  let n = 0;
  await pool(entes, 4, async (e) => {
    const co6 = e.cod_ibge.slice(0, 6);
    for (const ano of ANOS) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const arr = await getIndic(co6, ano);
      if (arr === null) continue;
      const s = saudeDe(arr);
      if (!s) continue;
      await q(`INSERT INTO siops_sc (cod_ibge,ano,saude_pct,saude_valor) VALUES ($1,$2,$3,$4)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET saude_pct=EXCLUDED.saude_pct, saude_valor=EXCLUDED.saude_valor`,
        [e.cod_ibge, ano, s.saude_pct, s.saude_valor]);
      n++;
    }
  });
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) entes, count(*) FILTER (WHERE saude_pct<15) abaixo FROM siops_sc`);
  console.log(`Concluído: ${n} novas | ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
