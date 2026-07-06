// ETL — Cobertura vacinal por município e vacina, SÉRIE COMPLETA 2015-2026. Fonte: SI-PNI / LocalizaSUS (medida oficial de cobertura, RNDS).
// Extraído do engine Qlik do painel oficial "Cobertura Vacinal - Calendário Nacional - Residência" via medida com set analysis {1<...>}
// que ignora o filtro de ano travado do painel. CSV: cod6;vacina;ano;cobertura(fração). node scripts/ingest_cobertura_vacinal_final.mjs
import fs from "fs"; import path from "path"; import os from "os"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CSV = process.env.CSV || path.join(process.env.DIR || os.tmpdir(), "vacina_completa.csv");
// whitelist das vacinas do calendário infantil + rótulo limpo (Qlik → limpo). Ignora variantes redundantes.
const KEEP = { "BCG": "BCG", "Penta (DTP/HepB/Hib)": "Penta", "Polio Injetável (VIP)": "Poliomielite", "Pneumocócica Conjugada": "Pneumocócica", "Meningo C": "Meningocócica C", "Rotavírus": "Rotavírus", "Febre Amarela": "Febre Amarela", "Tríplice Viral - 1° Dose": "Tríplice Viral D1", "Tríplice Viral - 2° Dose": "Tríplice Viral D2", "Hepatite A Infantil": "Hepatite A", "DTP (1° Reforço)": "DTP (reforço)", "Hepatite B (< 30 Dias)": "Hepatite B (≤30 dias)", "Varicela": "Varicela" };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const rows = [];
  for (const l of fs.readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean)) {
    const [cod6, vacRaw, ano, frac] = l.split(";");
    const vacina = KEEP[vacRaw]; if (!vacina) continue;
    const cod = by6.get(cod6); if (!cod) continue;
    const cob = Math.round(parseFloat(frac) * 1000) / 10; if (!Number.isFinite(cob)) continue;
    rows.push([cod, +ano, vacina, Math.min(cob, 300)]);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS cobertura_vacinal_sc (cod_ibge TEXT, ano INTEGER, vacina TEXT, cobertura NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, vacina))`);
  await db.query(`TRUNCATE cobertura_vacinal_sc`);
  for (let i = 0; i < rows.length; i += 500) { const chunk = rows.slice(i, i + 500); const vals = chunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4},now())`).join(","); await db.query(`INSERT INTO cobertura_vacinal_sc (cod_ibge,ano,vacina,cobertura,atualizado) VALUES ${vals} ON CONFLICT (cod_ibge,ano,vacina) DO UPDATE SET cobertura=EXCLUDED.cobertura`, chunk.flat()); }
  const chk = (await db.query(`SELECT min(ano) mi, max(ano) ma, count(distinct cod_ibge) m, count(distinct vacina) v FROM cobertura_vacinal_sc`)).rows[0];
  console.log(`✔ cobertura_vacinal_sc: ${rows.length} linhas · ${chk.mi}-${chk.ma} · ${chk.m} municípios · ${chk.v} vacinas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
