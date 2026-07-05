// ETL — SENATRAN Frota de Veículos por município. Fonte: Ministério dos Transportes (gov.br/transportes, xlsx mensal).
// Pega DEZEMBRO de cada ano (estoque de fim de ano) → série. Casa por NOME do município (o xlsx não traz código IBGE).
// node scripts/ingest_senatran_frota_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2019,2020,2021,2022,2023,2024,2025").split(",").map(Number);
const B = "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map(ano -> {total, auto, moto})

  for (const ano of ANOS) {
    const xp = path.join(dir, `frota_${ano}.xlsx`);
    if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e5) {
      const url = `${B}/arquivos-renavam-${ano}/FrotaporMunicipioetipoDEZEMBRO${ano}.xlsx`;
      try { execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", xp, url], { stdio: "ignore" }); } catch (e) {}
    }
    if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e5) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let rows; try { const wb = XLSX.readFile(xp); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); } catch (e) { console.log(`  ⚠ ${ano}: xlsx inválido`); continue; }
    const hr = rows.findIndex((r) => r.some((c) => /^MUNICIPIO$/i.test(String(c).trim())) && r.some((c) => /^TOTAL$/i.test(String(c).trim())));
    if (hr < 0) { console.log(`  ⚠ ${ano}: cabeçalho não achado`); continue; }
    const H = rows[hr].map((c) => norm(c)); const iu = H.indexOf("UF"), im = H.indexOf("MUNICIPIO"), it = H.indexOf("TOTAL"), ia = H.indexOf("AUTOMOVEL"), imo = H.indexOf("MOTOCICLETA");
    let n = 0;
    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i]; if (norm(r[iu]) !== UF) continue;
      const cod = byName.get(norm(r[im])); if (!cod) continue;
      const total = +r[it] || 0; if (!total) continue;
      if (!M.has(cod)) M.set(cod, new Map());
      M.get(cod).set(ano, { total, auto: +r[ia] || 0, moto: +r[imo] || 0 }); n++;
    }
    console.log(`  ✓ ${ano}: ${n} municípios`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS frota_sc (cod_ibge TEXT, ano INTEGER, total INTEGER, automovel INTEGER, motocicleta INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, v] of anos) {
    await db.query(`INSERT INTO frota_sc (cod_ibge,ano,total,automovel,motocicleta,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET total=EXCLUDED.total,automovel=EXCLUDED.automovel,motocicleta=EXCLUDED.motocicleta,atualizado=now()`,
      [cod, ano, v.total, v.auto, v.moto]); up++;
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, sum(total) FILTER (WHERE ano=(SELECT max(ano) FROM frota_sc)) t FROM frota_sc`)).rows[0];
  console.log(`✔ frota_sc: ${chk.m} municípios · ${up} linhas · frota ${chk.ma}: ${Number(chk.t).toLocaleString("pt-BR")} veículos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
