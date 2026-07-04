// ETL — Equipamentos ESPORTIVOS públicos de SC, georreferenciados. Fonte: OpenStreetMap/Overpass
// (leisure=pitch/sports_centre/stadium/track/fitness_station) → coords reais. Município por centróide mais próximo.
// Alimenta o mapa (camada "esporte") + a seção Equipamentos na aba Esporte. node scripts/ingest_equipamentos_esporte_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UA = "pnigp-i10/1.0 (institutoi10; i10.ai@i10.org.br)";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const hav = (la, lo, lb, ob) => { const R = 6371, t = (x) => x * Math.PI / 180; const dla = t(lb - la), dlo = t(ob - lo); const x = Math.sin(dla / 2) ** 2 + Math.cos(t(la)) * Math.cos(t(lb)) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

function classificar(tags) {
  const l = tags.leisure, sport = tags.sport || "";
  if (l === "sports_centre") return "Centro esportivo / ginásio";
  if (l === "stadium") return "Estádio";
  if (l === "track") return "Pista (atletismo)";
  if (l === "fitness_station") return "Academia ao ar livre";
  if (l === "fitness_centre") return "Academia";
  if (l === "pitch") { if (/soccer|football/i.test(sport)) return "Campo de futebol"; if (/basketball|volleyball|futsal|handball|multi/i.test(sport)) return "Quadra poliesportiva"; if (/tennis/i.test(sport)) return "Quadra de tênis"; return "Quadra / campo"; }
  return "Equipamento esportivo";
}

async function overpass() {
  const Q = `[out:json][timeout:120];area["ISO3166-2"="BR-SC"]->.sc;(nwr["leisure"="pitch"](area.sc);nwr["leisure"="sports_centre"](area.sc);nwr["leisure"="stadium"](area.sc);nwr["leisure"="track"](area.sc);nwr["leisure"="fitness_station"](area.sc);nwr["leisure"="fitness_centre"](area.sc););out center tags;`;
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "data=" + encodeURIComponent(Q), signal: AbortSignal.timeout(120000) });
      if (r.ok) return (await r.json()).elements || []; } catch (e) {}
    await sleep(5000 * (t + 1));
  }
  throw new Error("overpass falhou");
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS equipamentos_esporte_sc (id TEXT PRIMARY KEY, cat TEXT, nome TEXT, tipo TEXT, cod_ibge TEXT, municipio TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, fonte TEXT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const ents = (await db.query(`SELECT cod_ibge, nome, latitude, longitude FROM entes_sc WHERE tipo='M' AND uf='SC' AND latitude IS NOT NULL`)).rows.map((e) => ({ ...e, latitude: Number(e.latitude), longitude: Number(e.longitude) }));
  const nearest = (lat, lon) => { let best = null, bd = Infinity; for (const e of ents) { const d = hav(lat, lon, e.latitude, e.longitude); if (d < bd) { bd = d; best = e; } } return best; };

  const els = await overpass();
  console.log(`OSM: ${els.length} equipamentos esportivos em SC`);
  const cont = {}; let n = 0;
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const tipo = classificar(e.tags || {});
    const mun = nearest(lat, lon); if (!mun) continue;
    await q(`INSERT INTO equipamentos_esporte_sc (id,cat,nome,tipo,cod_ibge,municipio,latitude,longitude,fonte,atualizado) VALUES ($1,'esporte',$2,$3,$4,$5,$6,$7,'OpenStreetMap',now())
      ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome,tipo=EXCLUDED.tipo,cod_ibge=EXCLUDED.cod_ibge,municipio=EXCLUDED.municipio,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,atualizado=now()`,
      [`osm-${e.type}-${e.id}`, e.tags?.name || tipo, tipo, mun.cod_ibge, mun.nome, lat, lon]);
    cont[tipo] = (cont[tipo] || 0) + 1; n++;
  }
  console.log(`✔ equipamentos_esporte_sc: ${n} pontos · por tipo: ${JSON.stringify(cont)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
