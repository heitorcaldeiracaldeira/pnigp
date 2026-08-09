// Extrai a malha (polígonos) dos setores censitários do GPKG do IBGE → GeoJSON por município (simplificado) + densidade. Base do mapa choropleth intraurbano.
import fs from "fs"; import pg from "pg"; import initSqlJs from "sql.js"; import wkx from "wkx";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
// Sem argumento, BUSCA sozinho a malha do IBGE (versão mais recente, por UF). Ver baixa_setores_ibge.mjs.
const { garanteArquivo } = await import("./baixa_setores_ibge.mjs");
const GPKG = process.argv[2] || await garanteArquivo("gpkg");
const P = 5; // casas decimais (~1m)
const round = (x) => Math.round(x * 10 ** P) / 10 ** P;
// arredonda + remove pontos consecutivos iguais (compressão sem lib)
const simpRing = (ring) => { const out = []; let prev = null; for (const pt of ring) { const r = [round(pt[0]), round(pt[1])]; if (!prev || r[0] !== prev[0] || r[1] !== prev[1]) out.push(r); prev = r; } if (out.length && (out[0][0] !== out[out.length-1][0] || out[0][1] !== out[out.length-1][1])) out.push(out[0]); return out; };
const simpGeom = (g) => { if (g.type === "Polygon") g.coordinates = g.coordinates.map(simpRing); else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(poly => poly.map(simpRing)); return g; };
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(GPKG));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const pgdb = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); pgdb.on("error", () => {});
// densidade por setor (do dado já ingerido)
const dens = new Map((await pgdb.query(`SELECT cod_setor, populacao, area_km2, densidade_dom FROM setores_censitarios_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows.map(r => [r.cod_setor, r]));
await pgdb.query(`CREATE TABLE IF NOT EXISTS setores_geo_sc (cod_ibge TEXT PRIMARY KEY, n_setores INT, geojson JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
await pgdb.query(`DELETE FROM setores_geo_sc WHERE cod_ibge LIKE '${UFC}%'`);
// municípios da UF no GPKG
const muns = db.exec(`SELECT DISTINCT CD_MUN FROM SC_setores_CD2022 WHERE CD_MUN LIKE '${UFC}%' ORDER BY CD_MUN`)[0].values.map(r => r[0]);
const parseGeom = (blob) => { const flags = blob[3]; const envBytes = [0,32,48,64,48][(flags>>1)&0x07] || 0; return wkx.Geometry.parse(Buffer.from(blob.slice(8 + envBytes))).toGeoJSON(); };
let done = 0;
for (const mun of muns) {
  const stmt = db.prepare(`SELECT CD_SETOR, geom FROM SC_setores_CD2022 WHERE CD_MUN='${mun}'`);
  const feats = [];
  while (stmt.step()) { const [cd, blob] = stmt.get(); if (!blob) continue; let g; try { g = simpGeom(parseGeom(blob)); } catch { continue; } const d = dens.get(cd); const pop = d ? +d.populacao : 0; const area = d ? +d.area_km2 : 0; const densPop = area > 0 ? Math.round(pop / area) : 0; feats.push({ type: "Feature", properties: { cd: cd, pop, densPop, densDom: d ? +d.densidade_dom : 0 }, geometry: g }); }
  stmt.free();
  if (!feats.length) continue;
  const fc = { type: "FeatureCollection", features: feats };
  await pgdb.query(`INSERT INTO setores_geo_sc (cod_ibge,n_setores,geojson) VALUES ($1,$2,$3) ON CONFLICT (cod_ibge) DO UPDATE SET n_setores=EXCLUDED.n_setores,geojson=EXCLUDED.geojson,atualizado=now()`, [mun, feats.length, JSON.stringify(fc)]);
  done++; if (done % 50 === 0) console.log(`  ${done}/${muns.length} municípios...`);
}
const c = (await pgdb.query(`SELECT count(*) n, sum(n_setores) s, round(avg(pg_column_size(geojson))/1024) kb FROM setores_geo_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows[0];
console.log(`✔ setores_geo_sc: ${c.n} municípios · ${c.s} setores com polígono · ~${c.kb}KB médio/município`);
await pgdb.end();
