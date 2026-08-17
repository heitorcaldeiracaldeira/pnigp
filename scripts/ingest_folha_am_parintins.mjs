// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_am_parintins.mjs — folha nominal de **Parintins/AM** (2ª maior folha do estado, 8.496 vínculos
// na RAIS), que não está nem no portal da AAM nem no ANC.
//
// O portal é próprio (`transparencia.parintins.am.gov.br`, rotas `?q=517-...`) e ⭐ entrega **os cinco campos na
// PRÓPRIA TABELA**: Matrícula · Nome · **Função** · Vínculo · C.H. · **Órgão** · **Bruto** · Deduções · Líquido ·
// Competência. Nada de PDF, nada de detalhe por servidor.
//
// A paginação é AJAX e o `script.js` entrega a receita inteira:
//   `Enviar(form, action, btn, read, pag)` → `POST themes/conttroller.php` com o form serializado
//   + `acao=folha` (o valor do input escondido `tipo-consulta`) + `pag=N`.
// A última página vem no próprio HTML (`<li class="pag" id="481">ultima</li>`), então dá para saber o tamanho
// antes de raspar — e escolher a competência mais cheia sem baixar tudo.
//
// Uso: node scripts/ingest_folha_am_parintins.mjs   ·   ANO=2026 MES=01   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const B = "https://transparencia.parintins.am.gov.br/";
const COD_IBGE = "1303403", MUNICIPIO = "Parintins";
const REFAZ = process.env.REFAZ === "1";
const ANO = process.env.ANO || null, MES = process.env.MES || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 3000)) ? b.toString("latin1") : u; };
const lim = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s || s === "-") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function req(url, opt = {}) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { method: opt.method || "GET", body: opt.body, redirect: "follow",
        signal: AbortSignal.timeout(opt.timeout || 90000),
        headers: { ...UA, ...(opt.headers || {}) } });
      const b = Buffer.from(await r.arrayBuffer());
      return { st: r.status, t: dec(b), n: b.length };
    } catch (e) { if (t === 3) return { st: 0, t: "", n: 0, erro: String(e?.cause?.message || e.message).slice(0, 50) }; await dorme(2500 * (t + 1)); }
  }
}

await q(`create table if not exists folha_servidores_parintins (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, vinculo text, carga_horaria text, secretaria text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_parintins on folha_servidores_parintins (cod_ibge, competencia)`);
await q(`create table if not exists folha_parintins_coleta (
  cod_ibge text, competencia text, paginas int, servidores int, situacao text, detalhe text,
  em timestamptz default now(), primary key (cod_ibge, competencia)
)`);

// uma página de resultados (pag=1 é o próprio HTML da tela; as demais vêm do controller)
async function pagina(ano, mes, tipo, pag) {
  const body = new URLSearchParams({ q: "517-search", nome: "", funcao: "", vinculo: "", orgao_id: "",
    mes, ano, tipo, "tipo-consulta": "folha", acao: "folha", pag: String(pag) });
  const r = await req(`${B}themes/conttroller.php`, { method: "POST", body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest",
      referer: `${B}?q=517-lista-8550-folha-de-pagamento` } });
  return r;
}

// linhas da tabela → registros (mapeadas PELO CABEÇALHO, que a resposta repete em toda página)
function linhas(html, comp) {
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => lim(x[1])));
  const cab = trs.find((c) => c.some((x) => /matr[íi]cula/i.test(x)));
  if (!cab) return [];
  const ix = (re) => cab.findIndex((x) => re.test(x));
  const C = { mat: ix(/matr[íi]cula/i), nome: ix(/^nome/i), cargo: ix(/fun[çc][ãa]o/i), vinc: ix(/v[íi]nculo/i),
    ch: ix(/c\.?h/i), org: ix(/org[ãa]o|[óo]rg[ãa]o/i), bruto: ix(/bruto/i), desc: ix(/dedu|desconto/i),
    liq: ix(/l[íi]quido/i), comp: ix(/compet/i) };
  const out = [];
  for (const c of trs) {
    if (!c.length || c === cab) continue;
    const mat = C.mat >= 0 ? c[C.mat] : null;
    if (!mat || /matr[íi]cula/i.test(mat)) continue;
    const bruto = C.bruto >= 0 ? num(c[C.bruto]) : null;
    if (bruto == null) continue;
    const cp = (C.comp >= 0 ? c[C.comp] : "") || "";
    const m = cp.match(/(\d{2})\/(\d{4})/);
    out.push({ matricula: mat, nome: c[C.nome] || null, cargo: c[C.cargo] || null, vinculo: c[C.vinc] || null,
      carga_horaria: c[C.ch] || null, secretaria: c[C.org] || null, bruto,
      descontos: C.desc >= 0 ? num(c[C.desc]) : null, liquido: C.liq >= 0 ? num(c[C.liq]) : null,
      competencia: m ? `${m[2]}${m[1]}` : comp });
  }
  return out;
}

// ── escolhe a competência: a que tem MAIS PÁGINAS (o portal informa a última no HTML) ───────────────────────────
const MESES = ["12", "11", "10", "09", "08", "07", "06", "05", "04", "03", "02", "01"];
const ANOS = ANO ? [ANO] : ["2026", "2025"];
let melhor = null;
console.log("[parintins] medindo competências…");
for (const ano of ANOS) {
  for (const mes of (MES ? [MES] : MESES)) {
    const r = await pagina(ano, mes, "M", 1);
    if (r.st !== 200) continue;
    const ult = Math.max(0, ...[...r.t.matchAll(/class="pag"\s+id="(\d+)"/g)].map((m) => +m[1]));
    const n = linhas(r.t, `${ano}${mes}`).length;
    if (n && (!melhor || ult > melhor.ult)) melhor = { ano, mes, ult, n };
    if (ult) console.log(`   ${mes}/${ano}: ${ult} páginas`);
    await dorme(150);
  }
  if (melhor) break;
}
if (!melhor) { console.log("[parintins] nenhuma competência com dado"); await db.end(); process.exit(0); }
const comp = `${melhor.ano}${melhor.mes}`;
console.log(`[parintins] competência mais cheia: ${melhor.mes}/${melhor.ano} — ${melhor.ult} páginas`);

const jaFeito = !REFAZ && (await q(`select 1 from folha_parintins_coleta where cod_ibge=$1 and competencia=$2 and situacao='ok'`, [COD_IBGE, comp])).rowCount;
if (jaFeito) { console.log("[parintins] já coletado (REFAZ=1 para refazer)"); await db.end(); process.exit(0); }

// ── raspa todas as páginas ──────────────────────────────────────────────────────────────────────────────────────
const regs = new Map();
let falhas = 0;
for (let p = 1; p <= melhor.ult; p++) {
  const r = await pagina(melhor.ano, melhor.mes, "M", p);
  if (r.st !== 200) { falhas++; continue; }
  const ls = linhas(r.t, comp);
  if (!ls.length) falhas++;
  for (const l of ls) {
    const h = crypto.createHash("md5").update([COD_IBGE, l.competencia, l.matricula, l.nome, l.cargo].join("¦")).digest("hex");
    regs.set(h, { ...l, cod_ibge: COD_IBGE, municipio: MUNICIPIO, uf: "AM", _hash: h });
  }
  if (p % 50 === 0) process.stdout.write(`\r   … página ${p}/${melhor.ult} · ${regs.size} servidores`);
  await dorme(90);
}
console.log(`\n[parintins] ${regs.size} servidores · ${falhas} páginas falhas`);

const todos = [...regs.values()];
for (let i = 0; i < todos.length; i += 500) {
  const p = todos.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_parintins
    (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,vinculo,carga_horaria,secretaria,bruto,descontos,liquido,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[])
    on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
      liquido=excluded.liquido, secretaria=excluded.secretaria, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
     c("vinculo"), c("carga_horaria"), c("secretaria"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
}
await q(`insert into folha_parintins_coleta (cod_ibge,competencia,paginas,servidores,situacao,detalhe,em)
  values ($1,$2,$3,$4,$5,$6,now())
  on conflict (cod_ibge,competencia) do update set paginas=excluded.paginas, servidores=excluded.servidores,
    situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
  [COD_IBGE, comp, melhor.ult, todos.length, falhas ? "parcial" : "ok", falhas ? `${falhas} páginas falharam` : null]);
console.log(`[parintins] gravado: ${todos.length} servidores em ${comp}`);
await db.end();
