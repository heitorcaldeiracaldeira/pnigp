// Geocodifica os equipamentos do SUAS (CadSUAS só tem endereço, não lat/lon) via Nominatim/OSM.
// Respeita a política do Nominatim: 1 req/seg, User-Agent identificado. Idempotente/resumível.
//   node scripts/geocode_equipamentos_suas.mjs   (env: REFRESH=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UA = "pnigp-i10/1.0 (institutoi10; i10.ai@i10.org.br)";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// "RUA Julio Moura, 66, Centro, CEP: 88.020-150, FLORIANOPOLIS/SC" → query limpa p/ o Nominatim
function montarQuery(endereco, municipio) {
  let e = String(endereco || "").replace(/CEP:\s*[\d.\-]+/i, "").replace(/,\s*,/g, ",").trim().replace(/[,\s]+$/, "");
  if (!/\/SC|santa catarina/i.test(e)) e += `, ${municipio}, SC`;
  return `${e}, Brasil`;
}
async function geocode(q) {
  for (let t = 0; t < 3; t++) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (t + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      if (Array.isArray(j) && j[0]) return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
      return { lat: null, lon: null }; // sem resultado
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  for (const c of ["latitude DOUBLE PRECISION", "longitude DOUBLE PRECISION", "geo_em timestamptz"]) await db.query(`ALTER TABLE equipamentos_suas_sc ADD COLUMN IF NOT EXISTS ${c}`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const cond = process.env.REFRESH ? "WHERE endereco IS NOT NULL" : "WHERE endereco IS NOT NULL AND geo_em IS NULL";
  const alvo = (await db.query(`SELECT codigo_cadsuas, endereco, municipio FROM equipamentos_suas_sc ${cond} ORDER BY codigo_cadsuas`)).rows;
  console.log(`geocodificando ${alvo.length} equipamentos (Nominatim · 1 req/s)`);
  let ok = 0, sem = 0, falha = 0, i = 0;
  for (const u of alvo) {
    const inicio = Date.now();
    const r = await geocode(montarQuery(u.endereco, u.municipio));
    if (r === null) { falha++; }
    else {
      await q(`UPDATE equipamentos_suas_sc SET latitude=$2, longitude=$3, geo_em=now() WHERE codigo_cadsuas=$1`, [u.codigo_cadsuas, r.lat, r.lon]);
      if (r.lat != null) ok++; else sem++;
    }
    if (++i % 100 === 0) console.log(`  …${i}/${alvo.length} (${ok} c/ coordenada)`);
    const gasto = Date.now() - inicio;
    if (gasto < 1100) await sleep(1100 - gasto); // 1 req/seg
  }
  const cob = await db.query(`SELECT count(*) total, count(latitude) com_geo FROM equipamentos_suas_sc`);
  console.log(`Geocode concluído: ${ok} ok · ${sem} sem coordenada · ${falha} falhas · ${JSON.stringify(cob.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
