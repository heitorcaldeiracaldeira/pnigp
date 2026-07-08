// Adiciona % de CRIANÇAS (0-14) por setor censitário (demografia_BR: V01006=total, V01031+V01032+V01033=0-14) → setores_censitarios_sc + injeta no geojson do mapa. State-agnostic.
import fs from "fs"; import pg from "pg"; import readline from "readline";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const CSV = process.argv[2];
const uq = (x) => (x || "").replace(/^"|"$/g, "");
const nI = (x) => { const n = parseInt(uq(x).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
await db.query(`ALTER TABLE setores_censitarios_sc ADD COLUMN IF NOT EXISTS pct_criancas NUMERIC`);
const M = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: "latin1" }) });
let i = 0;
for await (const l of rl) { if (i++ === 0) continue; if (!l.startsWith(`"${UFC}`)) continue; const c = l.split(";"); const cd = uq(c[0]); const tot = nI(c[1]); const cri = nI(c[26]) + nI(c[27]) + nI(c[28]); const pct = tot > 0 ? Math.round((cri / tot) * 1000) / 10 : 0; M.set(cd, pct); }
const rows = [...M.entries()];
for (let k = 0; k < rows.length; k += 500) { const chunk = rows.slice(k, k + 500); const vals = [], ph = []; chunk.forEach((r, j) => { const b = j * 2; ph.push(`($${b+1},$${b+2}::numeric)`); vals.push(r[0], r[1]); }); await db.query(`UPDATE setores_censitarios_sc s SET pct_criancas=v.p FROM (VALUES ${ph.join(",")}) AS v(cs,p) WHERE s.cod_setor=v.cs`, vals); }
const muns = (await db.query(`SELECT cod_ibge FROM setores_geo_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows.map(r => r.cod_ibge);
let upd = 0;
for (const mun of muns) { const g = (await db.query(`SELECT geojson FROM setores_geo_sc WHERE cod_ibge=$1`, [mun])).rows[0].geojson; const fc = typeof g === "string" ? JSON.parse(g) : g; for (const f of fc.features) { f.properties.pctCriancas = M.get(f.properties.cd) ?? 0; } await db.query(`UPDATE setores_geo_sc SET geojson=$2 WHERE cod_ibge=$1`, [mun, JSON.stringify(fc)]); upd++; }
const c = (await db.query(`SELECT count(*) n, round(avg(pct_criancas),1) m FROM setores_censitarios_sc WHERE cod_ibge LIKE '${UFC}%' AND pct_criancas IS NOT NULL`)).rows[0];
console.log(`✔ crianças por setor: ${c.n} setores com % crianças (média ${c.m}%) · geojson atualizado em ${upd} municípios`);
await db.end();
