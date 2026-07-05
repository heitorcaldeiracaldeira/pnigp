// ETL — SINAN arboviroses (dengue + zika + chikungunya) por município. Fonte: InfoDengue (Fiocruz), dados do SINAN.
// Generaliza o coletor de dengue: mesma API alertcity, param disease. Agrega por ano: casos, incidência/100k, nível máx.
// node scripts/ingest_arboviroses_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO_INI = process.env.ANO_INI || "2019"; const ANO_FIM = process.env.ANO_FIM || "2025";
const DOENCAS = ["dengue", "zika", "chikungunya"];
const H = { "user-agent": "Mozilla/5.0" };
const get = async (geo, dis) => { const u = `https://info.dengue.mat.br/api/alertcity?geocode=${geo}&disease=${dis}&format=json&ew_start=1&ew_end=53&ey_start=${ANO_INI}&ey_end=${ANO_FIM}`; for (let t = 0; t < 3; t++) { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(40000) }); if (r.ok) return await r.json(); } catch (e) {} await new Promise((s) => setTimeout(s, 1200)); } return null; };
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge);
  await db.query(`CREATE TABLE IF NOT EXISTS arboviroses_sc (cod_ibge TEXT, doenca TEXT, ano INTEGER, casos INTEGER, incidencia_100k NUMERIC, nivel_max INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, doenca, ano))`);

  let i = 0;
  for (const cod of ents) {
    i++;
    for (const dis of DOENCAS) {
      const arr = await get(cod, dis);
      if (!arr || !arr.length) continue;
      const byAno = new Map(); let pop = 0;
      for (const w of arr) {
        const ano = Math.floor(Number(w.SE) / 100); if (ano < +ANO_INI || ano > +ANO_FIM) continue;
        if (w.pop) pop = Number(w.pop);
        if (!byAno.has(ano)) byAno.set(ano, { casos: 0, nivel: 0 });
        const a = byAno.get(ano); a.casos += Math.round(Number(w.casos) || 0); a.nivel = Math.max(a.nivel, Number(w.nivel) || 0);
      }
      for (const [ano, a] of byAno) {
        const inc = pop > 0 ? +((a.casos / pop) * 100000).toFixed(1) : null;
        await db.query(`INSERT INTO arboviroses_sc (cod_ibge,doenca,ano,casos,incidencia_100k,nivel_max,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now())
          ON CONFLICT (cod_ibge,doenca,ano) DO UPDATE SET casos=EXCLUDED.casos,incidencia_100k=EXCLUDED.incidencia_100k,nivel_max=EXCLUDED.nivel_max,atualizado=now()`,
          [cod, dis, ano, a.casos, inc, a.nivel]);
      }
      await sleep(60);
    }
    if (i % 30 === 0) process.stdout.write(`\r  ${i}/${ents.length}`);
  }
  console.log("");
  const chk = (await db.query(`SELECT doenca, sum(casos) c, count(distinct cod_ibge) m FROM arboviroses_sc GROUP BY doenca ORDER BY 2 DESC`)).rows;
  chk.forEach((r) => console.log(`✔ ${r.doenca}: ${Number(r.c).toLocaleString("pt-BR")} casos · ${r.m} municípios`));
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
