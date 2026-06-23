// ETL — Georreferência dos entes: centroide (lat/long), área (km²) e recortes regionais (meso/micro/região)
// por município. Fonte: IBGE (malhas v4 /metadados + localidades). Base p/ análise de custo logístico (frete)
// e variação de preço entre regiões/estados. State-agnostic. Uso: UF=PR node scripts/ingest_geo_entes_sc.mjs
//
// PONTO DE ATENÇÃO (a estudar): além de distância/frete, a COMPOSIÇÃO TRIBUTÁRIA — sobretudo o ICMS, que
// varia entre os estados (alíquotas internas e ST) — é fator relevante de variação de preço inter-estadual.
// Quando formos explicar diferenças de preço Estado×Nacional, separar o efeito logístico do efeito tributário.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { SG_UF, COD_ESTADO, NOME_ESTADO } from "./_uf.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const get = async (u) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(40000) }); if (r.ok) return await r.json(); } catch {} await sleep(1200 * (t + 1)); } return null; };
const IBGE = "https://servicodados.ibge.gov.br/api";

// centroide + área via malhas v4 /metadados (oficial); retorna [{centroide:{longitude,latitude}, area:{dimensao}}]
async function geoDe(cod, nivel = "municipios") {
  const j = await get(`${IBGE}/v4/malhas/${nivel}/${cod}/metadados`);
  const m = Array.isArray(j) ? j[0] : null;
  if (!m || !m.centroide) return null;
  return { lat: Number(m.centroide.latitude), lon: Number(m.centroide.longitude), area: m.area ? Number(m.area.dimensao) : null };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  for (const c of ["latitude double precision", "longitude double precision", "area_km2 numeric",
    "mesorregiao text", "microrregiao text", "regiao_intermediaria text", "regiao text", "geo_atualizado_em timestamptz"])
    await db.query(`ALTER TABLE entes_sc ADD COLUMN IF NOT EXISTS ${c}`);

  // 1) recortes regionais (uma chamada) — meso/micro/região por município
  const muns = await get(`${IBGE}/v1/localidades/estados/${COD_ESTADO}/municipios`);
  if (!muns) { console.error("falha IBGE localidades"); process.exit(1); }
  const reg = new Map();
  for (const m of muns) {
    reg.set(String(m.id), {
      meso: m.microrregiao?.mesorregiao?.nome ?? null,
      micro: m.microrregiao?.nome ?? null,
      interm: m["regiao-imediata"]?.["regiao-intermediaria"]?.nome ?? null,
      regiao: m.microrregiao?.mesorregiao?.UF?.regiao?.nome ?? null,
    });
  }
  console.log(`${SG_UF}: ${muns.length} municípios — coletando centroides (IBGE malhas)…`);

  // 2) centroide+área por município, com concorrência limitada (polidez com a API)
  let ok = 0, fail = 0, i = 0;
  const CONC = 6;
  async function worker() {
    while (i < muns.length) {
      const m = muns[i++]; const cod = String(m.id);
      const g = await geoDe(cod);
      const r = reg.get(cod) || {};
      if (g) {
        await db.query(`UPDATE entes_sc SET latitude=$1, longitude=$2, area_km2=$3, mesorregiao=$4, microrregiao=$5, regiao_intermediaria=$6, regiao=$7, geo_atualizado_em=now() WHERE cod_ibge=$8`,
          [g.lat, g.lon, g.area, r.meso, r.micro, r.interm, r.regiao, cod]);
        ok++;
      } else {
        await db.query(`UPDATE entes_sc SET mesorregiao=$1, microrregiao=$2, regiao_intermediaria=$3, regiao=$4 WHERE cod_ibge=$5`,
          [r.meso, r.micro, r.interm, r.regiao, cod]);
        fail++;
      }
      if ((ok + fail) % 50 === 0) console.log(`  ${ok + fail}/${muns.length} (${ok} com centroide)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // 3) centroide do governo estadual
  const ge = await geoDe(COD_ESTADO, "estados");
  if (ge) await db.query(`UPDATE entes_sc SET latitude=$1, longitude=$2, area_km2=$3, regiao=$4, geo_atualizado_em=now() WHERE cod_ibge=$5`,
    [ge.lat, ge.lon, ge.area, reg.values().next().value?.regiao ?? null, COD_ESTADO]);

  const chk = (await db.query(`SELECT count(*) FILTER (WHERE latitude IS NOT NULL) com, count(*) tot FROM entes_sc WHERE uf=$1`, [SG_UF])).rows[0];
  console.log(`geo ${SG_UF}: ${ok} centroides OK · ${fail} sem malha · entes com lat/long: ${chk.com}/${chk.tot}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
