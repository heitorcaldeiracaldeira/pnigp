// ETL — população indígena por município de SC (IBGE Censo 2022, SIDRA tabela 9605, cor/raça Indígena).
// Fonte sólida e agregada por município (a saúde indígena é responsabilidade compartilhada com o município).
// Grava entes_sc.pop_indigena. node scripts/ingest_indigena_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIDRA = "https://apisidra.ibge.gov.br/values/t/9605/n6/in%20n3%2042/v/93/p/2022/c86/2780"; // v93=pessoas, c86/2780=Indígena
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true });
  db.on("error", () => {});
  await db.query(`ALTER TABLE entes_sc ADD COLUMN IF NOT EXISTS pop_indigena INTEGER`);
  let rows = null;
  for (let t = 0; t < 4 && !rows; t++) {
    try { const r = await fetch(SIDRA, { signal: AbortSignal.timeout(60000) }); if (r.ok) rows = await r.json(); else throw 0; }
    catch { await sleep(2000 * (t + 1)); }
  }
  if (!rows) { console.error("SIDRA indisponível"); process.exit(1); }
  let n = 0;
  for (const r of rows.slice(1)) { // linha 0 = cabeçalho
    const cod = String(r.D1C || "").trim(); const v = Number(r.V); // V pode vir "..." quando indisponível
    if (cod.length !== 7 || !isFinite(v)) continue;
    await db.query(`UPDATE entes_sc SET pop_indigena=$1 WHERE cod_ibge=$2`, [Math.round(v), cod]);
    n++;
  }
  const c = (await db.query(`SELECT count(*) FILTER(WHERE pop_indigena IS NOT NULL) com, count(*) FILTER(WHERE pop_indigena>0) com_ind, sum(pop_indigena) tot FROM entes_sc WHERE tipo='M'`)).rows[0];
  const top = await db.query(`SELECT nome, pop_indigena, populacao FROM entes_sc WHERE tipo='M' AND pop_indigena>0 ORDER BY pop_indigena DESC LIMIT 6`);
  console.log(`Indígena concluído: ${n} municípios atualizados | com população indígena: ${c.com_ind} | total SC: ${c.tot}`);
  console.log("Top municípios:", top.rows.map((x) => `${x.nome} ${x.pop_indigena} (${(x.pop_indigena / x.populacao * 100).toFixed(1)}%)`).join(" · "));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
