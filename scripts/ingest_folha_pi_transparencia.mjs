// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pi_transparencia.mjs — FOLHA COMPLETA dos municípios do PI que rodam a tela
// `/transparencia/folha-pagamento` ("Relação Nominal de Remuneração").
//
// ⭐ É A ÚNICA TELA DO PIAUÍ COM OS CINCO CAMPOS:
//    Número(matrícula) · Servidor · Cargo · **Lotação** · Folha(tipo) · **Remuneração** · **R. Líquida**
//    (+ % patronal, % servidor, base INSS). GET puro, sem token, sem navegador. Rodapé traz TOTAL: R$ ...
//
// 🚨 COMO ELA APARECEU: 7 municípios estavam marcados "vazio" porque a tela `/servidores` deles não batia com
//    o parser (o cabeçalho diz "Servidor", não "Nome"). Em vez de consertar o parser, li o MENU de
//    `/transparencia`: havia um link "Relação Nominal de Remuneração → /transparencia/folha-pagamento".
//    A tela boa estava a um clique. ⚠️ Quando uma tela decepciona, ler o MENU do portal antes de culpar o parser.
//
// ⚠️ COMPETÊNCIA: a página SEM parâmetro já abre na mais nova publicada (o `<option selected>` diz qual).
//    O mês precisa vir com dois dígitos (`mes=06`; `mes=6` devolve zero linhas — parece "não publica" e não é).
//    Confiro o mês anterior e fico com o MAIS CHEIO ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
//
// ⭐ PROVA REAL: o rodapé declara `TOTAL: R$ …`. Somo a coluna de remuneração e comparo — se divergir, o
//    parser leu coluna errada, e isso aparece no ledger em vez de passar como "ok".
//
// Uso: node scripts/ingest_folha_pi_transparencia.mjs   ·   SO=Palmeirais   ·   REFAZ=1   ·   CONC=6
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 30000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 60000, bodyTimeout: 240000 }));

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = Number(process.env.CONC || 6);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml" };

await q(`create table if not exists folha_servidores_pitransp (
  cod_ibge text, municipio text, uf text default 'PI', entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_pitransp_mun on folha_servidores_pitransp (cod_ibge)`);
await q(`create table if not exists folha_pitransp_coleta (
  cod_ibge text primary key, municipio text, url text, competencia text,
  linhas int, total_declarado numeric, total_somado numeric, situacao text, detalhe text, em timestamptz default now())`);

const alvos = (await q(`select cod_ibge, municipio, url from pi_folha_pag_sonda
   where url is not null ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_pitransp_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[pi-transp] ${alvos.length} municípios com a tela · ${fila.length} na fila`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
  .replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç").replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (v) => {
  const m = String(v || "").match(/(-?[\d.]+),(\d{2})/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]);
  return Number.isFinite(n) ? n : null;
};

async function pega(u, tent = 2) {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(180000) });
      if (r.status >= 400) return null;
      return await r.text();
    } catch { if (t === tent - 1) return null; }
  }
  return null;
}

function analisa(html) {
  const heads = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => sem(m[1]).toLowerCase());
  const col = (re) => heads.findIndex((h) => re.test(h));
  // ⚠️ "Remunerção" está escrito ERRADO na fonte (falta o "a"). O regex aceita as duas grafias — casar só com
  // "remuneração" devolveria -1 e a coluna de dinheiro sumiria sem ninguém notar.
  const ix = { mat: col(/n[úu]mero|matr[íi]cula/), nome: col(/servidor|nome/), cargo: col(/cargo/),
    lot: col(/lota[çc]|secretaria|setor/), folha: col(/^folha$/), bruto: col(/remuner|remunr/),
    liq: col(/l[íi]quid/) };
  const corpo = html.split(/<tbody/i)[1] || "";
  const linhas = [];
  for (const tr of corpo.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => sem(m[1]));
    if (c.length < 5) continue;
    const p = (i) => (i >= 0 && i < c.length ? c[i] || null : null);
    const nome = p(ix.nome);
    if (!nome || /^servidor$/i.test(nome)) continue;
    linhas.push({ mat: p(ix.mat), nome, cargo: p(ix.cargo), lot: p(ix.lot), folha: p(ix.folha),
      bruto: num(p(ix.bruto)), liq: num(p(ix.liq)) });
  }
  const selMes = (html.match(/<option value="(\d{2})"\s+selected/i) || [])[1];
  const selAno = (html.match(/<option value="(20\d\d)"\s+selected/i) || [])[1];
  // ⚠️ o rodapé vem com tags NO MEIO ("TOTAL:</b> <span>R$ 2.604.090,38"). Casar no HTML cru devolve null
  // e a prova real morre em silêncio — pareceria "fonte não declara total". Tiro as tags antes de casar.
  const total = num((sem(html.slice(-40000)).match(/TOTAL:\s*R?\$?\s*([\d.,]+)/i) || [])[1]);
  // ⚠️ competencia em AAAAMM — é o formato de TODAS as `folha_servidores_*` da base. Gravar "06/2026" aqui
  // deixaria esta tabela fora do invariante e dependendo do normalizador noturno para ficar comparável.
  return { linhas, comp: selMes && selAno ? `${selAno}${selMes}` : null, total };
}

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_pitransp
      (cod_ibge,municipio,entidade,competencia,nome,matricula,cargo,secretaria,vinculo,bruto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::numeric[],$11::numeric[],$12::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, secretaria=excluded.secretaria,
        bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("entidade"), c("competencia"), c("nome"), c("matricula"),
       c("cargo"), c("secretaria"), c("vinculo"), c("bruto"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

const mesAnterior = (comp) => {
  let aa = Number(String(comp).slice(0, 4)), mm = Number(String(comp).slice(4, 6));
  mm--; if (mm < 1) { mm = 12; aa--; }
  const p = String(mm).padStart(2, "0");
  return { mm: p, aa, comp: `${aa}${p}` };
};

let i = 0, ok = 0, vazios = 0, erros = 0, total = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, comp = null, n = 0, td = null, ts = null) =>
      q(`insert into folha_pitransp_coleta (cod_ibge,municipio,url,competencia,linhas,total_declarado,total_somado,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
         linhas=excluded.linhas, total_declarado=excluded.total_declarado, total_somado=excluded.total_somado,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, a.url, comp, n, td, ts, situacao, detalhe]);
    try {
      // a página sem parâmetro já abre na competência mais nova publicada
      const html = await pega(a.url);
      if (!html) { await marca("erro", "não respondeu"); erros++; continue; }
      let d = analisa(html);

      // se o padrão vier vazio, ando para trás mês a mês (o corrente pode ainda não ter sido publicado)
      let cur = d.comp;
      for (let k = 0; k < 12 && !d.linhas.length && cur; k++) {
        const a1 = mesAnterior(cur); cur = a1.comp;
        const h2 = await pega(`${a.url}?mes=${a1.mm}&ano=${a1.aa}`, 1);
        if (h2) { const d2 = analisa(h2); if (d2.linhas.length) d = { ...d2, comp: a1.comp }; }
      }
      if (!d.linhas.length) { await marca("vazio", "nenhuma competência com linhas", d.comp); vazios++; continue; }

      // ⭐ competência mais CHEIA: comparo com o mês anterior antes de fixar
      if (d.comp) {
        const a1 = mesAnterior(d.comp);
        const hp = await pega(`${a.url}?mes=${a1.mm}&ano=${a1.aa}`, 1);
        // ⚠️ só troco se o mês anterior for MESMO mais cheio (>2%). Sem o limiar, uma diferença de 1 linha
        // (575 x 574 em Palmeirais) faz recuar um mês inteiro sem ganho — vira dado mais velho de graça.
        if (hp) { const dp = analisa(hp); if (dp.linhas.length > d.linhas.length * 1.02) d = { ...dp, comp: a1.comp }; }
      }

      const host = new URL(a.url).hostname;
      const regs = d.linhas.map((x) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, entidade: host, competencia: d.comp,
        nome: x.nome, matricula: x.mat, cargo: x.cargo, secretaria: x.lot, vinculo: x.folha,
        bruto: x.bruto, liquido: x.liq,
        _hash: crypto.createHash("md5").update([a.cod_ibge, d.comp, x.mat, x.nome, x.cargo, x.folha].join("|")).digest("hex"),
      }));
      const n = await grava(regs);
      const somado = Number(d.linhas.reduce((s, x) => s + (x.bruto || 0), 0).toFixed(2));
      total += n; ok++;
      await marca("ok", d.total ? `declarado ${d.total} x somado ${somado}` : null, d.comp, n, d.total, somado);
      console.log(`  ✔ ${a.municipio}: ${n} servidores · ${d.comp} · R$ ${somado.toLocaleString("pt-BR")}` +
        (d.total && Math.abs(somado - d.total) > 1 ? `  ⚠ rodapé diz ${d.total.toLocaleString("pt-BR")}` : ""));
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[pi-transp] ${total.toLocaleString("pt-BR")} linhas · ${ok} municípios · ${vazios} vazios · ${erros} erros`);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_lotacao,
  round(avg(bruto)::numeric,2) media_bruto from folha_servidores_pitransp`)).rows);
console.table((await q(`select municipio, competencia, linhas, total_declarado, total_somado,
  case when total_declarado is null then '-' when abs(total_declarado-total_somado)<=1 then 'bate' else 'DIVERGE' end prova
  from folha_pitransp_coleta where situacao='ok' order by municipio`)).rows);
await db.end();
