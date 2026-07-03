// ETL — Equipamentos de SEGURANÇA, JUSTIÇA e DEFESA CIVIL de SC, georreferenciados.
// Fonte principal: OpenStreetMap/Overpass (amenity=prison/police/fire_station + nome "Defesa Civil") → coords reais.
// Município por CENTRÓIDE MAIS PRÓXIMO (entes_sc) — rápido, sem reverse-geocode. Socioeducativo (CASE/CASEP):
// lista curada da SAP/SC, geocodificada por nome+município. node scripts/ingest_equipamentos_justica.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UA = "pnigp-i10/1.0 (institutoi10; i10.ai@i10.org.br)";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");

const SOCIOEDUCATIVO = [
  { nome: "CASE de Curitibanos", tipo: "CASE", municipio: "Curitibanos" },
  { nome: "CASE de Florianópolis", tipo: "CASE", municipio: "Florianópolis" },
  { nome: "CASE de Itajaí", tipo: "CASE", municipio: "Itajaí" },
  { nome: "CASEP de São Miguel do Oeste", tipo: "CASEP", municipio: "São Miguel do Oeste" },
  { nome: "CASE Regional de Chapecó", tipo: "CASE", municipio: "Chapecó" },
  { nome: "CASE Regional de Criciúma", tipo: "CASE", municipio: "Criciúma" },
  { nome: "CASE Regional de Joinville", tipo: "CASE", municipio: "Joinville" },
  { nome: "CASE Regional de Lages", tipo: "CASE", municipio: "Lages" },
  { nome: "CASE Regional de São José", tipo: "CASE", municipio: "São José" },
];

function classificar(tags) {
  const a = tags.amenity, nome = tags.name || "";
  if (/defesa\s*civil/i.test(nome)) return { cat: "defesa_civil", tipo: "Defesa Civil" };
  if (/guarda\s*(municipal|civil municipal|metropolitana)/i.test(nome)) return { cat: "guarda_municipal", tipo: "Guarda Municipal" };
  if (a === "prison") return /\bCASE\b|CASEP|socioeducativ/i.test(nome) ? { cat: "socioeducativo", tipo: "CASE/CASEP" } : { cat: "prisional", tipo: "Estabelecimento penal" };
  if (a === "police") return { cat: "policia", tipo: "Polícia / delegacia" };
  if (a === "fire_station") return { cat: "bombeiros", tipo: "Corpo de Bombeiros" };
  return null;
}
const hav = (la, lo, lb, ob) => { const R = 6371, t = (x) => x * Math.PI / 180; const dla = t(lb - la), dlo = t(ob - lo); const x = Math.sin(dla / 2) ** 2 + Math.cos(t(la)) * Math.cos(t(lb)) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

async function overpass() {
  const Q = `[out:json][timeout:90];area["ISO3166-2"="BR-SC"]->.sc;(nwr["amenity"="prison"](area.sc);nwr["amenity"="police"](area.sc);nwr["amenity"="fire_station"](area.sc);nwr["name"~"[Dd]efesa [Cc]ivil"](area.sc);nwr["name"~"[Gg]uarda [Mm]unicipal"](area.sc););out center tags;`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "data=" + encodeURIComponent(Q), signal: AbortSignal.timeout(90000) });
    if (r.ok) return (await r.json()).elements || [];
    await sleep(4000 * (t + 1));
  }
  throw new Error("overpass falhou");
}
async function geocodeNome(nome, municipio) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(`${nome}, ${municipio}, Santa Catarina, Brasil`)}`, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2500 * (t + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j) && j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon) } : null;
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS equipamentos_justica_sc (
    id TEXT PRIMARY KEY, cat TEXT, nome TEXT, tipo TEXT, cod_ibge TEXT, municipio TEXT,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, fonte TEXT, aprox BOOLEAN DEFAULT false, atualizado timestamptz DEFAULT now() )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const ents = (await db.query(`SELECT cod_ibge, nome, latitude, longitude FROM entes_sc WHERE tipo='M' AND uf='SC' AND latitude IS NOT NULL`)).rows.map((e) => ({ ...e, latitude: Number(e.latitude), longitude: Number(e.longitude) }));
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const centro = new Map(ents.map((e) => [e.cod_ibge, [e.latitude, e.longitude]]));
  const nearest = (lat, lon) => { let best = null, bd = Infinity; for (const e of ents) { const d = hav(lat, lon, e.latitude, e.longitude); if (d < bd) { bd = d; best = e.cod_ibge; } } return best; };
  const up = (o) => q(`INSERT INTO equipamentos_justica_sc (id,cat,nome,tipo,cod_ibge,municipio,latitude,longitude,fonte,aprox) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET cat=EXCLUDED.cat,nome=EXCLUDED.nome,tipo=EXCLUDED.tipo,cod_ibge=EXCLUDED.cod_ibge,municipio=EXCLUDED.municipio,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,fonte=EXCLUDED.fonte,aprox=EXCLUDED.aprox,atualizado=now()`,
    [o.id, o.cat, o.nome, o.tipo, o.cod_ibge, o.municipio, o.lat, o.lon, o.fonte, !!o.aprox]);

  // === OSM: prisional / polícia / bombeiros / defesa civil / (socioeducativo se tagueado) ===
  const els = await overpass();
  console.log(`OSM: ${els.length} elementos (prison/police/fire/defesa civil) em SC`);
  const cont = {};
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const c = classificar(e.tags || {});
    if (!c) continue;
    const cod = nearest(lat, lon);
    const nomeMun = ents.find((x) => x.cod_ibge === cod)?.nome || null;
    await up({ id: `osm-${e.type}-${e.id}`, cat: c.cat, nome: e.tags?.name || c.tipo, tipo: c.tipo, cod_ibge: cod, municipio: nomeMun, lat, lon, fonte: "OpenStreetMap" });
    cont[c.cat] = (cont[c.cat] || 0) + 1;
  }
  console.log(`OSM classificado: ${JSON.stringify(cont)}`);

  // === SOCIOEDUCATIVO (curado SAP/SC) ===
  let socio = 0;
  for (const u of SOCIOEDUCATIVO) {
    const cod = byName.get(norm(u.municipio));
    if (!cod) { console.log(`  [socio sem cod] ${u.municipio}`); continue; }
    const t0 = Date.now();
    let g = await geocodeNome(u.nome, u.municipio), aprox = false;
    if (!g) { const ce = centro.get(cod); if (ce) { g = { lat: ce[0], lon: ce[1] }; aprox = true; } }
    if (!g) continue;
    await up({ id: `socio-${cod}-${norm(u.nome).slice(0, 14)}`, cat: "socioeducativo", nome: u.nome, tipo: u.tipo, cod_ibge: cod, municipio: u.municipio, lat: g.lat, lon: g.lon, fonte: "SAP/SC (curado)", aprox });
    socio++;
    const gt = Date.now() - t0; if (gt < 1100) await sleep(1100 - gt);
  }
  // === GUARDA MUNICIPAL — lista oficial IBGE MUNIC (t/10027, "Com Guarda Municipal") completa o OSM esparso ===
  const jaGM = new Set((await db.query(`SELECT cod_ibge FROM equipamentos_justica_sc WHERE cat='guarda_municipal' AND cod_ibge IS NOT NULL`)).rows.map((r) => r.cod_ibge));
  const munGM = await fetch(`https://apisidra.ibge.gov.br/values/t/10027/n6/in%20n3%2042/v/603/p/last/c2010/73552`, { signal: AbortSignal.timeout(60000) }).then((r) => r.json()).catch(() => []);
  let gm = 0;
  for (const r of munGM.slice(1)) {
    if (r.V !== "1") continue; // só os municípios COM guarda municipal
    const cod = String(r.D1C);
    if (jaGM.has(cod)) continue; // já tem ponto preciso (OSM)
    const munNome = String(r.D1N).replace(/\s*\(SC\)\s*$/, "");
    const t0 = Date.now();
    let g = await geocodeNome(`Guarda Municipal de ${munNome}`, munNome), aprox = false;
    if (!g) { const ce = centro.get(cod); if (ce) { g = { lat: ce[0], lon: ce[1] }; aprox = true; } }
    if (!g) continue;
    await up({ id: `gm-munic-${cod}`, cat: "guarda_municipal", nome: `Guarda Municipal de ${munNome}`, tipo: "Guarda Municipal", cod_ibge: cod, municipio: munNome, lat: g.lat, lon: g.lon, fonte: "IBGE MUNIC (curado)", aprox });
    gm++;
    const gt = Date.now() - t0; if (gt < 1100) await sleep(1100 - gt);
  }
  console.log(`+${gm} guarda municipal curada (IBGE MUNIC)`);

  const resumo = await db.query(`SELECT cat, count(*) n, count(*) FILTER(WHERE cod_ibge IS NOT NULL) com_mun FROM equipamentos_justica_sc GROUP BY 1 ORDER BY 2 DESC`);
  console.log(`Concluído: +${socio} socioeducativo curado · por categoria: ${JSON.stringify(resumo.rows)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
