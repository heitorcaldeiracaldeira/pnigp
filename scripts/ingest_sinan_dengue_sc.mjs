// ETL — SINAN arboviroses (dengue) por município. Fonte: InfoDengue (Fiocruz/UFMG), que usa notificações do SINAN.
// API alertcity por geocode (IBGE7), semanal → agrega por ano: casos, incidência/100k, nível máximo de alerta.
// node scripts/ingest_sinan_dengue_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO_INI = process.env.ANO_INI || "2019"; const ANO_FIM = process.env.ANO_FIM || "2025";
const H = { "user-agent": "Mozilla/5.0" };
const get = async (geo) => { const u = `https://info.dengue.mat.br/api/alertcity?geocode=${geo}&disease=dengue&format=json&ew_start=1&ew_end=53&ey_start=${ANO_INI}&ey_end=${ANO_FIM}`; for (let t = 0; t < 3; t++) { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(40000) }); if (r.ok) return await r.json(); } catch (e) {} await new Promise((s) => setTimeout(s, 1500)); } return null; };
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge);
  await db.query(`CREATE TABLE IF NOT EXISTS sinan_dengue_sc (cod_ibge TEXT, ano INTEGER, casos INTEGER, incidencia_100k NUMERIC, nivel_max INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);

  let ok = 0, i = 0;
  for (const cod of ents) {
    i++;
    const arr = await get(cod);
    if (!arr || !arr.length) { process.stdout.write("x"); continue; }
    const byAno = new Map(); let pop = 0;
    for (const w of arr) {
      const ano = Math.floor(Number(w.SE) / 100); if (ano < +ANO_INI || ano > +ANO_FIM) continue;
      if (w.pop) pop = Number(w.pop);
      if (!byAno.has(ano)) byAno.set(ano, { casos: 0, nivel: 0 });
      const a = byAno.get(ano); a.casos += Math.round(Number(w.casos) || 0); a.nivel = Math.max(a.nivel, Number(w.nivel) || 0);
    }
    for (const [ano, a] of byAno) {
      const inc = pop > 0 ? +((a.casos / pop) * 100000).toFixed(1) : null;
      await db.query(`INSERT INTO sinan_dengue_sc (cod_ibge,ano,casos,incidencia_100k,nivel_max,atualizado) VALUES ($1,$2,$3,$4,$5,now())
        ON CONFLICT (cod_ibge,ano) DO UPDATE SET casos=EXCLUDED.casos,incidencia_100k=EXCLUDED.incidencia_100k,nivel_max=EXCLUDED.nivel_max,atualizado=now()`,
        [cod, ano, a.casos, inc, a.nivel]);
    }
    ok++; if (i % 30 === 0) process.stdout.write(`\r  ${i}/${ents.length}`);
    await sleep(150);
  }
  console.log("");
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, sum(casos) c, min(ano) mi, max(ano) ma FROM sinan_dengue_sc`)).rows[0];
  console.log(`✔ sinan_dengue_sc: ${chk.m} municípios · ${Number(chk.c).toLocaleString("pt-BR")} casos de dengue · ${chk.mi}-${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
