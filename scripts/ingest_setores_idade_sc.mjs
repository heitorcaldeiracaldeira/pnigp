// Adiciona % de IDOSOS (60+) por setor censitário (demografia_BR: V01006=total, V01040=60-69, V01041=70+) → setores_censitarios_sc + injeta no geojson do mapa. State-agnostic.
import fs from "fs"; import pg from "pg"; import readline from "readline";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const CSV = process.argv[2];
const uq = (x) => (x || "").replace(/^"|"$/g, "");
const nI = (x) => { const n = parseInt(uq(x).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
await db.query(`ALTER TABLE setores_censitarios_sc ADD COLUMN IF NOT EXISTS idosos INT, ADD COLUMN IF NOT EXISTS pct_idosos NUMERIC`);
// 1) stream demografia → map cod_setor -> {idosos, pct}
const M = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: "latin1" }) });
let i = 0;
for await (const l of rl) { if (i++ === 0) continue; if (!l.startsWith(`"${UFC}`)) continue; const c = l.split(";"); const cd = uq(c[0]); const tot = nI(c[1]); const idosos = nI(c[35]) + nI(c[36]); const pct = tot > 0 ? Math.round((idosos / tot) * 1000) / 10 : 0; M.set(cd, { idosos, pct }); }
// 2) batch update setores_censitarios_sc
const rows = [...M.entries()];
for (let k = 0; k < rows.length; k += 500) {
  const chunk = rows.slice(k, k + 500); const vals = [], ph = [];
  chunk.forEach((r, j) => { const b = j * 3; ph.push(`($${b+1},$${b+2}::int,$${b+3}::numeric)`); vals.push(r[0], r[1].idosos, r[1].pct); });
  await db.query(`UPDATE setores_censitarios_sc s SET idosos=v.i, pct_idosos=v.p FROM (VALUES ${ph.join(",")}) AS v(cs,i,p) WHERE s.cod_setor=v.cs`, vals);
}
// 3) injeta pctIdosos no geojson por município
const muns = (await db.query(`SELECT cod_ibge FROM setores_geo_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows.map(r => r.cod_ibge);
let upd = 0;
for (const mun of muns) {
  const g = (await db.query(`SELECT geojson FROM setores_geo_sc WHERE cod_ibge=$1`, [mun])).rows[0].geojson;
  const fc = typeof g === "string" ? JSON.parse(g) : g;
  for (const f of fc.features) { const m = M.get(f.properties.cd); f.properties.pctIdosos = m ? m.pct : 0; }
  await db.query(`UPDATE setores_geo_sc SET geojson=$2 WHERE cod_ibge=$1`, [mun, JSON.stringify(fc)]); upd++;
}
const c = (await db.query(`SELECT count(*) n, round(avg(pct_idosos),1) m FROM setores_censitarios_sc WHERE cod_ibge LIKE '${UFC}%' AND idosos IS NOT NULL`)).rows[0];
console.log(`✔ idade por setor: ${c.n} setores com % idosos (média ${c.m}%) · geojson atualizado em ${upd} municípios`);
await db.end();
