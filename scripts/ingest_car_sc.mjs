// ETL — CAR (Cadastro Ambiental Rural): nº de imóveis rurais por município de SC.
// Fonte: SICAR GeoServer WFS público (sicar:sicar_imoveis_sc), contagem via resultType=hits (sem shapefile).
// node scripts/ingest_car_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "SC").toLowerCase();
const WFS = `https://geoserver.car.gov.br/geoserver/sicar/wfs`;
const LAYER = `sicar:sicar_imoveis_${UF}`;

async function hits(cql) {
  const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAYER}&resultType=hits&CQL_FILTER=${encodeURIComponent(cql)}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw 0;
      const x = await r.text();
      const m = x.match(/numberMatched="(\d+)"/);
      if (m) return Number(m[1]);
      throw 0;
    } catch { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS car_sc (cod_ibge TEXT PRIMARY KEY, imoveis_total INT, imoveis_ativos INT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const munis = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows.map((r) => r.cod_ibge);
  console.log(`CAR/SICAR WFS — ${munis.length} municípios (${LAYER})`);
  let ok = 0, total = 0;
  for (const cod of munis) {
    const ibge = Number(cod); // WFS espera cod_municipio_ibge numérico
    const tot = await hits(`cod_municipio_ibge=${ibge}`);
    const at = await hits(`cod_municipio_ibge=${ibge} AND status_imovel='AT'`);
    if (tot == null) { console.log(`  ! ${cod} sem resposta`); continue; }
    await q(`INSERT INTO car_sc (cod_ibge,imoveis_total,imoveis_ativos) VALUES ($1,$2,$3)
             ON CONFLICT (cod_ibge) DO UPDATE SET imoveis_total=EXCLUDED.imoveis_total,imoveis_ativos=EXCLUDED.imoveis_ativos,atualizado=now()`,
      [cod, tot, at]);
    ok++; total += tot;
    if (ok % 50 === 0) console.log(`  ${ok}/${munis.length}… (${total.toLocaleString("pt-BR")} imóveis)`);
  }
  const x = (await db.query(`SELECT count(*) m, sum(imoveis_total) t, sum(imoveis_ativos) a FROM car_sc`)).rows[0];
  console.log(`Concluído: ${ok} municípios · ${Number(x.t).toLocaleString("pt-BR")} imóveis rurais no CAR (${Number(x.a).toLocaleString("pt-BR")} ativos)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
