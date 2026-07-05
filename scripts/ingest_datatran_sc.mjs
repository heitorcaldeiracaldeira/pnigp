// ETL — PRF DATATRAN acidentes em rodovias federais por município. Fonte: PRF dados abertos (CSVs "agrupados por ocorrência", Google Drive).
// Agrega por município/ano: nº de acidentes + mortos + feridos. Série. Casa por NOME (SC). node scripts/ingest_datatran_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
// IDs Google Drive "Agrupados por ocorrência" por ano (fonte: página de dados abertos da PRF)
const DRIVE = { 2015: "1DyqR5FFcwGsamSag-fGm13feQt0Y-3Da", 2016: "16qooQl_ySoW61CrtsBbreBVNPYlEkoYm", 2017: "1HPLWt5f_l4RIX3tKjI4tUXyZOev52W0N", 2018: "1cM4IgGMIiR-u4gBIH5IEe3DcvBvUzedi", 2019: "1pN3fn2wY34GH6cY-gKfbxRJJBFE0lb_l", 2020: "1esu6IiH5TVTxFoedv6DBGDd01Gvi8785", 2021: "12xH8LX9aN2gObR766YN3cMcuycwyCJDz", 2022: "1PRQjuV5gOn_nn6UNvaJyVURDIfbSAK4-", 2023: "1-WO3SfNrwwZ5_l7fRTiwBKRw7mi1-HUq", 2024: "14lB0vqMFkaZj8HZ44b0njYgxs9nAN8KO", 2025: "1-G3MdmHBt6CprDwcW99xxC4BZ2DU5ryR" };
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const P = (l) => { const o = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ";" && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };

async function run() {
  const AdmZip = (await import("adm-zip")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map(ano -> {n, mortos, feridos})

  for (const [ano, id] of Object.entries(DRIVE)) {
    const cp = path.join(dir, `datatran_${ano}.csv`);
    if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e4) {
      try { execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", cp, `https://drive.google.com/uc?export=download&id=${id}&confirm=t`], { stdio: "ignore" }); } catch (e) {}
    }
    if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    // arquivos do Drive são ZIP com o CSV dentro
    let lines;
    try { const ent = new AdmZip(cp).getEntries().find((e) => /\.csv$/i.test(e.entryName)); lines = ent.getData().toString("latin1").split(/\r?\n/); }
    catch (e) { console.log(`  ⚠ ${ano}: zip inválido (${e.message.slice(0, 25)})`); continue; }
    let H = null, ix = {}, n = 0;
    for (const line of lines) {
      if (!line) continue;
      if (!H) { H = P(line); ix = { uf: H.indexOf("uf"), mun: H.indexOf("municipio"), mortos: H.indexOf("mortos"), fg: H.indexOf("feridos_graves"), fl: H.indexOf("feridos_leves"), fer: H.indexOf("feridos") }; continue; }
      const c = P(line); if ((c[ix.uf] || "").trim().toUpperCase() !== UF) continue;
      const cod = byName.get(norm(c[ix.mun])); if (!cod) continue;
      const mortos = +(c[ix.mortos] || 0) || 0;
      const feridos = ix.fer >= 0 && c[ix.fer] !== undefined && c[ix.fer] !== "" ? (+c[ix.fer] || 0) : ((+c[ix.fg] || 0) + (+c[ix.fl] || 0));
      if (!M.has(cod)) M.set(cod, new Map());
      const mm = M.get(cod); const a = mm.get(+ano) || { n: 0, mortos: 0, feridos: 0 }; a.n++; a.mortos += mortos; a.feridos += feridos; mm.set(+ano, a);
      n++;
    }
    console.log(`  ✓ ${ano}: ${n} acidentes ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS datatran_sc (cod_ibge TEXT, ano INTEGER, n_acidentes INTEGER, mortos INTEGER, feridos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let up = 0;
  for (const [cod, mm] of M) for (const [ano, a] of mm) {
    await db.query(`INSERT INTO datatran_sc (cod_ibge,ano,n_acidentes,mortos,feridos,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET n_acidentes=EXCLUDED.n_acidentes,mortos=EXCLUDED.mortos,feridos=EXCLUDED.feridos,atualizado=now()`,
      [cod, ano, a.n, a.mortos, a.feridos]); up++;
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, sum(n_acidentes) n, sum(mortos) mo FROM datatran_sc`)).rows[0];
  console.log(`✔ datatran_sc: ${chk.m} municípios · ${Number(chk.n).toLocaleString("pt-BR")} acidentes · ${Number(chk.mo).toLocaleString("pt-BR")} mortos (rodovias federais em ${UF})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
