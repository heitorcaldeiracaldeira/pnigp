// RE-MEDE a cobertura lendo o EDITAL (tipo 2), nos MESMOS processos de logs/analise_casamento_tr.jsonl.
// Testa a hipótese: o item vive no Edital (que embute os anexos — art. 25 §3), não só no TR. Comparação pareada.
// node scripts/remede_edital.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 3);
const OUT = path.join(ROOT, "logs", "analise_edital.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comLimite = (p, ms) => Promise.race([p, new Promise((_, x) => setTimeout(() => x(new Error("timeout")), ms))]);

// ── mesmas funções de localização por janela do analisador do TR ──
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stripLote = (s) => s.replace(/^\s*lote\s*0*\d+\s*[-–:]*\s*/i, "");
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote frete gratis".split(" "));
function tokensItem(d) { const s = new Set(); for (const w of d.split(" ")) { if (/^\d+$/.test(w)) { if (w.length >= 2) s.add(w); } else if (w.length >= 5 && !STOP.has(w)) s.add(w); } return [...s]; }
function buildIndex(t) { const idx = new Map(); const re = /[a-z0-9]+/g; let m; while ((m = re.exec(t)) !== null) { const k = m[0]; if ((/^\d+$/.test(k) && k.length >= 2) || k.length >= 5) { let a = idx.get(k); if (!a) { a = []; idx.set(k, a); } a.push(m.index); } } return idx; }
function locate(toks, idx, W = 200) { const p = toks.filter((t) => idx.has(t)); if (p.length < 2) return null; p.sort((a, b) => idx.get(a).length - idx.get(b).length); let best = 0, off = null; for (const o of idx.get(p[0])) { let c = 0; for (const t of p) if (idx.get(t).some((x) => Math.abs(x - o) <= W)) c++; if (c > best) { best = c; off = o; } } return best >= 2 ? off : null; }

async function getJson(url) { for (let t = 0; t < 5; t++) { try { const r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) }); if (r.status === 429 || /text\/html/i.test(r.headers.get("content-type") || "")) { await sleep(6000 * (t + 1)); continue; } if (r.status === 204) return []; if (!r.ok) return null; return await r.json(); } catch { await sleep(1500 * (t + 1)); } } return null; }
async function getTexto(uri) { for (let t = 0; t < 4; t++) { try { const r = await fetch(uri, { signal: AbortSignal.timeout(60000) }); if (r.status === 429) { await sleep(6000 * (t + 1)); continue; } if (!r.ok) return ""; const buf = new Uint8Array(await r.arrayBuffer()); if (buf[0] !== 0x25 && !/pdf/i.test(r.headers.get("content-type") || "")) return Buffer.from(buf).toString("utf8"); try { return await comLimite((async () => (await extractText(await getDocumentProxy(buf), { mergePages: true })).text || "")(), 40000); } catch { return ""; } } catch { await sleep(1500 * (t + 1)); } } return null; }

function cobertura(its, texto) {
  const idx = buildIndex(norm(texto));
  const itens = its.slice().sort((a, b) => a.numeroItem - b.numeroItem).slice(0, 80);
  let loc = 0;
  for (const it of itens) if (locate(tokensItem(stripLote(norm(it.descricao))), idx) != null) loc++;
  return itens.length ? +(loc / itens.length).toFixed(3) : null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  const base = fs.readFileSync(path.join(ROOT, "logs", "analise_casamento_tr.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter((r) => !r.erro);
  // uris dos Editais (tipo 2) para os processos
  console.log(`re-medindo ${base.length} processos pelo EDITAL · conc ${CONC}`);
  fs.writeFileSync(OUT, "");
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < base.length) {
      const b = base[i++];
      const rec = { cnpj: b.cnpj, ano: b.ano, seq: b.seq, plataforma: b.plataforma, tr_cov: b.cobertura ?? null };
      try {
        const ed = (await db.query(`select uri from arquivos_sc where cnpj=$1 and ano=$2 and seq=$3 and tipo_documento_id=2 limit 1`, [b.cnpj, b.ano, b.seq])).rows[0];
        if (!ed) { rec.erro = "sem edital"; }
        else {
          const j = await getJson(`${PNCP}/orgaos/${b.cnpj}/compras/${b.ano}/${b.seq}/itens?pagina=1&tamanhoPagina=500`);
          const its = Array.isArray(j) ? j : (j?.data || []);
          const txt = await getTexto(ed.uri);
          rec.ed_ok = (txt || "").length > 500; rec.ed_chars = (txt || "").length;
          rec.ed_cov = rec.ed_ok && its.length ? cobertura(its, txt) : null;
        }
      } catch (e) { rec.erro = e.message.slice(0, 50); }
      fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
      if (++done % 10 === 0) process.stdout.write(`  ${done}/${base.length}\r`);
    }
  }));
  await db.end();

  const rows = fs.readFileSync(OUT, "utf8").trim().split("\n").map(JSON.parse);
  const ok = rows.filter((r) => !r.erro && r.ed_ok && r.ed_cov != null && r.tr_cov != null);
  const med = (a, f) => a.length ? +(a.reduce((s, x) => s + f(x), 0) / a.length).toFixed(2) : null;
  console.log(`\n\n═══ TR vs EDITAL (pareado, ${ok.length} processos) ═══`);
  console.log(`GERAL — cobertura média: TR ${med(ok, (r) => r.tr_cov)} → EDITAL ${med(ok, (r) => r.ed_cov)}`);
  const byP = {}; for (const r of ok) (byP[r.plataforma || "?"] ||= []).push(r);
  console.log("\nplataforma".padEnd(34), "n", "  TR", "EDITAL");
  for (const [p, a] of Object.entries(byP).filter(([, a]) => a.length >= 4).sort((x, y) => y[1].length - x[1].length))
    console.log(p.slice(0, 33).padEnd(34), String(a.length).padStart(2), String(med(a, (r) => r.tr_cov)).padStart(5), String(med(a, (r) => r.ed_cov)).padStart(6));
  console.log(`\nsem edital: ${rows.filter((r) => r.erro === "sem edital").length} · edital sem texto: ${rows.filter((r) => !r.erro && !r.ed_ok).length}`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
