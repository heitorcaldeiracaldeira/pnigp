// ETL — INPE PRODES (desmatamento) por município. Fonte: terrabrasilis WFS (yearly_deforestation, Mata Atlântica).
// Os polígonos têm state+year+area_km mas NÃO município → interseção espacial via PostGIS (centróide do polígono
// dentro da malha municipal IBGE). Capacidade geo reutilizável. node scripts/ingest_prodes_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC"; const UF_COD = process.env.UF_COD || "42";
const H = { "user-agent": "Mozilla/5.0" };
const WFS = "https://terrabrasilis.dpi.inpe.br/geoserver/prodes-mata-atlantica-nb/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=prodes-mata-atlantica-nb:yearly_deforestation&outputFormat=application/json";
const getj = async (u) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(90000) }); if (r.ok) return await r.json(); } catch (e) {} await new Promise((s) => setTimeout(s, 2000)); } return null; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  await db.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

  // === malha municipal IBGE (só uma vez por UF) ===
  const jaMalha = (await db.query(`SELECT count(*) n FROM information_schema.tables WHERE table_name='municipios_geo'`)).rows[0].n > 0
    && (await db.query(`SELECT count(*) n FROM municipios_geo WHERE left(cod_ibge,2)=$1`, [UF_COD]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n > 0;
  if (!jaMalha) {
    console.log("carregando malha municipal IBGE…");
    await db.query(`CREATE TABLE IF NOT EXISTS municipios_geo (cod_ibge TEXT PRIMARY KEY, geom geometry(MultiPolygon,4326))`);
    const malha = await getj(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${UF_COD}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria`);
    for (const f of malha.features) {
      await db.query(`INSERT INTO municipios_geo (cod_ibge,geom) VALUES ($1, ST_Multi(ST_GeomFromGeoJSON($2))) ON CONFLICT (cod_ibge) DO UPDATE SET geom=EXCLUDED.geom`, [f.properties.codarea, JSON.stringify(f.geometry)]);
    }
    await db.query(`CREATE INDEX IF NOT EXISTS municipios_geo_gix ON municipios_geo USING GIST (geom)`);
    console.log(`  malha: ${malha.features.length} municípios`);
  }

  // === polígonos PRODES do estado (WFS paginado) → staging ===
  await db.query(`DROP TABLE IF EXISTS prodes_stg`);
  await db.query(`CREATE TABLE prodes_stg (ano INTEGER, area_km DOUBLE PRECISION, geom geometry(Geometry,4326))`);
  let start = 0, tot = 0; const PAGE = 8000;
  for (;;) {
    const j = await getj(`${WFS}&CQL_FILTER=state=%27${UF}%27&count=${PAGE}&startIndex=${start}`);
    const feats = j?.features || []; if (!feats.length) break;
    for (let i = 0; i < feats.length; i += 400) {
      const chunk = feats.slice(i, i + 400);
      const vals = [], params = []; let k = 1;
      for (const f of chunk) { if (!f.geometry) continue; vals.push(`($${k++},$${k++},ST_GeomFromGeoJSON($${k++}))`); params.push(f.properties.year, f.properties.area_km, JSON.stringify(f.geometry)); }
      if (vals.length) await db.query(`INSERT INTO prodes_stg (ano,area_km,geom) VALUES ${vals.join(",")}`, params);
    }
    tot += feats.length; start += PAGE; process.stdout.write(`\r  PRODES carregados: ${tot}`);
    if (feats.length < PAGE) break;
  }
  console.log("");
  await db.query(`CREATE INDEX prodes_stg_gix ON prodes_stg USING GIST (geom)`);

  // === interseção: centróide do polígono dentro do município ===
  await db.query(`CREATE TABLE IF NOT EXISTS prodes_sc (cod_ibge TEXT, ano INTEGER, area_km2 NUMERIC, n_poligonos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`DELETE FROM prodes_sc WHERE left(cod_ibge,2)=$1`, [UF_COD]);
  await db.query(`INSERT INTO prodes_sc (cod_ibge,ano,area_km2,n_poligonos,atualizado)
    SELECT m.cod_ibge, p.ano, round(sum(p.area_km)::numeric,3), count(*), now()
    FROM prodes_stg p JOIN municipios_geo m ON ST_Contains(m.geom, ST_Centroid(p.geom))
    GROUP BY m.cod_ibge, p.ano`);
  await db.query(`DROP TABLE IF EXISTS prodes_stg`);

  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, min(ano) mi, max(ano) ma, round(sum(area_km2),1) km FROM prodes_sc WHERE left(cod_ibge,2)=$1`, [UF_COD])).rows[0];
  console.log(`✔ prodes_sc: ${chk.m} municípios · ${chk.mi}-${chk.ma} · ${chk.km} km² desmatados (total)`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
