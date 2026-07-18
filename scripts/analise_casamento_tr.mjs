// ANÁLISE DO CASAMENTO API × TR em 200 pregões variados — mede a DISTRIBUIÇÃO real do problema de casar
// item da API com item do documento, para dimensionar o casador (não é o casador; é o estudo que o informa).
// Por processo mede: cobertura (acho o item no TR?), concordância de posição (a ordem embaralha?),
// ambiguidade de conteúdo (descrições repetidas), código de catálogo no item, e se o TR tem texto.
// Escreve JSONL incremental (resumível) + agrega no fim. node scripts/analise_casamento_tr.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const N = Number(process.env.N || 200);
const CONC = Number(process.env.CONC || 3);
const OUT = path.join(ROOT, "logs", "analise_casamento_tr.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comLimite = (p, ms) => Promise.race([p, new Promise((_, x) => setTimeout(() => x(new Error("timeout")), ms))]);

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stripLote = (s) => s.replace(/^\s*lote\s*0*\d+\s*[-–:]*\s*/i, "");
const loteDe = (s) => { const m = /lote\s*0*(\d+)/i.exec(s || ""); return m ? +m[1] : null; };
// ── chave de posição: LOCALIZAÇÃO POR JANELA (não um token só) ──────────────────────────────────────────────
// tokens distintivos do item = números (dimensões/gramaturas, ≥2 díg.) + palavras longas (≥5, fora do stoplist).
// o item é "localizado" no TR quando ≥2 desses tokens co-ocorrem numa janela — acha a LINHA do item mesmo com
// termos repetidos, e serve p/ medir a ordem (posição casa?).
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote frete gratis".split(" "));
function tokensItem(descNorm) {
  const set = new Set();
  for (const w of descNorm.split(" ")) {
    if (/^\d+$/.test(w)) { if (w.length >= 2) set.add(w); }
    else if (w.length >= 5 && !STOP.has(w)) set.add(w);
  }
  return [...set];
}
function buildIndex(trN) {
  const idx = new Map(); const re = /[a-z0-9]+/g; let m;
  while ((m = re.exec(trN)) !== null) {
    const t = m[0];
    if ((/^\d+$/.test(t) && t.length >= 2) || t.length >= 5) {
      let a = idx.get(t); if (!a) { a = []; idx.set(t, a); } a.push(m.index);
    }
  }
  return idx;
}
function locate(itToks, idx, W = 200) {
  const present = itToks.filter((t) => idx.has(t));
  if (present.length < 2) return null;
  present.sort((a, b) => idx.get(a).length - idx.get(b).length);   // âncora = token mais raro
  let best = 0, bestOff = null;
  for (const o of idx.get(present[0])) {
    let c = 0;
    for (const t of present) if (idx.get(t).some((x) => Math.abs(x - o) <= W)) c++;
    if (c > best) { best = c; bestOff = o; }
  }
  return best >= 2 ? bestOff : null;
}

async function getJson(url, ms = 30000) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(ms) });
      if (r.status === 429 || /text\/html/i.test(r.headers.get("content-type") || "")) { await sleep(6000 * (t + 1)); continue; }
      if (r.status === 204) return [];
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
async function getTrTexto(uri) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(uri, { signal: AbortSignal.timeout(45000) });
      if (r.status === 429) { await sleep(6000 * (t + 1)); continue; }
      if (!r.ok) return "";
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf[0] !== 0x25 && !/pdf/i.test(r.headers.get("content-type") || "")) return Buffer.from(buf).toString("utf8");
      try { return (await comLimite((async () => (await extractText(await getDocumentProxy(buf), { mergePages: true })).text || "")(), 30000)); }
      catch { return ""; }
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

function analisaProcesso(its, trTexto) {
  const trN = norm(trTexto);
  const idx = buildIndex(trN);
  const itens = its.slice().sort((a, b) => a.numeroItem - b.numeroItem).slice(0, 80);   // limita custo/processo
  const lotes = new Set(itens.map((i) => loteDe(i.descricao)).filter((x) => x != null));
  const catalogo = itens.filter((i) => i.catalogoCodigoItem != null && String(i.catalogoCodigoItem).trim() !== "").length;
  // ambiguidade: descrições (sem prefixo de lote) repetidas
  const normDescs = itens.map((i) => stripLote(norm(i.descricao)));
  const vistos = new Map(); let dup = 0;
  for (const d of normDescs) vistos.set(d, (vistos.get(d) || 0) + 1);
  for (const [, c] of vistos) if (c > 1) dup += c;
  // LOCALIZAÇÃO por janela: offset de cada item no TR, na ordem da API (null = não localizado)
  let located = 0; const offs = [];
  for (const it of itens) {
    const off = locate(tokensItem(stripLote(norm(it.descricao))), idx);
    if (off != null) { located++; offs.push(off); }
  }
  // concordância de posição: fração de pares (i<j, ordem API) com offset crescente no TR
  let conc = null;
  if (offs.length >= 3) {
    let ok = 0, tot = 0;
    for (let a = 0; a < offs.length; a++) for (let b = a + 1; b < offs.length; b++) { tot++; if (offs[a] < offs[b]) ok++; }
    conc = tot ? +(ok / tot).toFixed(3) : null;
  }
  return {
    n_itens: itens.length, n_lotes: lotes.size, por_lote: lotes.size >= 2,
    catalogo_cov: +(catalogo / itens.length).toFixed(3),
    dup_desc: dup,
    tr_chars: trTexto ? trTexto.length : 0, tr_ok: (trTexto || "").length > 500,
    cobertura: +(located / itens.length).toFixed(3),   // agora = LOCALIZADO (≥2 tokens co-ocorrem), sinal mais forte
    pos_conc: conc, pos_n: offs.length,
  };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 200000 });
  // 200 pregões variados (com TR), amostra aleatória por faixa de tamanho p/ variedade
  const procs = (await db.query(`
    with base as (
      select c.cnpj,c.ano,c.seq, max(c.plataforma) plataforma, max(c.municipio_nome) municipio, count(i.*)::int itens, min(a.uri) tr
      from contratacoes_sc c
      join itens_sc i on i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq
      join arquivos_sc a on a.cnpj=c.cnpj and a.ano=c.ano and a.seq=c.seq and a.tipo_documento_id=4
      where c.modalidade_id=6 and c.ano in (2024,2025)
      group by c.cnpj,c.ano,c.seq
      having count(i.*) >= 3
    )
    select * from base order by random() limit ${N}`)).rows;
  await db.end();
  console.log(`analisando ${procs.length} pregões · conc ${CONC}`);
  fs.writeFileSync(OUT, "");   // reinicia
  const feitos = [];
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      let rec = { cnpj: p.cnpj, ano: p.ano, seq: p.seq, itens_db: p.itens, plataforma: p.plataforma, municipio: p.municipio };
      try {
        const j = await getJson(`${PNCP}/orgaos/${p.cnpj}/compras/${p.ano}/${p.seq}/itens?pagina=1&tamanhoPagina=500`);
        const its = Array.isArray(j) ? j : (j?.data || []);
        if (!its.length) { rec.erro = "sem itens API"; }
        else {
          const tr = await getTrTexto(p.tr);
          if (tr === null) rec.erro = "TR fetch falhou";
          else rec = { ...rec, ...analisaProcesso(its, tr) };
        }
      } catch (e) { rec.erro = e.message.slice(0, 60); }
      feitos.push(rec);
      fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
      if (++done % 10 === 0) process.stdout.write(`  ${done}/${procs.length}\r`);
    }
  }));

  // ── agregação ──
  const ok = feitos.filter((r) => !r.erro && r.tr_ok);
  const semTr = feitos.filter((r) => !r.erro && !r.tr_ok);
  const err = feitos.filter((r) => r.erro);
  const med = (arr, f) => arr.length ? +(arr.reduce((s, x) => s + f(x), 0) / arr.length).toFixed(3) : null;
  const posHold = ok.filter((r) => r.pos_conc != null && r.pos_conc >= 0.9).length;
  const posBreak = ok.filter((r) => r.pos_conc != null && r.pos_conc < 0.9).length;
  console.log(`\n\n═══ AGREGADO (${feitos.length} pregões) ═══`);
  console.log(`TR com texto: ${ok.length} · TR sem texto (escaneado/vazio): ${semTr.length} · erro/fetch: ${err.length}`);
  console.log(`por-lote: ${feitos.filter((r) => r.por_lote).length} · com ambiguidade de conteúdo (dup>0): ${ok.filter((r) => r.dup_desc > 0).length}`);
  console.log(`cobertura média (item achado no TR): ${med(ok, (r) => r.cobertura)}`);
  console.log(`código de catálogo no item — cobertura média: ${med(feitos.filter((r) => r.catalogo_cov != null), (r) => r.catalogo_cov)} · processos c/ algum: ${feitos.filter((r) => r.catalogo_cov > 0).length}`);
  console.log(`posição: mede em ${posHold + posBreak} · SEGURA (conc≥0.9): ${posHold} · QUEBRA (<0.9): ${posBreak}`);
  console.log(`\ndetalhe em ${OUT}`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
