// ETL — Comunidades Quilombolas Certificadas (Fundação Palmares) por município. Fonte: dados.cultura.gov.br (XLSX).
// node scripts/ingest_quilombos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const xp = path.join(dir, "quilombos.xlsx");
  if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e4) {
    const j = JSON.parse(execFileSync("curl", ["-s", "-L", "--max-time", "40", "-A", "Mozilla/5.0", "https://dados.cultura.gov.br/api/3/action/package_show?id=comunidades-quilombolas-certificadas"], { encoding: "utf8" }));
    const r = (j.result?.resources || []).find((x) => /xls/i.test(x.format));
    execFileSync("curl", ["-s", "-L", "--max-time", "60", "-A", "Mozilla/5.0", "-o", xp, r.url], { stdio: "ignore" });
  }
  const wb = XLSX.readFile(xp); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const hr = rows.findIndex((r) => r.some((c) => /MUNIC/i.test(String(c))) && r.some((c) => /^UF$/i.test(String(c).trim())));
  const H = rows[hr].map((c) => String(c).trim()); const iu = H.findIndex((h) => /^UF$/i.test(h)), im = H.findIndex((h) => /MUNIC/i.test(h)), ic = H.findIndex((h) => /COMUNIDADE/i.test(h));
  const M = new Map();
  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i]; if (String(r[iu]).trim().toUpperCase() !== UF) continue;
    const cod = byName.get(norm(r[im])); if (!cod) continue;
    if (!M.has(cod)) M.set(cod, []); M.get(cod).push(String(r[ic]).trim());
  }
  await db.query(`CREATE TABLE IF NOT EXISTS quilombos_sc (cod_ibge TEXT PRIMARY KEY, n_comunidades INTEGER, comunidades JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE quilombos_sc`);
  for (const [cod, coms] of M) await db.query(`INSERT INTO quilombos_sc (cod_ibge,n_comunidades,comunidades,atualizado) VALUES ($1,$2,$3,now())`, [cod, coms.length, JSON.stringify(coms.slice(0, 20))]);
  const chk = (await db.query(`SELECT count(*) m, sum(n_comunidades) n FROM quilombos_sc`)).rows[0];
  console.log(`✔ quilombos_sc: ${chk.m} municípios · ${chk.n} comunidades quilombolas certificadas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
