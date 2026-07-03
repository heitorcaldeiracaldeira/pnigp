// ETL fase 2 — endereço/telefone de cada equipamento do SUAS (CadSUAS, página de detalhe por código).
// A página de detalhe (aba=endereco_contatos) responde a HTTP simples (≠ da busca, que é JSF). Concorrente.
// Idempotente: só busca quem ainda não tem endereço (use REFRESH=1 p/ recoletar).
//   node scripts/enrich_equipamentos_suas_endereco.mjs   (env: CONC=8 REFRESH=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://aplicacoes.mds.gov.br/cadsuas/visualizarEntidadeConsultaExterna.html?aba=endereco_contatos&codigo=";
const CONC = Number(process.env.CONC || 8);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const ENT = { ccedil: "ç", atilde: "ã", aacute: "á", eacute: "é", oacute: "ó", uacute: "ú", iacute: "í", ecirc: "ê", ocirc: "ô", acirc: "â", agrave: "à", otilde: "õ", ordm: "º", nbsp: " " };
const dec = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (_, e) => ENT[e] || " ")
  .replace(/\s+/g, " ").trim();
const after = (html, label) => { const m = new RegExp(`<strong>\\s*${label}[^<]*</strong\\s*>\\s*([^<]+)`, "i").exec(html); return m ? dec(m[1]) : null; };

async function detalhe(cod) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(BASE + cod, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (t + 1)); continue; }
      if (!r.ok) return { ok: true, vazio: true };
      const buf = await r.arrayBuffer();
      const html = new TextDecoder("latin1").decode(buf);
      const endereco = after(html, "Endere&ccedil;o:") || after(html, "Endereço:");
      const telefone = after(html, "Telefone:");
      const cep = endereco ? (endereco.match(/CEP:\s*([\d.\-]+)/i) || [])[1] || null : null;
      return { ok: true, endereco: endereco || null, telefone: telefone || null, cep };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return { ok: false };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true });
  db.on("error", () => {});
  for (const c of ["endereco TEXT", "cep TEXT", "telefone TEXT", "endereco_em timestamptz"]) await db.query(`ALTER TABLE equipamentos_suas_sc ADD COLUMN IF NOT EXISTS ${c}`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const cond = process.env.REFRESH ? "" : "WHERE endereco_em IS NULL";
  const alvo = (await db.query(`SELECT codigo_cadsuas FROM equipamentos_suas_sc ${cond} ORDER BY codigo_cadsuas`)).rows.map((r) => r.codigo_cadsuas);
  console.log(`enriquecendo ${alvo.length} unidades · CONC=${CONC}`);
  let ok = 0, semEnd = 0, falha = 0, i = 0;
  async function worker() {
    while (i < alvo.length) {
      const cod = alvo[i++];
      const d = await detalhe(cod);
      if (!d.ok) { falha++; continue; }
      await q(`UPDATE equipamentos_suas_sc SET endereco=$2, cep=$3, telefone=$4, endereco_em=now() WHERE codigo_cadsuas=$1`,
        [cod, d.endereco || null, d.cep || null, d.telefone || null]);
      if (d.endereco) ok++; else semEnd++;
      if ((ok + semEnd) % 100 === 0) console.log(`  …${ok + semEnd}/${alvo.length} (${ok} c/ endereço)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const cob = await db.query(`SELECT count(*) total, count(endereco) com_endereco, count(telefone) com_tel FROM equipamentos_suas_sc`);
  console.log(`Endereços concluído: ${ok} ok · ${semEnd} sem endereço · ${falha} falhas · cobertura ${JSON.stringify(cob.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
