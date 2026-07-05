// ETL — ANATEL Banda Larga Fixa por município. Fonte: dados abertos ANATEL (zip ~1GB, CSVs por período, UTF-8, ;).
// Cada linha = acessos (assinaturas) por ano/mês/empresa/município/tecnologia. Série = estoque do ÚLTIMO mês de cada ano.
// node scripts/ingest_anatel_bl_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ZURL = "https://www.anatel.gov.br/dadosabertos/paineis_de_dados/acessos/acessos_banda_larga_fixa.zip";
const cel = (l) => l.replace(/^﻿/, "").split(";");

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  let outDir = path.join(dir, "anatel_blf_out");
  if (!fs.existsSync(outDir)) {
    const zp = path.join(dir, "anatel_blf.zip");
    if (!fs.existsSync(zp)) { console.log("baixando ANATEL BL (~1GB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "600", "-A", "Mozilla/5.0", "-o", zp, ZURL], { stdio: "ignore" }); }
    const _7z = await import("7zip-min"); const un = _7z.default?.unpack || _7z.unpack;
    await new Promise((res, rej) => un(zp, outDir, (e) => e ? rej(e) : res()));
  }
  const csvs = fs.readdirSync(outDir).filter((f) => /\.csv$/i.test(f) && !/_Colunas/i.test(f));

  // byKey: cod|ano -> Map(mes -> soma acessos)
  const K = new Map();
  for (const f of csvs) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(outDir, f), { encoding: "utf8" }), crlfDelay: Infinity });
    let H = null, ix = {};
    for await (const line of rl) {
      if (!H) { H = cel(line).map((h) => h.trim()); const at = (re) => H.findIndex((h) => re.test(h)); ix = { uf: at(/^UF$/i), cod: at(/IBGE/i), ano: at(/^Ano$/i), mes: at(/^M.s$/i), ac: at(/Acessos/i) }; continue; }
      const c = cel(line); if ((c[ix.uf] || "") !== UF) continue;
      const cod = (c[ix.cod] || "").trim(); if (!byCod.has(cod)) continue;
      const ano = +(c[ix.ano] || 0), mes = +(c[ix.mes] || 0), ac = +(c[ix.ac] || 0);
      if (ano < 2007 || ano > 2026 || !ac) continue;
      const k = `${cod}|${ano}`; if (!K.has(k)) K.set(k, new Map());
      const mm = K.get(k); mm.set(mes, (mm.get(mes) || 0) + ac);
    }
    process.stdout.write(`\r  ${f.slice(0, 40)} ok`);
  }
  console.log("");

  // por município: série = acessos do último mês de cada ano
  const M = new Map();
  for (const [k, mm] of K) {
    const [cod, ano] = k.split("|");
    const maxMes = Math.max(...mm.keys());
    const ac = mm.get(maxMes);
    if (!M.has(cod)) M.set(cod, new Map());
    M.get(cod).set(+ano, ac);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS anatel_bl_sc (cod_ibge TEXT PRIMARY KEY, ano_atual INTEGER, acessos INTEGER, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, anos] of M) {
    const serie = [...anos.entries()].sort((a, b) => a[0] - b[0]).map(([ano, valor]) => ({ ano, valor }));
    const last = serie[serie.length - 1];
    await db.query(`INSERT INTO anatel_bl_sc (cod_ibge,ano_atual,acessos,serie,atualizado) VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET ano_atual=EXCLUDED.ano_atual,acessos=EXCLUDED.acessos,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, last.ano, last.valor, JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(acessos) a FROM anatel_bl_sc`)).rows[0];
  console.log(`✔ anatel_bl_sc: ${chk.m} municípios · ${Number(chk.a).toLocaleString("pt-BR")} acessos de banda larga fixa (último ano)`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
