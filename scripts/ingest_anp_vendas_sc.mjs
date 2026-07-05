// ETL — ANP vendas de combustíveis por município. Fonte: dados abertos ANP (CSV direto, série 1990+).
// Diesel, gasolina C, etanol hidratado, GLP. Vendas em litros/kg por município/ano. IBGE 7 díg (filtra por prefixo 42=SC).
// node scripts/ingest_anp_vendas_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UFCOD = process.env.UFCOD || "42";
const B = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/vdpb/vaehdpm";
const PROD = [
  { key: "diesel", url: `${B}/oleo-diesel/vendas-anuais-de-oleo-diesel-por-municipio.csv` },
  { key: "gasolina", url: `${B}/gasolina-c/vendas-anuais-de-gasolina-c-por-municipio.csv` },
  { key: "etanol", url: `${B}/etanol-hidratado/vendas-anuais-de-etanol-hidratado-por-municipio.csv` },
  { key: "glp", url: `${B}/glp/vendas-anuais-de-glp-por-municipio.csv` },
];
const numf = (s) => { const n = Number(String(s || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod|ano|produto -> vendas

  for (const p of PROD) {
    const cp = path.join(dir, `anp_${p.key}.csv`);
    if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e4) { try { execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", cp, p.url], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(cp)) { console.log(`  ⚠ ${p.key}: sem arquivo`); continue; }
    const rl = readline.createInterface({ input: fs.createReadStream(cp, { encoding: "utf8" }), crlfDelay: Infinity });
    let H = null, ix = {}, n = 0;
    for await (const line of rl) {
      if (!H) { H = line.replace(/^﻿/, "").split(";").map((h) => h.trim()); ix = { ano: H.indexOf("ANO"), cod: H.indexOf("CÓDIGO IBGE"), vendas: H.indexOf("VENDAS") }; continue; }
      const c = line.split(";"); const cod = (c[ix.cod] || "").trim();
      if (!cod.startsWith(UFCOD) || !byCod.has(cod)) continue;
      const ano = +c[ix.ano] || 0; if (ano < 1990) continue;
      M.set(`${cod}|${ano}|${p.key}`, numf(c[ix.vendas])); n++;
    }
    console.log(`  ✓ ${p.key}: ${n} linhas ${UFCOD}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS anp_vendas_sc (cod_ibge TEXT, ano INTEGER, produto TEXT, vendas NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, produto))`);
  await db.query(`TRUNCATE anp_vendas_sc`);
  const ent = [...M.entries()]; let up = 0;
  for (let i = 0; i < ent.length; i += 500) {
    const batch = ent.slice(i, i + 500);
    const vals = batch.map((_, j) => `($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4},now())`).join(",");
    const params = batch.flatMap(([k, v]) => { const [cod, ano, prod] = k.split("|"); return [cod, +ano, prod, Math.round(v)]; });
    await db.query(`INSERT INTO anp_vendas_sc (cod_ibge,ano,produto,vendas,atualizado) VALUES ${vals} ON CONFLICT (cod_ibge,ano,produto) DO UPDATE SET vendas=EXCLUDED.vendas`, params); up += batch.length;
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, round(sum(vendas) FILTER (WHERE produto='diesel' AND ano=(SELECT max(ano) FROM anp_vendas_sc))/1e6) diesel_mi FROM anp_vendas_sc`)).rows[0];
  console.log(`✔ anp_vendas_sc: ${chk.m} municípios · ${up} linhas · último ano ${chk.ma} · diesel ${chk.diesel_mi} milhões L`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
