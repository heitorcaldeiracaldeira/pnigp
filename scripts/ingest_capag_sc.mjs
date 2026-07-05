// ETL — STN CAPAG (Capacidade de Pagamento) por município. Fonte: Tesouro Transparente (CKAN, XLSX).
// Nota A/B/C/D (elegibilidade a crédito com garantia da União) + 3 indicadores: endividamento, poupança corrente, liquidez.
// node scripts/ingest_capag_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CKAN = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=capag-municipios";
const nn = (v) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(3) : null; };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  const xp = path.join(dir, "capag.xlsx");
  if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e5) {
    const j = JSON.parse(execFileSync("curl", ["-s", "-L", "--max-time", "40", "-A", "Mozilla/5.0", CKAN], { encoding: "utf8" }));
    const res = (j.result?.resources || []).filter((r) => /xls/i.test(r.format));
    execFileSync("curl", ["-s", "-L", "--max-time", "90", "-A", "Mozilla/5.0", "-o", xp, res[res.length - 1].url], { stdio: "ignore" });
  }
  const wb = XLSX.readFile(xp);
  const ws = wb.Sheets["Prévia da CAPAG"] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const M = new Map();
  for (const r of rows) {
    const cod = String(r[0] || "").trim(); if (!byCod.has(cod)) continue;
    if (String(r[2] || "").trim().toUpperCase() !== UF) continue;
    // Prévia da CAPAG: 0=cod,1=nome,2=uf,3=NOTA,4=endiv,5=nota_endiv,6=poup,7=nota_poup,8=liq,9=nota_liq
    M.set(cod, { nota: String(r[3] || "").trim().toUpperCase().slice(0, 1), endiv: nn(r[4]), endiv_nota: String(r[5] || "").trim().slice(0, 1), poup: nn(r[6]), poup_nota: String(r[7] || "").trim().slice(0, 1), liq: nn(r[8]), liq_nota: String(r[9] || "").trim().slice(0, 1) });
  }

  await db.query(`CREATE TABLE IF NOT EXISTS capag_sc (cod_ibge TEXT PRIMARY KEY, nota TEXT, endividamento NUMERIC, endiv_nota TEXT, poupanca NUMERIC, poup_nota TEXT, liquidez NUMERIC, liq_nota TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE capag_sc`);
  for (const [cod, d] of M) {
    if (!/^[ABCD]$/.test(d.nota)) continue;
    await db.query(`INSERT INTO capag_sc (cod_ibge,nota,endividamento,endiv_nota,poupanca,poup_nota,liquidez,liq_nota,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [cod, d.nota, d.endiv, d.endiv_nota, d.poup, d.poup_nota, d.liq, d.liq_nota]);
  }
  const chk = (await db.query(`SELECT nota, count(*) n FROM capag_sc GROUP BY nota ORDER BY nota`)).rows;
  console.log(`✔ capag_sc: ${chk.reduce((s, r) => s + Number(r.n), 0)} municípios · ` + chk.map((r) => `${r.nota}:${r.n}`).join(" "));
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
