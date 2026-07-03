// ETL — PDDE (Programa Dinheiro Direto na Escola) por MUNICÍPIO de SC (rede municipal).
// Fonte: FNDE, Plataforma Antonieta de Barros, produto "Execução Financeira PDDE Básico - Público" (grão = escola/UEx).
// O PDDE é pago direto à conta da escola (UEx), não ao tesouro — por isso NÃO está no SIMAD (fnde_simad_sc). Aqui
// agregamos escola→município (via CO_MUNICIPIO_IBGE), só esfera MUNICIPAL. Download via curl (node fetch estagna no
// servidor FNDE, que é chunked sem content-length). node scripts/ingest_pdde_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
// ids do produto na plataforma (Execução Financeira PDDE Básico - Público) por exercício
const PRODUTOS = { 2021: 76, 2022: 75, 2023: 74, 2024: 67 };
const API = (id) => `https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/${id}/artifact`;
const brl = (v) => Number(String(v).replace(",", ".")) || 0;

function baixarEGunzip(id) {
  const gz = path.join(os.tmpdir(), `pdde_${id}.txt.gz`);
  execFileSync("curl", ["-s", "-L", "--max-time", "500", "-A", "Mozilla/5.0", "-o", gz, API(id)], { stdio: "ignore" });
  const buf = fs.readFileSync(gz);
  if (buf.length < 1000) throw new Error(`download vazio (${buf.length}b) para produto ${id}`);
  const txt = zlib.gunzipSync(buf).toString("utf8");
  fs.unlinkSync(gz);
  return txt;
}

function parseAno(txt, ano) {
  const linhas = txt.split(/\r?\n/);
  const head = linhas[0].split(";").map((c) => c.trim());
  const ix = (n) => head.indexOf(n);
  const iUF = ix("SG_UF"), iIbge = ix("CO_MUNICIPIO_IBGE"), iEsf = ix("NO_ESFERA_ADM"), iEsc = ix("CO_ESCOLA"), iAlu = ix("QT_ALUNOS"), iVal = ix("VL_PAGO_TOTAL");
  // por município: valor total + escolas distintas (com seus alunos)
  const mun = new Map(); // cod_ibge -> { valor, escolas: Map(escola->alunos) }
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";");
    if (c.length < head.length) continue;
    if (c[iUF] !== UF) continue;
    if (!/MUNICIPAL/i.test(c[iEsf] || "")) continue; // só a rede municipal (o que o município capta)
    const cod = (c[iIbge] || "").trim();
    if (!/^\d{7}$/.test(cod)) continue;
    if (!mun.has(cod)) mun.set(cod, { valor: 0, escolas: new Map() });
    const m = mun.get(cod);
    m.valor += brl(c[iVal]);
    const esc = (c[iEsc] || "").trim();
    if (esc) m.escolas.set(esc, brl(c[iAlu]));
  }
  return [...mun.entries()].map(([cod, m]) => ({
    cod_ibge: cod, ano, vl_total: Math.round(m.valor * 100) / 100,
    n_escolas: m.escolas.size, qt_alunos: [...m.escolas.values()].reduce((s, a) => s + a, 0),
  }));
}

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS pdde_sc (cod_ibge TEXT, ano INTEGER, vl_total NUMERIC, n_escolas INTEGER, qt_alunos INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  let totalLinhas = 0;
  for (const [ano, id] of Object.entries(PRODUTOS)) {
    process.stdout.write(`  ${ano} (produto ${id})… `);
    let rows;
    try { rows = parseAno(baixarEGunzip(id), Number(ano)); }
    catch (e) { console.log(`FALHOU: ${e.message.slice(0, 60)}`); continue; }
    for (const r of rows) {
      await db.query(
        `INSERT INTO pdde_sc (cod_ibge, ano, vl_total, n_escolas, qt_alunos) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (cod_ibge, ano) DO UPDATE SET vl_total=EXCLUDED.vl_total, n_escolas=EXCLUDED.n_escolas, qt_alunos=EXCLUDED.qt_alunos`,
        [r.cod_ibge, r.ano, r.vl_total, r.n_escolas, r.qt_alunos]);
    }
    totalLinhas += rows.length;
    console.log(`${rows.length} municípios · R$ ${(rows.reduce((s, r) => s + r.vl_total, 0) / 1e6).toFixed(1)} mi`);
  }
  const chk = (await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) munis, min(ano) mi, max(ano) ma FROM pdde_sc`)).rows[0];
  console.log(`\n✔ pdde_sc: ${JSON.stringify(chk)}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
