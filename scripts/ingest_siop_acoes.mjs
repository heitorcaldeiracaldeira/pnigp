// ETL — Catálogo de Ações Orçamentárias do Governo Federal (SIOP, dados abertos, CSV público, sem auth).
// É o catálogo-mãe do que uma emenda pode financiar, por setor (Função). Nacional (state-agnostic); o recorte
// municipal vem do cruzamento com emendas_indicacao_sc.acao_orcamentaria. Idempotente. node scripts/ingest_siop_acoes.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const EXERCICIO = process.env.EXERCICIO || "2025";
const BASE = "https://www1.siop.planejamento.gov.br/siopdoc/lib/exe/fetch.php/dados_abertos:";

// parser CSV robusto (RFC-4180: aspas + delimitador/quebra embutidos — o CSV do SIOP tem Descrição/Base Legal multi-linha)
function parseCSV(t, sep = ";") {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else { if (ch === '"') q = true; else if (ch === sep) { row.push(f); f = ""; } else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (ch === "\r") { /*skip*/ } else f += ch; }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const setorDe = (fun) => ({ "10": "saude", "12": "educacao", "8": "assistencia", "08": "assistencia" }[String(fun || "").trim()] || "outros");

async function main() {
  // tenta o exercício pedido; se o CSV do ano ainda não foi publicado (404), cai para os anteriores
  let r, exUsado = null;
  for (let ex = parseInt(EXERCICIO, 10); ex >= parseInt(EXERCICIO, 10) - 2; ex--) {
    const url = `${BASE}dados_acao${ex}.csv`;
    console.log("tentando SIOP ações:", url);
    const resp = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (resp.ok) { r = resp; exUsado = ex; break; }
    console.log("  HTTP " + resp.status + " — tentando ano anterior");
  }
  if (!r) throw new Error("nenhum exercício SIOP disponível a partir de " + EXERCICIO);
  const EX = String(exUsado);
  const rows = parseCSV(Buffer.from(await r.arrayBuffer()).toString("latin1"), ";");
  const H = rows[0];
  console.log(`registros: ${rows.length - 1} · colunas: ${H.length}`);
  // índices (posições fixas do layout SIOP)
  const I = { ex: 0, esf: 1, uo: 2, fun: 3, sub: 4, prog: 5, acao: 6, tit: 7, tipo: 8, desc: 11, baselegal: 12, prod: 14, benef: 17, transfObr: 22, outrasT: 23 };

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS siop_acoes (
    exercicio INT, esfera TEXT, uo TEXT, funcao TEXT, subfuncao TEXT, programa TEXT, acao TEXT,
    titulo TEXT, tipo TEXT, descricao TEXT, base_legal TEXT, produto TEXT, beneficiario TEXT,
    transf_obrigatoria TEXT, outras_transferencias TEXT, setor TEXT, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (exercicio, uo, programa, acao))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await new Promise((z) => setTimeout(z, 1000 * (t + 1))); } } throw new Error("db"); };

  const cel = (c, i) => String((c[i] ?? "")).trim().slice(0, 2000);
  let n = 0; const porSetor = {};
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i]; if (!c || c.length < 8) continue;
    const acao = cel(c, I.acao); const uo = cel(c, I.uo); const prog = cel(c, I.prog);
    if (!acao && !cel(c, I.tit)) continue;
    const setor = setorDe(c[I.fun]); porSetor[setor] = (porSetor[setor] || 0) + 1;
    await q(`INSERT INTO siop_acoes (exercicio,esfera,uo,funcao,subfuncao,programa,acao,titulo,tipo,descricao,base_legal,produto,beneficiario,transf_obrigatoria,outras_transferencias,setor)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (exercicio,uo,programa,acao) DO UPDATE SET titulo=EXCLUDED.titulo, descricao=EXCLUDED.descricao, beneficiario=EXCLUDED.beneficiario, setor=EXCLUDED.setor, atualizado=now()`,
      [parseInt(EX, 10), cel(c, I.esf), uo, cel(c, I.fun), cel(c, I.sub), prog, acao, cel(c, I.tit), cel(c, I.tipo), cel(c, I.desc), cel(c, I.baselegal), cel(c, I.prod), cel(c, I.benef), cel(c, I.transfObr), cel(c, I.outrasT), setor]);
    n++;
  }
  console.log(`SIOP ações ${EX}: ${n} gravadas`);
  console.log("por setor:", JSON.stringify(porSetor));
  const tot = (await db.query(`SELECT setor, count(*) n FROM siop_acoes WHERE exercicio=$1 GROUP BY setor ORDER BY n DESC`, [parseInt(EX, 10)])).rows;
  tot.forEach((t) => console.log(`  ${t.setor}: ${t.n}`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
