// ETL — Cobertura vacinal MODERNA por município e vacina (SI-PNI, fonte RNDS), série 2015-2026.
// Fonte: painel oficial LocalizaSUS/Qlik "Cobertura Vacinal - Calendário Nacional - Residência" (medida oficial Cobertura, extraída via engine Qlik).
// CSV coletado em scratchpad: cod6;vacina;ano;cobertura(fração). node scripts/ingest_cobertura_vacinal_moderna_sc.mjs
import fs from "fs"; import path from "path"; import os from "os"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CSV = process.env.CSV || path.join(process.env.DIR || os.tmpdir(), "vacina_moderna.csv");
// nomes do painel → rótulos limpos
const NOME = { "Penta (DTP/HepB/Hib)": "Penta", "Polio Injetável (VIP)": "Poliomielite", "Pneumocócica Conjugada": "Pneumocócica", "Tríplice Viral - 1° Dose": "Tríplice Viral D1", "Tríplice Viral - 2° Dose": "Tríplice Viral D2", "Hepatite B (< 30 Dias)": "Hepatite B (≤30 dias)", "DTP (1° Reforço)": "DTP (reforço)", "Hepatite A Infantil": "Hepatite A", "Meningo C": "Meningocócica C" };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const linhas = fs.readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const l of linhas) {
    const [cod6, vacRaw, ano, cobFrac] = l.split(";");
    const cod = by6.get(cod6); if (!cod) continue;
    const vacina = NOME[vacRaw] || vacRaw;
    const cob = Math.round(parseFloat(cobFrac) * 1000) / 10; // fração→% com 1 casa
    if (!Number.isFinite(cob)) continue;
    rows.push([cod, +ano, vacina, Math.min(cob, 300)]);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cobertura_vacinal_sc (cod_ibge TEXT, ano INTEGER, vacina TEXT, cobertura NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, vacina))`);
  await db.query(`TRUNCATE cobertura_vacinal_sc`);
  for (let i = 0; i < rows.length; i += 500) { const chunk = rows.slice(i, i + 500); const vals = chunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4},now())`).join(","); await db.query(`INSERT INTO cobertura_vacinal_sc (cod_ibge,ano,vacina,cobertura,atualizado) VALUES ${vals} ON CONFLICT (cod_ibge,ano,vacina) DO UPDATE SET cobertura=EXCLUDED.cobertura, atualizado=now()`, chunk.flat()); }
  const chk = (await db.query(`SELECT max(ano) ma, min(ano) mi, count(distinct cod_ibge) m, count(distinct vacina) v FROM cobertura_vacinal_sc`)).rows[0];
  console.log(`✔ cobertura_vacinal_sc: ${rows.length} linhas · ${chk.mi}-${chk.ma} · ${chk.m} municípios · ${chk.v} vacinas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
