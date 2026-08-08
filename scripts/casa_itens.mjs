// CASADOR ENDURECIDO — liga cada item da API à sua linha no documento, por CONTEÚDO + POSIÇÃO, com CONFIANÇA.
// Conserta o caso ambíguo (serviço/lote, descrições quase iguais) sem quebrar o caso limpo (reordenação).
//
// Três eixos, na ordem:
//  1. CONTEÚDO pesado por IDF sobre o conjunto de itens DO PROCESSO — o token que DIFERENCIA pesa (rejuvenecimento,
//     "4 polos"), o que REPETE (motor, polos) não. É o que separa "rejuvenecimento" de "rebobinagem" na mesma linha.
//  2. POSIÇÃO como DESEMPATE (não regra): conteúdo claro → manda (permite reordenação); conteúdo ambíguo (item igual
//     no lote 1 e no lote 2) → a sequência decide (continua adiante = próximo lote).
//  3. CONFIANÇA + UNICIDADE: margem best×2º dá o grau; dois itens não caem na mesma linha; baixa confiança = revisão.
//
// node scripts/casa_itens.mjs [CNPJ ANO SEQ TIPODOC]   (default: motores 84591890000143 2025 156, doc=2 Edital)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const comLimite = (p, ms) => Promise.race([p, new Promise((_, x) => setTimeout(() => x(new Error("timeout")), ms))]);

// ═══ \n É A LINHA E \t É A COLUNA — NENHUM DOS DOIS SE COLAPSA ═══
// A versão anterior fazia `replace(/[^a-z0-9]+/g, " ")`, e `[^a-z0-9]` casa `\n`: toda quebra virava espaço.
// O efeito, medido em 08/ago: a re-extração com geometria já converteu 198.106 documentos-fonte, que estão
// no banco com 2.000+ linhas cada — e o enriquecimento ACHATAVA tudo de novo aqui, na primeira função.
// A geometria era reconstruída a um custo alto e descartada uma linha depois. Com o documento virando
// fluxo, qualquer recorte vira janela por proximidade, e é isso que produzia descrição pegando o cabeçalho
// da tabela ou o fim do item anterior.
// É também o que toda ferramenta madura do ramo faz — pdfplumber, Camelot, pdf.js-extract (`pageToLines`):
// agrupar por Y, delimitar por X, e trabalhar por LINHA/CÉLULA, nunca por janela de N caracteres.
// ⚠️ NÃO quebra o casamento: `buildIndex` varre com /[a-z0-9]+/g e já ignora todo separador, então o índice
// de tokens é idêntico com ou sem a quebra. O que muda é só a existência da fronteira para quem recorta.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9\n\t]+/g, " ")    // preserva \n (linha) e \t (COLUNA); o resto vira espaço
  .replace(/ *\t */g, "\t")           // sem espaço sobrando em volta da fronteira de célula
  .replace(/ *\n */g, "\n")
  .replace(/\n{2,}/g, "\n").trim();
const stripLote = (s) => s.replace(/^\s*lote\s*0*\d+\s*[-–:]*\s*/i, "");
const loteDe = (s) => { const m = /lote\s*0*(\d+)/i.exec(s || ""); return m ? +m[1] : null; };
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv svc item lote frete gratis".split(" "));
const sigTokens = (d) => { const s = new Set(); for (const w of stripLote(norm(d)).split(" ")) { if (/^\d+$/.test(w)) { if (w.length >= 2) s.add(w); } else if (w.length >= 5 && !STOP.has(w)) s.add(w); } return [...s]; };
const buildIndex = (t) => { const idx = new Map(); const re = /[a-z0-9]+/g; let m; while ((m = re.exec(t)) !== null) { const k = m[0]; if ((/^\d+$/.test(k) && k.length >= 2) || k.length >= 5) { let a = idx.get(k); if (!a) { a = []; idx.set(k, a); } a.push(m.index); } } return idx; };

// IDF sobre o CONJUNTO DE ITENS: token em muitos itens (motor, polos) → baixo; em poucos (rejuvenecimento) → alto.
function idfItens(itensToks) {
  const n = itensToks.length, df = new Map();
  for (const toks of itensToks) for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 0.5)));
  return idf;
}
// candidatos de localização: ancora no token de maior IDF, pontua janela por SOMA de IDF dos tokens do item presentes.
function candidatos(toks, idx, idf, W = 200) {
  const present = toks.filter((t) => idx.has(t));
  if (present.length < 2) return [];
  const anchor = present.slice().sort((a, b) => (idf.get(b) || 0) - (idf.get(a) || 0))[0];
  const raw = [];
  for (const o of idx.get(anchor)) {
    let score = 0; const seen = new Set();
    for (const t of present) if (!seen.has(t) && idx.get(t).some((x) => Math.abs(x - o) <= W)) { score += (idf.get(t) || 0.1); seen.add(t); }
    raw.push({ off: o, score });
  }
  raw.sort((a, b) => b.score - a.score || a.off - b.off);
  const out = [];                                     // dedupe janelas coladas (mesma linha) — janela estreita p/ tabela densa
  for (const c of raw) if (!out.some((u) => Math.abs(u.off - c.off) < 40)) out.push(c);
  return out;
}

// casamento sequencial: conteúdo primário, posição desempata o ambíguo, unicidade garantida.
function casa(itens, docText) {
  const itensToks = itens.map((it) => sigTokens(it.descricao));
  const idf = idfItens(itensToks);
  const idx = buildIndex(norm(docText));
  const usados = []; let last = -1; const res = [];
  for (let k = 0; k < itens.length; k++) {
    const all = candidatos(itensToks[k], idx, idf);
    if (!all.length) { res.push({ off: null, conf: "baixa", motivo: "sem candidato" }); continue; }
    let cands = all.filter((c) => !usados.some((u) => Math.abs(u - c.off) < 40));
    let conflito = false;
    if (!cands.length) { cands = [all[0]]; conflito = true; }   // linha já usada → flag, nunca dropa em silêncio
    const top = cands[0], second = cands[1];
    const margin = second ? (top.score - second.score) / (top.score || 1) : 1;
    let chosen, conf, motivo;
    if (margin >= 0.35) { chosen = top; conf = "alta"; motivo = "conteudo"; }          // conteúdo decide (permite reordenação)
    else {                                                                              // ambíguo → posição desempata
      const near = cands.filter((c) => c.score >= top.score * 0.8);
      const fwd = near.filter((c) => c.off > last).sort((a, b) => a.off - b.off);
      chosen = fwd[0] || near.sort((a, b) => a.off - b.off)[0];
      conf = fwd.length ? "media" : "baixa"; motivo = fwd.length ? "posicao" : "posicao(sem-avanco)";
    }
    if (conflito) { conf = "baixa"; motivo = "conflito"; }
    usados.push(chosen.off); last = chosen.off;
    res.push({ off: chosen.off, score: +chosen.score.toFixed(1), margin: +margin.toFixed(2), conf, motivo });
  }
  return { res, docNorm: norm(docText) };
}

async function getTexto(uri) {
  const r = await fetch(uri, { signal: AbortSignal.timeout(60000) });
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] !== 0x25 && !/pdf/i.test(r.headers.get("content-type") || "")) return Buffer.from(buf).toString("utf8");
  try { return await comLimite((async () => (await extractText(await getDocumentProxy(buf), { mergePages: true })).text || "")(), 40000); } catch { return ""; }
}

async function main() {
  const [CNPJ, ANO, SEQ, TIPO] = [process.argv[2] || "84591890000143", +(process.argv[3] || 2025), +(process.argv[4] || 156), +(process.argv[5] || 2)];
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  const doc = (await db.query(`select uri from arquivos_sc where cnpj=$1 and ano=$2 and seq=$3 and tipo_documento_id=$4 limit 1`, [CNPJ, ANO, SEQ, TIPO])).rows[0];
  await db.end();
  const j = await (await fetch(`${PNCP}/orgaos/${CNPJ}/compras/${ANO}/${SEQ}/itens?pagina=1&tamanhoPagina=500`, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) })).json();
  const itens = (Array.isArray(j) ? j : j.data || []).sort((a, b) => a.numeroItem - b.numeroItem);
  const txt = await getTexto(doc.uri);
  const { res, docNorm } = casa(itens, txt);

  const N = Math.min(itens.length, 12);
  console.log(`processo ${CNPJ} ${ANO}/${SEQ} · doc tipo ${TIPO} · ${itens.length} itens\n`);
  for (let k = 0; k < N; k++) {
    const it = itens[k], r = res[k];
    const passagem = r.off != null ? docNorm.slice(Math.max(0, r.off - 10), r.off + 70).replace(/\s+/g, " ") : "—";
    console.log(`item ${String(it.numeroItem).padStart(3)}${loteDe(it.descricao) ? " L" + loteDe(it.descricao) : ""} [${r.conf.padEnd(5)} ${(r.motivo || "").padEnd(8)}] ${stripLote(it.descricao || "").replace(/\s+/g, " ").slice(0, 44).padEnd(44)} → ${passagem.slice(0, 70)}`);
  }
  const c = { alta: 0, media: 0, baixa: 0 };
  for (const r of res) c[r.conf]++;
  console.log(`\nconfiança: alta ${c.alta} · média ${c.media} · baixa ${c.baixa}  (de ${itens.length})`);
}
export { norm, stripLote, loteDe, sigTokens, buildIndex, candidatos, idfItens, casa, getTexto };
if (process.argv[1] && process.argv[1].endsWith("casa_itens.mjs"))
  main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
