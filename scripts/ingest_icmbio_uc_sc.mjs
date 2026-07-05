// ETL — ICMBio/CNUC Unidades de Conservação por município (via interseção PostGIS). Fonte: MMA CNUC (WFS INDE).
// Busca UCs que tocam SC (geojson WFS), carrega no PostGIS e intersecta com municipios_geo → área protegida e % do território por município.
// node scripts/ingest_icmbio_uc_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SANTA CATARINA";
const LAYER = process.env.LAYER || "MMA:cnuc_2026_03";

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const dir = process.env.DIR || os.tmpdir();
  const gj = path.join(dir, "cnuc_sc.geojson");
  if (!fs.existsSync(gj) || fs.statSync(gj).size < 1e4) {
    const cql = encodeURIComponent(`uf LIKE '%${UF}%'`);
    const url = `https://geoservicos.inde.gov.br/geoserver/MMA/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=${encodeURIComponent(LAYER)}&outputFormat=application/json&CQL_FILTER=${cql}`;
    console.log("baixando UCs (WFS geojson)…");
    execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", gj, url], { stdio: "ignore" });
  }
  const fc = JSON.parse(fs.readFileSync(gj, "utf8"));
  const feats = (fc.features || []).filter((f) => f.geometry);
  console.log(`UCs carregadas: ${feats.length}`);

  await db.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
  await db.query(`DROP TABLE IF EXISTS uc_stg`);
  await db.query(`CREATE TABLE uc_stg (id SERIAL PRIMARY KEY, nome TEXT, esfera TEXT, categoria TEXT, geom geometry)`);
  for (const f of feats) {
    const p = f.properties || {};
    await db.query(`INSERT INTO uc_stg (nome, esfera, categoria, geom) VALUES ($1,$2,$3, ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)))`,
      [p.nome_uc || null, p.esfera || null, p.categoria || null, JSON.stringify(f.geometry)]).catch(() => {});
  }
  await db.query(`CREATE INDEX ON uc_stg USING GIST (geom)`);

  await db.query(`CREATE TABLE IF NOT EXISTS icmbio_uc_sc (cod_ibge TEXT PRIMARY KEY, n_ucs INTEGER, area_uc_ha NUMERIC, pct_territorio NUMERIC, maior_uc TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE icmbio_uc_sc`);
  // interseção: área protegida por município + % do território. SRID municipios_geo assumido 4674/4326 compatível.
  const rows = (await db.query(`
    WITH inter AS (
      SELECT m.cod_ibge,
        ST_Area(ST_Intersection(ST_MakeValid(m.geom), u.geom)::geography) a_m2,
        ST_Area(m.geom::geography) mun_m2, u.nome
      FROM municipios_geo m JOIN uc_stg u ON ST_Intersects(m.geom, u.geom)
    )
    SELECT cod_ibge, count(*) n_ucs, sum(a_m2)/10000 area_ha,
      LEAST(100, sum(a_m2)/max(mun_m2)*100) pct,
      (array_agg(nome ORDER BY a_m2 DESC))[1] maior
    FROM inter WHERE a_m2 > 0 GROUP BY cod_ibge`)).rows;
  for (const r of rows) {
    await db.query(`INSERT INTO icmbio_uc_sc (cod_ibge,n_ucs,area_uc_ha,pct_territorio,maior_uc,atualizado) VALUES ($1,$2,$3,$4,$5,now())`,
      [r.cod_ibge, r.n_ucs, Math.round(r.area_ha), Number(r.pct).toFixed(1), r.maior]);
  }
  await db.query(`DROP TABLE uc_stg`);
  const chk = (await db.query(`SELECT count(*) m, round(sum(area_uc_ha)) ha, round(avg(pct_territorio),1) p FROM icmbio_uc_sc`)).rows[0];
  console.log(`✔ icmbio_uc_sc: ${chk.m} municípios com UC · ${Number(chk.ha).toLocaleString("pt-BR")} ha protegidos · ${chk.p}% do território (média)`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
