// ETL — SINESP/SENASP Vítimas de crimes violentos letais por município. Fonte: dados abertos Min. Justiça (SINESP), xlsx (1 aba/UF).
// DADOS ABERTOS AGREGADOS (autorizado). Vítimas por município/mês → agrega por ano + série. Cód_IBGE 7 díg direto.
// node scripts/ingest_sinesp_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const XURL = "https://dados.mj.gov.br/dataset/210b9ae2-21fc-4986-89c6-2006eb4db247/resource/03af7ce2-174e-4ebd-b085-384503cfb40f/download/indicadoressegurancapublicamunic.xlsx";
const serial2ano = (s) => { const n = Number(s); if (!Number.isFinite(n) || n < 20000) return 0; return new Date(Math.round((n - 25569) * 86400000)).getUTCFullYear(); };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  const xp = path.join(dir, "sinesp_mun.xlsx");
  if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e5) { console.log("baixando SINESP (~10MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", xp, XURL], { stdio: "ignore" }); }
  const wb = XLSX.readFile(xp);
  if (!wb.Sheets[UF]) { console.log(`⚠ aba ${UF} não existe`); await db.end(); return; }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[UF], { header: 1, defval: "" });
  const H = rows[0].map((c) => String(c)); const ic = H.findIndex((h) => /IBGE/i.test(h)), ima = H.findIndex((h) => /M.s.Ano/i.test(h)), iv = H.findIndex((h) => /V.timas|Ocorr/i.test(h));

  const M = new Map(); // cod -> Map(ano -> vitimas)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const cod = String(r[ic] || "").trim(); if (!byCod.has(cod)) continue;
    const ano = serial2ano(r[ima]); if (!ano) continue;
    const v = Number(r[iv]) || 0;
    if (!M.has(cod)) M.set(cod, new Map());
    const mm = M.get(cod); mm.set(ano, (mm.get(ano) || 0) + v);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sinesp_vitimas_sc (cod_ibge TEXT PRIMARY KEY, vitimas_total INTEGER, ano_ini INTEGER, ano_fim INTEGER, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, mm] of M) {
    const anos = [...mm.entries()].sort((a, b) => a[0] - b[0]);
    const serie = anos.map(([ano, valor]) => ({ ano, valor }));
    const tot = anos.reduce((s, [, v]) => s + v, 0);
    await db.query(`INSERT INTO sinesp_vitimas_sc (cod_ibge,vitimas_total,ano_ini,ano_fim,serie,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET vitimas_total=EXCLUDED.vitimas_total,ano_ini=EXCLUDED.ano_ini,ano_fim=EXCLUDED.ano_fim,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, tot, anos[0]?.[0] || null, anos[anos.length - 1]?.[0] || null, JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(vitimas_total) v, min(ano_ini) mi, max(ano_fim) ma FROM sinesp_vitimas_sc`)).rows[0];
  console.log(`✔ sinesp_vitimas_sc: ${chk.m} municípios · ${Number(chk.v).toLocaleString("pt-BR")} vítimas (crimes violentos letais) · ${chk.mi}-${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
