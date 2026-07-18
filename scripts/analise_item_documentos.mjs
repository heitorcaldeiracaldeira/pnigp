// ANÁLISE POR ITEM/LOTE JUNTANDO TODOS OS DOCUMENTOS — monta, para cada item da API, a EVIDÊNCIA que cada
// documento do processo traz dele (DFD→ETP→TR→Edital…), na ordem da construção. É o insumo do enriquecimento
// CATMAT/CATSER: a classificação sai da CONVERGÊNCIA das testemunhas, não de um documento só.
// Onde os documentos concordam → alta confiança. Onde divergem/faltam → costura (risco + confiança menor).
// node scripts/analise_item_documentos.mjs [CNPJ ANO SEQ]   (default: SES/SC 2025/84)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const [CNPJ, ANO, SEQ] = [process.argv[2] || "82951351000142", +(process.argv[3] || 2025), +(process.argv[4] || 84)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comLimite = (p, ms) => Promise.race([p, new Promise((_, x) => setTimeout(() => x(new Error("timeout")), ms))]);

// ── localização por janela (mesma do estudo) ──
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stripLote = (s) => s.replace(/^\s*lote\s*0*\d+\s*[-–:]*\s*/i, "");
const loteDe = (s) => { const m = /lote\s*0*(\d+)/i.exec(s || ""); return m ? +m[1] : null; };
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote frete gratis".split(" "));
const tokensItem = (d) => { const s = new Set(); for (const w of d.split(" ")) { if (/^\d+$/.test(w)) { if (w.length >= 2) s.add(w); } else if (w.length >= 5 && !STOP.has(w)) s.add(w); } return [...s]; };
const buildIndex = (t) => { const idx = new Map(); const re = /[a-z0-9]+/g; let m; while ((m = re.exec(t)) !== null) { const k = m[0]; if ((/^\d+$/.test(k) && k.length >= 2) || k.length >= 5) { let a = idx.get(k); if (!a) { a = []; idx.set(k, a); } a.push(m.index); } } return idx; };
const locate = (toks, idx, W = 200) => { const p = toks.filter((t) => idx.has(t)); if (p.length < 2) return null; p.sort((a, b) => idx.get(a).length - idx.get(b).length); let best = 0, off = null; for (const o of idx.get(p[0])) { let c = 0; for (const t of p) if (idx.get(t).some((x) => Math.abs(x - o) <= W)) c++; if (c > best) { best = c; off = o; } } return best >= 2 ? { off, score: best } : null; };

const FASE = { 10: "DFD", 7: "ETP", 5: "Anteprojeto", 6: "Projeto Básico", 8: "Projeto Executivo", 4: "TR", 9: "Mapa de Riscos", 3: "Minuta Contrato", 1: "Aviso", 2: "Edital", 20: "Ato Autoriza", 16: "Outros" };
const ORDER = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];   // ordem da construção (fase preparatória → publicação)

async function getTexto(uri) {
  try {
    const r = await fetch(uri, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) return "";
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] !== 0x25 && !/pdf/i.test(r.headers.get("content-type") || "")) return Buffer.from(buf).toString("utf8");
    try { return await comLimite((async () => (await extractText(await getDocumentProxy(buf), { mergePages: true })).text || "")(), 40000); } catch { return ""; }
  } catch { return ""; }
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  // documentos da CONTRATAÇÃO (a construção) — ordenados pela fase
  const docs = (await db.query(`select sequencial_documento sd, tipo_documento_id tid, uri
    from arquivos_sc where cnpj=$1 and ano=$2 and seq=$3 and tipo_documento_id = any($4) and uri is not null`,
    [CNPJ, ANO, SEQ, ORDER])).rows.sort((a, b) => ORDER.indexOf(a.tid) - ORDER.indexOf(b.tid));
  // itens da API
  const j = await (await fetch(`${PNCP}/orgaos/${CNPJ}/compras/${ANO}/${SEQ}/itens?pagina=1&tamanhoPagina=500`, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) })).json();
  const itens = (Array.isArray(j) ? j : j.data || []).sort((a, b) => a.numeroItem - b.numeroItem);
  console.log(`processo ${CNPJ} ${ANO}/${SEQ} · ${itens.length} itens · ${docs.length} documentos da construção: ${docs.map((d) => FASE[d.tid]).join(" → ")}\n`);

  // extrai e indexa cada documento
  const idxPorDoc = [];
  for (const d of docs) { const txtN = norm(await getTexto(d.uri)); idxPorDoc.push({ tid: d.tid, txtN, idx: buildIndex(txtN) }); }

  // por item: onde cada documento o localiza (evidência) + em quantos aparece
  const cobPorDoc = Object.fromEntries(docs.map((d) => [d.tid, 0]));
  const linhas = [];
  for (const it of itens) {
    const toks = tokensItem(stripLote(norm(it.descricao)));
    const evid = {};
    for (const D of idxPorDoc) {
      const loc = locate(toks, D.idx);
      if (loc) { cobPorDoc[D.tid]++; evid[D.tid] = D.txtN.slice(Math.max(0, loc.off - 30), loc.off + 190).replace(/\s+/g, " ").trim(); }
    }
    linhas.push({ n: it.numeroItem, lote: loteDe(it.descricao), tipo: it.materialOuServicoNome || it.materialOuServico, api: (it.descricao || "").replace(/\s+/g, " ").trim(), evid, achadoEm: Object.keys(evid).length });
  }

  // mostra os 4 primeiros itens com a evidência juntada
  console.log("══════ EVIDÊNCIA POR ITEM (juntando todos os documentos) ══════");
  for (const L of linhas.slice(0, 4)) {
    console.log(`\n▶ item ${L.n}${L.lote ? " · lote " + L.lote : ""} · ${L.tipo} · achado em ${L.achadoEm}/${docs.length} docs`);
    console.log(`   API   : ${L.api.slice(0, 120)}`);
    for (const tid of ORDER) if (L.evid[tid]) console.log(`   ${FASE[tid].padEnd(6)}: ${L.evid[tid].slice(0, 150)}`);
  }
  // matriz de cobertura: quantos itens cada documento cobre, e a UNIÃO
  const union = linhas.filter((L) => L.achadoEm > 0).length;
  console.log(`\n══════ COBERTURA ══════`);
  for (const d of docs) console.log(`  ${FASE[d.tid].padEnd(8)} localiza ${cobPorDoc[d.tid]}/${itens.length}`);
  console.log(`  UNIÃO (achado em ≥1 doc): ${union}/${itens.length} (${(100 * union / itens.length).toFixed(0)}%)`);
  console.log(`  distribuição achadoEm: ${[0, 1, 2, 3].map((k) => `${k}doc:${linhas.filter((L) => L.achadoEm === k).length}`).join(" · ")}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
