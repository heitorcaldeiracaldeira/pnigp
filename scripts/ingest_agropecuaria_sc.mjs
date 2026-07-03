// ETL — AGRICULTURA e AGRICULTURA FAMILIAR por município (Censo Agropecuário 2017, IBGE/SIDRA).
// Recorte de agricultura familiar (Lei 11.326): nº de estabelecimentos (t/6778) + área (t/6883), por tipologia.
// node scripts/ingest_agropecuaria_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "42"; // 42 = SC (código IBGE da UF)
const numf = (v) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const tipo = (label) => /familiar\s*-\s*sim/i.test(label) ? "familiar" : /familiar\s*-\s*não/i.test(label) ? "nao_familiar" : "total";

async function sidra(url) {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw 0; const j = await r.json(); return j.slice(1); }
    catch { await new Promise((s) => setTimeout(s, 2000 * (t + 1))); }
  }
  return [];
}

async function main() {
  // estabelecimentos (6778, v183) e área (6883, v184) por tipologia (c829), demais classificações no Total
  const tipCats = "46302,46303,46304"; // Total, fam-sim, fam-não
  const urlEstab = `https://apisidra.ibge.gov.br/values/t/6778/n6/in%20n3%20${UF}/v/183/p/2017/c829/${tipCats}/c309/10969/c218/46502/c12553/46523/c12517/113601/c220/110085`;
  const urlArea = `https://apisidra.ibge.gov.br/values/t/6883/n6/in%20n3%20${UF}/v/184/p/2017/c829/${tipCats}/c222/110087/c12564/41145/c12440/110016`;
  console.log("coletando estabelecimentos (6778) e área (6883) do Censo Agropecuário 2017…");
  const [estab, area] = await Promise.all([sidra(urlEstab), sidra(urlArea)]);
  console.log(`  estab: ${estab.length} linhas · área: ${area.length} linhas`);

  // agrega por município
  const m = new Map(); // cod_ibge -> {estab_total, estab_familiar, estab_nao, area_total, area_familiar, area_nao}
  const get = (c) => m.get(c) || { et: 0, ef: 0, en: 0, at: 0, af: 0, an: 0 };
  for (const r of estab) { const c = String(r.D1C); const v = numf(r.V) || 0; const e = get(c); const t = tipo(r.D4N || ""); if (t === "total") e.et = v; else if (t === "familiar") e.ef = v; else e.en = v; m.set(c, e); }
  for (const r of area) { const c = String(r.D1C); const v = numf(r.V) || 0; const e = get(c); const t = tipo(r.D4N || ""); if (t === "total") e.at = v; else if (t === "familiar") e.af = v; else e.an = v; m.set(c, e); }

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS agropecuaria_sc (cod_ibge TEXT PRIMARY KEY, ano INT, estab_total NUMERIC, estab_familiar NUMERIC, estab_nao_familiar NUMERIC, area_total_ha NUMERIC, area_familiar_ha NUMERIC, area_nao_familiar_ha NUMERIC, atualizado timestamptz DEFAULT now())`);
  await db.query(`TRUNCATE agropecuaria_sc`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  // mapa: aceita cod_ibge 7 díg (SIDRA já vem 7 díg)
  const ent = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => r.cod_ibge));
  let ok = 0;
  for (const [c, e] of m) {
    if (!ent.has(c)) continue;
    await q(`INSERT INTO agropecuaria_sc (cod_ibge,ano,estab_total,estab_familiar,estab_nao_familiar,area_total_ha,area_familiar_ha,area_nao_familiar_ha) VALUES ($1,2017,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (cod_ibge) DO UPDATE SET estab_total=EXCLUDED.estab_total,estab_familiar=EXCLUDED.estab_familiar,estab_nao_familiar=EXCLUDED.estab_nao_familiar,area_total_ha=EXCLUDED.area_total_ha,area_familiar_ha=EXCLUDED.area_familiar_ha,area_nao_familiar_ha=EXCLUDED.area_nao_familiar_ha,atualizado=now()`,
      [c, e.et, e.ef, e.en, e.at, e.af, e.an]);
    ok++;
  }
  const t = await db.query(`SELECT count(*) m, sum(estab_total) et, sum(estab_familiar) ef, round(sum(area_familiar_ha)) af, round(sum(area_total_ha)) at FROM agropecuaria_sc`);
  const x = t.rows[0];
  console.log(`Concluído: ${ok} municípios · ${Number(x.et).toLocaleString("pt-BR")} estabelecimentos (${Number(x.ef).toLocaleString("pt-BR")} familiares = ${Math.round((x.ef / x.et) * 100)}%) · área familiar ${Number(x.af).toLocaleString("pt-BR")} de ${Number(x.at).toLocaleString("pt-BR")} ha`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
