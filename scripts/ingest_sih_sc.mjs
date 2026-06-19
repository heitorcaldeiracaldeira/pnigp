// ETL — PRODUÇÃO hospitalar (SIH/SUS) por município de SC, via TabNet/DATASUS.
// Internações e valor total, por ano (soma das 12 competências). 1 requisição traz todos os municípios.
// Fonte: tabcgi.exe (TabNet). Idempotente por ano. node scripts/ingest_sih_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const FORM = "http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sih/cnv/niSC.def";
const POST = "http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sih/cnv/niSC.def";
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const enc = (s) => [...s].map((c) => { const b = c.charCodeAt(0); return b < 128 && /[A-Za-z0-9_.\-]/.test(c) ? c : "%" + b.toString(16).toUpperCase().padStart(2, "0"); }).join("");
const pnum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

let SFILTROS = null;
async function filtros() {
  if (SFILTROS) return SFILTROS;
  const html = new TextDecoder("latin1").decode(await (await fetch(FORM, { signal: AbortSignal.timeout(40000) })).arrayBuffer());
  SFILTROS = [...html.matchAll(/NAME="(S[^"]+)"/g)].map((m) => m[1]);
  return SFILTROS;
}
// retorna { cod6: valor } para uma medida (Incremento) num ano (12 competências)
async function consulta(ano, incremento) {
  const yy = String(ano).slice(2);
  const sNames = await filtros();
  const pairs = [["Linha", "Município"], ["Coluna", "--Não-Ativa--"], ["Incremento", incremento], ["formato", "table"], ["mostre", "Mostra"]];
  for (let m = 1; m <= 12; m++) pairs.push(["Arquivos", `nisc${yy}${String(m).padStart(2, "0")}.dbf`]);
  for (const s of sNames) pairs.push([s, "TODAS_AS_CATEGORIAS__"]);
  const body = pairs.map(([k, v]) => enc(k) + "=" + enc(v)).join("&");
  for (let t = 0; t < 4; t++) {
    try {
      const out = new TextDecoder("latin1").decode(await (await fetch(POST, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(60000) })).arrayBuffer());
      if (/not a valid|Exception/i.test(out)) throw new Error("tabnet err");
      const map = {};
      for (const m of out.matchAll(/<TD ALIGN=LEFT>\s*(\d{6})\s+[^<]*?<TD>\s*([\d.,]+)/g)) map[m[1]] = pnum(m[2]);
      return map;
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS saude_producao_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL, internacoes INTEGER, valor_internacoes NUMERIC,
    PRIMARY KEY (cod_ibge, ano) )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };
  // mapa cod6 → cod_ibge (7 díg.)
  const cod6map = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => [r.cod_ibge.slice(0, 6), r.cod_ibge]));
  const feitos = new Set((await db.query(`SELECT DISTINCT ano FROM saude_producao_sc`)).rows.map((r) => r.ano));

  for (const ano of ANOS) {
    if (feitos.has(ano)) { console.log(`${ano}: já coletado`); continue; }
    const inter = await consulta(ano, "Internações");
    await sleep(500);
    const valor = await consulta(ano, "Valor_total");
    if (!inter) { console.log(`${ano}: falhou (internações)`); continue; }
    let n = 0;
    for (const [cod6, v] of Object.entries(inter)) {
      const cod = cod6map.get(cod6); if (!cod) continue;
      await q(`INSERT INTO saude_producao_sc (cod_ibge,ano,internacoes,valor_internacoes) VALUES ($1,$2,$3,$4)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET internacoes=EXCLUDED.internacoes, valor_internacoes=EXCLUDED.valor_internacoes`,
        [cod, ano, v, valor ? valor[cod6] || 0 : null]);
      n++;
    }
    console.log(`${ano}: ${n} municípios | total internações ${Object.values(inter).reduce((a, b) => a + b, 0).toLocaleString("pt-BR")}`);
  }
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) e, count(DISTINCT ano) anos FROM saude_producao_sc`);
  console.log(`SIH concluído: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
