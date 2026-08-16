// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_transparenciaweb.mjs — folha nominal dos portais **TransparenciaWeb** (ASP.NET WebForms).
//
// O produto: `transparencia.{municipio}.{uf}.gov.br`, título "TransparenciaWeb.com.br", grade
// `Pessoal.Servidor.aspx?ctbUnidadeGestoraId=..&exercicio=AAAA&periodo=tpMes`. Domina a Grande Vitória (ES):
// Cariacica, Serra, Vila Velha, Aracruz, Guarapari — as maiores folhas do estado, que nenhum coletor alcançava.
//
// ⭐ O CAMINHO (três descobertas que valem para qualquer portal deste produto):
//  1. 🚨 **O user-agent do PNIGP é BLOQUEADO.** Com ele, `transparencia.serra/vilavelha/aracruz` devolvem nada e
//     parecem "portal fora do ar" — com UA de navegador respondem 200. Foi o que escondeu 5 cidades grandes.
//  2. O `.ashx` de exportação (CSV/PDF) só funciona com o **cookie de SESSÃO ASP.NET** obtido na página — e o CSV
//     dele **NÃO TEM CARGO** (só matrícula, CPF, admissão, nome, lotação, quadro e os três valores). O Excel está
//     quebrado no servidor ("Access to the path ... .xlsx is denied").
//  3. ⭐ **A grade inteira sai num POST**: o combo "Itens" tem a opção `Todos` (`ddlItens=9999`) com autopostback.
//     Um POST com o __VIEWSTATE da página devolve os 9.054 servidores de Cariacica em 6s (27 MB) — COM cargo,
//     lotação, carga horária, admissão e os três valores. É a via completa, e é uma requisição por competência.
//
// A competência é a **mais cheia**, não a mais recente ([[pnigp-competencia-mais-cheia-nao-a-recente]]): o mês
// corrente costuma estar pela metade. O sondador lê o "N servidores encontrados" de cada mês (GET barato) e o
// POST pesado roda uma vez só, no mês vencedor.
//
// 🚨 Entidade-espelho ([[pnigp-entidade-espelho-infla-folha]]): o combo de unidade gestora traz o RPPS e fundos
// que às vezes devolvem a MESMA lista da prefeitura. Cada UG é comparada por conteúdo (hash do conjunto de
// matrículas) e a repetida é descartada — senão a folha do município sai inflada.
//
// Uso: node scripts/ingest_folha_transparenciaweb.mjs        · SO=serra ...  · ANO=2026 ... · REFAZ=1 refaz os ok
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const ANO = process.env.ANO ? +process.env.ANO : new Date().getFullYear();
const REFAZ = process.env.REFAZ === "1";

// 🚨 UA de NAVEGADOR: com o UA do PNIGP, três dos cinco portais não respondem (ver cabeçalho).
const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,*/*", "accept-language": "pt-BR,pt;q=0.9",
};
const MESES = ["tpJaneiro", "tpFevereiro", "tpMarco", "tpAbril", "tpMaio", "tpJunho",
  "tpJulho", "tpAgosto", "tpSetembro", "tpOutubro", "tpNovembro", "tpDezembro"];
const MM = Object.fromEntries(MESES.map((m, i) => [m, String(i + 1).padStart(2, "0")]));

const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (buf) => { const u = buf.toString("utf8"); return /�/.test(u.slice(0, 4000)) ? buf.toString("latin1") : u; };
const desesc = (s) => s.replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const texto = (h) => desesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// valor brasileiro: "3.858,75" → 3858.75. Nunca tratar ponto como decimal aqui (o portal usa formato pt-BR).
const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/R\$|\s/g, "").trim();
  if (!s || s === "-") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// sessão HTTP com jarra de cookies (o .aspx guarda o estado da grade na sessão)
function navegador() {
  const c = new Map();
  const H = () => [...c].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (url, opt = {}) => {
    const r = await fetch(url, {
      redirect: "follow", signal: AbortSignal.timeout(opt.timeout || 300000), method: opt.method || "GET",
      body: opt.body, headers: { ...UA, ...(H() ? { cookie: H() } : {}), ...(opt.headers || {}) },
    });
    for (const sc of (r.headers.getSetCookie?.() || [])) {
      const kv = sc.split(";")[0]; const i = kv.indexOf("=");
      if (i > 0) c.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return { st: r.status, buf: Buffer.from(await r.arrayBuffer()) };
  };
}

await q(`create table if not exists folha_tw_portal (
  cod_ibge text primary key, municipio text, uf text, base_url text, ativo boolean default true
)`);
await q(`create table if not exists folha_servidores_transparenciaweb (
  cod_ibge text, municipio text, uf text, unidade_gestora text, competencia text,
  matricula text, nome text, secretaria text, quadro text, cargo text, carga_horaria text,
  data_admissao text, data_desligamento text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tw_mun on folha_servidores_transparenciaweb (cod_ibge, competencia)`);
await q(`create table if not exists folha_tw_coleta (
  cod_ibge text, ug text, municipio text, uf text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now(), primary key (cod_ibge, ug)
)`);

// Portais do ES descobertos pelo diagnóstico profundo (home da prefeitura → link de transparência → assinatura).
// 🚨 Guarapari: o link que a prefeitura publica (e que está no Radar) aponta para a **porta :82**, que não aceita
// conexão nenhuma — dava `fetch failed`, com cara de portal fora do ar. O portal está de pé no 443 normal.
// Mesmo padrão de [[pnigp-varredura-host-porta-onpremise]], invertido: aqui a porta alta é que está morta.
const SEMENTE = [
  ["3201308", "Cariacica", "ES", "https://transparencia.cariacica.es.gov.br/"],
  ["3205002", "Serra", "ES", "https://transparencia.serra.es.gov.br/"],
  ["3205200", "Vila Velha", "ES", "https://transparencia.vilavelha.es.gov.br/"],
  ["3200607", "Aracruz", "ES", "https://transparencia.aracruz.es.gov.br/"],
  ["3202405", "Guarapari", "ES", "https://transparencia.guarapari.es.gov.br/"],
  // ⚠️ Vitória JÁ tinha coleta (pelo `ingest_folha_capitais`, via web service próprio) — e ela vinha CURTA:
  // 11.664 servidores contra os 12.441 que o próprio portal declara em 06/2026, e média de R$ 2.237 (metade da
  // dos vizinhos). É o mesmo produto, então entra aqui para ser colhida pela via da grade, que fecha com o total
  // do portal. A coleta antiga não é apagada ([[pnigp-nunca-remover-compras]]); o relatório fica com a fatia mais cheia.
  ["3205309", "Vitória", "ES", "https://transparencia.vitoria.es.gov.br/"],
];
for (const [cod, mun, uf, url] of SEMENTE) {
  await q(`insert into folha_tw_portal (cod_ibge,municipio,uf,base_url) values ($1,$2,$3,$4)
           on conflict (cod_ibge) do update set base_url=excluded.base_url`, [cod, mun, uf, url]);
}

const alvos = (await q(`select * from folha_tw_portal where ativo
  ${SO ? "and (municipio ilike '%'||$1||'%' or cod_ibge = $1)" : ""} order by municipio`, SO ? [SO] : [])).rows;
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge||'|'||ug k from folha_tw_coleta where situacao='ok'`)).rows.map((r) => r.k));
console.log(`[tw] ${alvos.length} portais · ${feitos.size} unidades já feitas`);

// ── lê a grade de uma competência e devolve {contagem, html} ────────────────────────────────────────────────────
// 🚨 SESSÃO NOVA A CADA SONDAGEM. O .aspx guarda o filtro da grade na SESSÃO: reusar o mesmo cookie faz o mês
// seguinte devolver o resultado do anterior — medido em Cariacica (junho tinha 9.067 e, dentro da sessão já usada,
// respondia os 9.054 de maio). Com contaminação a "competência mais cheia" escolhe o mês errado E grava valores
// de outro mês, sem nenhum sinal de erro.
const CONTA = /([\d.]+)\s*-\s*([\d.]+)\s*de\s*([\d.]+)\s*servidores/i;
async function conta(base, ug, ano, periodo) {
  const url = `${base}Pessoal.Servidor.aspx?${ug ? `ctbUnidadeGestoraId=${ug}&` : ""}exercicio=${ano}&periodo=${periodo}`;
  const nav = navegador();
  const r = await nav(url, { timeout: 120000 });
  if (r.st !== 200) return { n: 0, url, html: "", nav };
  const html = dec(r.buf);
  const m = html.match(CONTA);
  return { n: m ? +m[3].replace(/\./g, "") : 0, url, html, nav };
}

// ── POST "Todos" (ddlItens=9999): a grade inteira numa requisição ───────────────────────────────────────────────
const campo = (h, id) => {
  const m = h.match(new RegExp(`(?:id|name)="${id}"[^>]*value="([^"]*)"`, "i"))
         || h.match(new RegExp(`value="([^"]*)"[^>]*(?:id|name)="${id}"`, "i"));
  return m ? desesc(m[1]) : "";
};
async function postback(nav, url, html, alvo, extra = {}) {
  const body = new URLSearchParams();
  body.set("__EVENTTARGET", alvo); body.set("__EVENTARGUMENT", ""); body.set("__LASTFOCUS", "");
  for (const k of ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED"]) {
    const v = campo(html, k); if (v) body.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) body.set(k, v);
  const r = await nav(url, { method: "POST", body: body.toString(), timeout: 600000,
    headers: { "content-type": "application/x-www-form-urlencoded", referer: url } });
  return r.st === 200 ? dec(r.buf) : null;
}

// 🚨 "Todos" NÃO é tudo: a opção do combo vale **9999**, que é o TAMANHO DA PÁGINA. Serra (14.367 servidores)
// voltou exatamente 9.999 linhas — número redondo com cara de coleta completa. É o defeito nº 2 de
// [[pnigp-coletor-ok-sem-dado-sete-causas]] (página única lida como total). Quem denuncia é o cabeçalho
// "de N servidores encontrados", que sempre traz o TOTAL verdadeiro.
//
// 🚨 E a paginação NÃO funciona com página de 9999: o __VIEWSTATE de uma página de 30 MB é grande demais e o
// POST de "Próxima" volta uma página vazia (sem erro, sem status ruim). Por isso o tamanho da página é ESCOLHIDO:
// 9999 numa tacada quando cabe (Cariacica: 9.141 em 6s) e 200 com pager quando não cabe (Serra: 72 páginas ~1s).
const PAG_GRANDE = 9999, PAG_PEQUENA = 200;

// ⭐ AS DUAS PONTAS — como colher mais de 9.999 sem depender do pager.
// Em Vitória (13.022) a paginação de 200 morre por volta da 20ª página: o portal passa a devolver a página de erro
// do ASP.NET com HTTP 200, e a coleta pararia em 4.000 achando que acabou. Mas a MESMA grade aceita ORDENAR:
//   1 clique em `Sort$Matricula` → ordem crescente → com itens=9999 vêm as 9.999 PRIMEIRAS
//   2 cliques                    → ordem decrescente → vêm as 9.999 ÚLTIMAS
// A união das duas pontas cobre tudo enquanto o total for ≤ 19.998 — em Vitória deu 13.022 de 13.022, em duas
// requisições grandes em vez de 66 frágeis. 🚨 O clique de ordenação precisa ser dado com a página PEQUENA
// (itens=15): a partir da página de 27 MB o POST é grande demais e o servidor rejeita (0 linhas, HTTP 200).
async function duasPontas(base, ug, ano, periodo) {
  const paginas = [];
  for (const cliques of [1, 2]) {
    const nav = navegador();
    const url = `${base}Pessoal.Servidor.aspx?${ug ? `ctbUnidadeGestoraId=${ug}&` : ""}exercicio=${ano}&periodo=${periodo}`;
    const r0 = await nav(url, { timeout: 120000 });
    if (r0.st !== 200) continue;
    let h = dec(r0.buf);
    const ddl = (h.match(/name="([^"]*ddlItens)"/i) || [])[1];
    const s = h.match(/__doPostBack\((?:&#39;|')([^&']*gvVencimentoServidor)(?:&#39;|'),(?:&#39;|')(Sort\$Matricula)/i);
    if (!ddl || !s) return paginas;
    for (let k = 0; k < cliques; k++) {
      const t = await postback(nav, url, h, s[1], { __EVENTARGUMENT: s[2], [ddl]: "15" });
      if (!t) break;
      h = t;
    }
    const g = await postback(nav, url, h, ddl, { [ddl]: String(PAG_GRANDE) });
    if (g) paginas.push(g);
    await dorme(1500);
  }
  return paginas;
}

async function gradeToda(nav, url, html) {
  const ddl = (html.match(/name="([^"]*ddlItens)"/i) || [])[1];
  const total = +((html.match(CONTA) || [])[3] || "0").replace(/\./g, "");
  if (!ddl) return { paginas: [html], total };
  const tam = String(total && total > PAG_GRANDE ? PAG_PEQUENA : PAG_GRANDE);
  let h = (await postback(nav, url, html, ddl, { [ddl]: tam })) || html;
  const paginas = [h];
  let acc = linhas(h).regs.length;
  const proxima = (x) => (x.match(/__doPostBack\((?:&#39;|')([^&']*NextPageLink)(?:&#39;|')/i) || [])[1];
  const limite = Math.ceil((total || 0) / +tam) + 5;
  for (let guarda = 0; total && acc < total && guarda < limite; guarda++) {
    const alvo = proxima(h);
    if (!alvo) break;
    // 🚨 uma falha de UMA página não pode encerrar a coleta em silêncio: em Vitória o pager parou na 9ª e o
    // município entrou como 'ok' com 1.600 de 13.022. Tenta de novo antes de desistir, e o chamador marca
    // 'parcial' quando o acumulado não alcança o total declarado.
    let h2 = null, n = 0;
    for (let t = 0; t < 5 && !n; t++) {
      h2 = await postback(nav, url, h, alvo, { [ddl]: tam });
      n = h2 ? linhas(h2).regs.length : 0;
      if (!n) { console.log(`   … página ${paginas.length + 1} falhou (${h2 ? "sem linhas" : "sem resposta"}), tentativa ${t + 2}`); await dorme(5000 * (t + 1)); }
    }
    if (!n) break;
    paginas.push(h2); acc += n; h = h2;
    await dorme(300);
  }
  return { paginas, total };
}

// ── parser da grade: mapeia PELO CABEÇALHO (a ordem das colunas muda entre portais) ─────────────────────────────
function linhas(html) {
  const tabela = html.match(/<table[^>]*gvVencimentoServidor[\s\S]*?<\/table>/i)
              || html.match(/<table[^>]*class="[^"]*GridView[^"]*"[\s\S]*?<\/table>/i);
  if (!tabela) return { cabecalho: [], regs: [] };
  const trs = [...tabela[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const celulas = (tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => texto(x[1]));
  const iCab = trs.findIndex((tr) => /<th/i.test(tr) && /servidor|matricula|matrícula/i.test(tr));
  if (iCab < 0) return { cabecalho: [], regs: [] };
  const cab = celulas(trs[iCab]).map((c) => c.toLowerCase());
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const col = {
    matricula: ix(/matr[ií]cula/), nome: ix(/servidor|nome/), secretaria: ix(/lota[çc][ãa]o|secretaria|unidade/),
    quadro: ix(/quadro|regime|v[ií]nculo/), cargo: ix(/cargo|fun[çc][ãa]o/), carga: ix(/carga/),
    admissao: ix(/admiss/), saida: ix(/exonera|inativa|desliga|demiss/),
    bruto: ix(/bruta|bruto/), desc: ix(/desconto/), liq: ix(/l[ií]quid/),
  };
  const regs = [];
  for (const tr of trs.slice(iCab + 1)) {
    if (/<th/i.test(tr)) continue;
    const c = celulas(tr);
    if (c.length < 4) continue;
    if (/^total/i.test(c[0] || "")) continue;             // a última linha da grade é o total
    const pega = (i) => (i >= 0 && i < c.length ? c[i] : null);
    const reg = {
      matricula: pega(col.matricula), nome: pega(col.nome), secretaria: pega(col.secretaria),
      quadro: pega(col.quadro), cargo: pega(col.cargo), carga_horaria: pega(col.carga),
      data_admissao: pega(col.admissao), data_desligamento: pega(col.saida) === "-" ? null : pega(col.saida),
      bruto: num(pega(col.bruto)), descontos: num(pega(col.desc)), liquido: num(pega(col.liq)),
    };
    if (!reg.nome && !reg.matricula) continue;
    regs.push(reg);
  }
  return { cabecalho: cab, regs };
}

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const todos = [...m.values()];
  for (let i = 0; i < todos.length; i += LOTE) {
    const p = todos.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_transparenciaweb
      (cod_ibge,municipio,uf,unidade_gestora,competencia,matricula,nome,secretaria,quadro,cargo,carga_horaria,
       data_admissao,data_desligamento,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("unidade_gestora"), c("competencia"), c("matricula"), c("nome"),
       c("secretaria"), c("quadro"), c("cargo"), c("carga_horaria"), c("data_admissao"), c("data_desligamento"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0;
for (const a of alvos) {
  console.log(`\n══ ${a.municipio} (${a.uf}) ${a.base_url}`);
  const nav = navegador();
  const marca = (ug, situacao, detalhe, comp = null, n = 0) =>
    q(`insert into folha_tw_coleta (cod_ibge,ug,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge,ug) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, ug, a.municipio, a.uf, comp, n, situacao, detalhe]);
  try {
    const home = await nav(`${a.base_url}Pessoal.Servidor.aspx`, { timeout: 120000 });
    if (home.st !== 200) { await marca("-", "erro", `home HTTP ${home.st}`); console.log(`  ✖ HTTP ${home.st}`); continue; }
    const h0 = dec(home.buf);
    const sel = h0.match(/<select[^>]*UnidadeGestora[\s\S]*?<\/select>/i);
    const ugs = sel ? [...sel[0].matchAll(/value="(\d+)"[^>]*>([^<]+)</g)].map((m) => ({ id: m[1], nome: desesc(m[2]).trim() }))
                    : [{ id: "", nome: a.municipio }];
    console.log(`  ${ugs.length} unidade(s) gestora(s)`);

    const assinaturas = new Map();     // hash do conjunto de matrículas → UG que já gravou (anti espelho)
    for (const ug of ugs) {
      const chave = `${a.cod_ibge}|${ug.id || "-"}`;
      if (feitos.has(chave)) { console.log(`  · ${ug.nome}: já feito`); continue; }
      // competência MAIS CHEIA do exercício (e do anterior se o corrente estiver vazio)
      let melhor = { n: 0 };
      for (const ano of [ANO, ANO - 1]) {
        for (const p of MESES) {
          const c = await conta(a.base_url, ug.id, ano, p);
          if (c.n > melhor.n) melhor = { ...c, ano, periodo: p };
          await dorme(200);
        }
        if (melhor.n > 0) break;
      }
      if (!melhor.n) { await marca(ug.id || "-", "vazio", `sem servidores em ${ANO}/${ANO - 1}`); console.log(`  · ${ug.nome}: vazio`); continue; }
      const comp = `${melhor.ano}${MM[melhor.periodo]}`;
      // o POST usa a MESMA sessão que abriu a página vencedora (o __VIEWSTATE e o filtro pertencem a ela).
      // 🚨 O portal às vezes devolve a PÁGINA DE ERRO do ASP.NET com HTTP 200 ("Infelizmente ocorreu um problema.
      // Log ID: …") — que parseia como zero linhas e viraria "município não publica". Quando isso acontece, a
      // tentativa recomeça do zero: sessão nova, página nova, postback novo.
      let regs = [], total = melhor.n;
      const dedup = (lista) => {
        const m = new Map();
        for (const r of lista) m.set(`${r.matricula}¦${r.nome}¦${r.cargo}`, r);
        return [...m.values()];
      };
      // acima de 9.999 a via boa é a das DUAS PONTAS (ordenação), não o pager
      if (melhor.n > PAG_GRANDE) {
        regs = dedup((await duasPontas(a.base_url, ug.id, melhor.ano, melhor.periodo)).flatMap((p) => linhas(p).regs));
        if (regs.length) console.log(`  · ${ug.nome}: duas pontas → ${regs.length} de ${total}`);
      }
      for (let t = 0; t < 3 && regs.length < total * 0.99; t++) {
        const alvo = t === 0 ? melhor : await conta(a.base_url, ug.id, melhor.ano, melhor.periodo);
        if (!alvo.html) { await dorme(5000); continue; }
        const g = await gradeToda(alvo.nav, alvo.url, alvo.html);
        total = g.total || total;
        const novos = dedup([...regs, ...g.paginas.flatMap((p) => linhas(p).regs)]);
        if (novos.length > regs.length) regs = novos;
        if (regs.length < total * 0.99) { console.log(`  … ${ug.nome}: ${regs.length} de ${total}, tentativa ${t + 2}`); await dorme(8000); }
      }
      if (!regs.length) { await marca(ug.id || "-", "erro", "grade sem linhas após POST", comp); console.log(`  ✖ ${ug.nome}: grade vazia`); continue; }
      if (total && regs.length < total) console.log(`  ⚠ ${ug.nome}: ${regs.length} de ${total} declarados`);

      const assina = crypto.createHash("md5").update(regs.map((r) => r.matricula).sort().join("|")).digest("hex");
      if (assinaturas.has(assina)) {
        await marca(ug.id || "-", "espelho", `mesma lista de ${assinaturas.get(assina)}`, comp, regs.length);
        console.log(`  ⚠ ${ug.nome}: ESPELHO de ${assinaturas.get(assina)} — descartado (${regs.length} linhas)`);
        continue;
      }
      assinaturas.set(assina, ug.nome);

      const prep = regs.map((r) => ({
        ...r, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, unidade_gestora: ug.nome, competencia: comp,
        _hash: crypto.createHash("md5").update([a.cod_ibge, ug.id, comp, r.matricula, r.nome, r.cargo].join("¦")).digest("hex"),
      }));
      await grava(prep);
      totalGeral += prep.length;
      // 'parcial' NÃO entra em `feitos`: o relançamento tenta de novo em vez de dar o município por fechado.
      const completo = !total || prep.length >= total;
      await marca(ug.id || "-", completo ? "ok" : "parcial", completo ? null : `${prep.length} de ${total} declarados`, comp, prep.length);
      const comValor = prep.filter((r) => r.bruto > 0).length;
      console.log(`  ✔ ${ug.nome}: ${prep.length} servidores (${comp}) · ${comValor} com valor · ${prep.filter((r) => r.cargo).length} com cargo · ${prep.filter((r) => r.secretaria).length} com lotação`);
      await dorme(1500);
    }
  } catch (e) {
    await marca("-", "erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ ${String(e?.cause?.message || e.message).slice(0, 100)}`);
  }
}
console.log(`\n[tw] ${totalGeral.toLocaleString("pt-BR")} servidores gravados`);
await db.end();
