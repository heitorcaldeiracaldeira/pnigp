// ETL — PRODUÇÃO ambulatorial (SIA/SUS) por município de SC, via TabNet/DATASUS.
// Qtd. aprovada e valor aprovado, por ano. Mesma técnica do SIH (tabcgi.exe, latin1, filtros TODAS_AS_CATEGORIAS__).
// Grava nas colunas sia_* da tabela saude_producao_sc. Idempotente por ano. node scripts/ingest_sia_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const FORM = "http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sia/cnv/qaSC.def";
const POST = "http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sia/cnv/qaSC.def";
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const enc = (s) => [...s].map((c) => { const b = c.charCodeAt(0); return b < 128 && /[A-Za-z0-9_.\-]/.test(c) ? c : "%" + b.toString(16).toUpperCase().padStart(2, "0"); }).join("");
const pnum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

let SF = null;
async function filtros() {
  if (SF) return SF;
  const html = new TextDecoder("latin1").decode(await (await fetch(FORM, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
  SF = [...html.matchAll(/NAME="(S[^"]+)"/g)].map((m) => m[1]);
  return SF;
}
async function consulta(ano, incremento) {
  const yy = String(ano).slice(2);
  const sNames = await filtros();
  const pairs = [["Linha", "Município"], ["Coluna", "--Não-Ativa--"], ["Incremento", incremento], ["formato", "table"], ["mostre", "Mostra"]];
  for (let m = 1; m <= 12; m++) pairs.push(["Arquivos", `qasc${yy}${String(m).padStart(2, "0")}.dbf`]);
  for (const s of sNames) pairs.push([s, "TODAS_AS_CATEGORIAS__"]);
  const body = pairs.map(([k, v]) => enc(k) + "=" + enc(v)).join("&");
  for (let t = 0; t < 4; t++) {
    try {
      const out = new TextDecoder("latin1").decode(await (await fetch(POST, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(90000) })).arrayBuffer());
      if (/not a valid|Exception/i.test(out)) throw new Error("tabnet err");
      const map = {};
      for (const m of out.matchAll(/<TD ALIGN=LEFT>\s*(\d{6})\s+[^<]*?<TD>\s*([\d.,]+)/g)) map[m[1]] = pnum(m[2]);
      return Object.keys(map).length ? map : null;
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS saude_producao_sc (cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL, internacoes INTEGER, valor_internacoes NUMERIC, PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`ALTER TABLE saude_producao_sc ADD COLUMN IF NOT EXISTS sia_qtd BIGINT`);
  await db.query(`ALTER TABLE saude_producao_sc ADD COLUMN IF NOT EXISTS sia_valor NUMERIC`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };
  const cod6map = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => [r.cod_ibge.slice(0, 6), r.cod_ibge]));
  const feitos = new Set((await db.query(`SELECT DISTINCT ano FROM saude_producao_sc WHERE sia_qtd IS NOT NULL`)).rows.map((r) => r.ano));

  for (const ano of ANOS) {
    if (feitos.has(ano)) { console.log(`${ano}: já coletado`); continue; }
    const qtd = await consulta(ano, "Qtd.aprovada");
    await sleep(500);
    const val = await consulta(ano, "Valor_aprovado");
    if (!qtd) { console.log(`${ano}: falhou (qtd)`); continue; }
    let n = 0;
    for (const [cod6, v] of Object.entries(qtd)) {
      const cod = cod6map.get(cod6); if (!cod) continue;
      await q(`INSERT INTO saude_producao_sc (cod_ibge,ano,sia_qtd,sia_valor) VALUES ($1,$2,$3,$4)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET sia_qtd=EXCLUDED.sia_qtd, sia_valor=EXCLUDED.sia_valor`,
        [cod, ano, v, val ? val[cod6] || 0 : null]);
      n++;
    }
    console.log(`${ano}: ${n} municípios | total qtd aprovada ${Object.values(qtd).reduce((a, b) => a + b, 0).toLocaleString("pt-BR")}`);
  }
  const c = await db.query(`SELECT count(*) FILTER (WHERE sia_qtd IS NOT NULL) com_sia, count(DISTINCT ano) anos FROM saude_producao_sc`);
  console.log(`SIA concluído: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
