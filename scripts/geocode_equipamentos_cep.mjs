// Fallback de geocodificação por CEP — para os equipamentos do SUAS cujo endereço completo o Nominatim
// não encontrou. CEP→coordenada via AwesomeAPI (cep.awesomeapi.com.br). Marca geo_fonte='cep' (aproximado,
// nível CEP — honesto: onde o CEP é geral o ponto cai no centro da localidade). Idempotente.
//   node scripts/geocode_equipamentos_cep.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONC = Number(process.env.CONC || 6);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function cepCoord(cep) {
  const d = String(cep || "").replace(/\D/g, "");
  if (d.length !== 8) return { ok: true, vazio: true };
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://cep.awesomeapi.com.br/json/${d}`, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (t + 1)); continue; }
      if (!r.ok) return { ok: true, vazio: true };
      const j = await r.json();
      const lat = j.lat != null ? Number(j.lat) : null, lon = j.lng != null ? Number(j.lng) : null;
      if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) return { ok: true, lat, lon };
      return { ok: true, vazio: true };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return { ok: false };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true });
  db.on("error", () => {});
  await db.query(`ALTER TABLE equipamentos_suas_sc ADD COLUMN IF NOT EXISTS geo_fonte TEXT`);
  // os que já têm coordenada por endereço viram fonte 'endereco' (precisa)
  await db.query(`UPDATE equipamentos_suas_sc SET geo_fonte='endereco' WHERE latitude IS NOT NULL AND geo_fonte IS NULL`).catch(() => {});
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const alvo = (await db.query(`SELECT codigo_cadsuas, cep FROM equipamentos_suas_sc WHERE latitude IS NULL AND cep IS NOT NULL AND geo_em IS NOT NULL ORDER BY codigo_cadsuas`)).rows;
  console.log(`fallback CEP p/ ${alvo.length} unidades sem coordenada (AwesomeAPI · CONC=${CONC})`);
  let ok = 0, sem = 0, falha = 0, i = 0;
  async function worker() {
    while (i < alvo.length) {
      const u = alvo[i++];
      const r = await cepCoord(u.cep);
      if (!r.ok) { falha++; continue; }
      if (r.lat != null) { await q(`UPDATE equipamentos_suas_sc SET latitude=$2, longitude=$3, geo_fonte='cep' WHERE codigo_cadsuas=$1`, [u.codigo_cadsuas, r.lat, r.lon]); ok++; }
      else sem++;
      if ((ok + sem) % 100 === 0) console.log(`  …${ok + sem}/${alvo.length} (${ok} resolvidos por CEP)`);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const cob = await db.query(`SELECT count(*) total, count(latitude) com_geo, count(*) FILTER (WHERE geo_fonte='endereco') por_endereco, count(*) FILTER (WHERE geo_fonte='cep') por_cep FROM equipamentos_suas_sc`);
  console.log(`Fallback CEP concluído: ${ok} resolvidos · ${sem} sem coord · ${falha} falhas · ${JSON.stringify(cob.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
