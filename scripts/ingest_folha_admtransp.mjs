// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_admtransp.mjs — folha nominal do portal JSF/PrimeFaces "Administração Transparente",
// multi-inquilino (`?p={slug}`), hospedado em `administracaotransparente.com.br:8443` e `191.252.1.110:8080`.
//
// A TELA: `/portaltransparencia/faces/v2/recursos_humanos/folha_pagamento_listar.xhtml?p={slug}`
// Colunas do CSV: Ano · Mês · Servidor · CPF(mascarado) · Matrícula · Situação · Cargo · Carga Horária ·
//                 Vencimento Base · Vencimento Total · Vencimento Líquido · Tipo Folha
// ⚠️ NÃO tem LOTAÇÃO — são 4 dos 5 campos.
//
// COMO SE TIRA O DADO (três passos, nenhum deles óbvio):
//   1. GET na tela → cookie JSESSIONID + `javax.faces.ViewState` + os ids gerados dos campos.
//   2. POST AJAX no botão "Buscar" com Mês/Ano → devolve XML parcial com `rowCount:N` (quantos servidores
//      naquela competência) e um **ViewState NOVO**, que precisa substituir o antigo.
//   3. POST no botão "CSV" (DataExporter) → devolve `text/csv` com TODO o filtro atual, de uma vez.
//
// 🚨 SEM O PASSO 2 O EXPORT ESTOURA: sem filtro a tabela tem a série histórica inteira — 310.487 linhas em
//    Piripiri — e o CSV não termina em 5 minutos. Filtrar não é refinamento, é o que torna a coleta possível.
//
// 🚨 IDS GERADOS: os campos são `filtrosLL:j_idt116` etc. — numeração do JSF, que muda entre versões e
//    municípios. Derivo cada campo pelo RÓTULO ("Mês", "Ano") e o botão pelo texto ("CSV"). Fixar o número
//    funcionaria em Piripiri e quebraria calado no vizinho.
//
// ⚠️ COMPETÊNCIA: o `rowCount` do passo 2 é uma medida barata — dá para varrer os meses do ano e escolher o
//    MAIS CHEIO sem baixar nada ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
// ⚠️ TIPO FOLHA: a mesma competência traz "Normal", "13º", "Férias"… Guardo o tipo em `vinculo` e conto no
//    ledger quantas linhas são "Normal" — somar tudo como folha do mês inflaria o total.
//
// Uso: node scripts/ingest_folha_admtransp.mjs   ·   SO=Piripiri   ·   REFAZ=1   ·   CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 25000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 120000, bodyTimeout: 600000 }));

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = Number(process.env.CONC || 4);
const ANO_MAX = Number(process.env.ANO_MAX || new Date().getUTCFullYear());
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const HOSTS = ["https://administracaotransparente.com.br:8443", "http://191.252.1.110:8080"];
const CAMINHO = "/portaltransparencia/faces/v2/recursos_humanos/folha_pagamento_listar.xhtml";

await q(`create table if not exists folha_servidores_admtransp (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text, carga_horaria text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_admtransp_mun on folha_servidores_admtransp (cod_ibge)`);
await q(`create table if not exists folha_admtransp_coleta (
  cod_ibge text primary key, municipio text, host text, p text, competencia text,
  linhas int, linhas_normal int, situacao text, detalhe text, em timestamptz default now())`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\s+pi$/, "").replace(/\s+do\s+piaui$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// alvos: municípios cujos links apontam para este portal + chute de slug para os demais do PI sem folha
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  // ⚠️ pular a PRÓPRIA tabela: senão, depois da primeira coleta o município passa a contar como "já coberto"
  // e o REFAZ vem com a fila vazia — o coletor deixa de conseguir se corrigir. Quem controla repetição é o ledger.
  if (ok && t !== "folha_servidores_admtransp") {
    partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
  }
}
const alvos = (await q(`
  with col as (${partes.join(" union ")}),
  lk as (select m.cod_ibge, m.nome, m.uf, split_part(l,'|',2) url
           from municipios_br m join site_municipal_links s on s.cod_ibge=m.cod_ibge
           cross join lateral jsonb_array_elements_text(s.links) l
          where m.uf='PI')
  select m.cod_ibge, m.nome municipio, m.uf,
         (select (regexp_match(url,'[?&]p=([a-z0-9_-]{3,})'))[1] from lk
           where lk.cod_ibge=m.cod_ibge and url ~* 'portaltransparencia/faces' and url ~* '[?&]p=[a-z]' limit 1) p_lido,
         exists (select 1 from lk where lk.cod_ibge=m.cod_ibge and url ~* 'portaltransparencia/faces') tem_link
    from municipios_br m left join col c on c.c=m.cod_ibge
   where m.uf='PI' and c.c is null ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
   order by (exists (select 1 from lk where lk.cod_ibge=m.cod_ibge and url ~* 'portaltransparencia/faces')) desc, m.nome`,
  SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_admtransp_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[admtransp] ${fila.length} municípios na fila (${alvos.filter((a) => a.tem_link).length} com link conhecido)`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// RÓTULO → name do input: no HTML do PrimeFaces o texto do rótulo vem imediatamente antes do <input>
function camposPorRotulo(html) {
  const i = html.indexOf('id="filtrosLL"');
  if (i < 0) return {};
  const bloco = html.slice(i, i + 9000);
  const mapa = {};
  const ped = bloco.split(/<input /i);
  for (let k = 1; k < ped.length; k++) {
    const nome = (ped[k].match(/name="([^"]+)"/) || [])[1];
    if (!nome || !nome.startsWith("filtrosLL:")) continue;
    const palavras = sem(ped[k - 1]).split(" ").filter(Boolean);
    mapa[nome] = palavras.slice(-2).join(" ");
  }
  return mapa;
}
// ancorado no FIM do rótulo: /ano/ solto casaria com "Plano", "Ano de Exercício" etc.
const acha = (mapa, re) => Object.entries(mapa).find(([, r]) => re.test(r))?.[0];

async function abre(u) {
  try {
    const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(90000) });
    if (r.status >= 400) return null;
    const html = await r.text();
    if (!html.includes("filtrosLL")) return null;
    return { html, cookie: (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ") };
  } catch { return null; }
}

const num = (v) => {
  const s = String(v || "").trim();
  if (!s) return null;
  const m = s.match(/(-?[\d.]+),(\d{2})$/);
  const n = m ? parseFloat(m[1].replace(/\./g, "") + "." + m[2]) : parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// CSV com ; e aspas — parser próprio porque o campo Cargo tem vírgulas e acentos
function leCsv(txt) {
  const linhas = txt.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const parse = (l) => {
    const out = []; let cur = "", aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (aspas && l[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
      else if (c === ";" && !aspas) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  const cab = parse(linhas[0]).map((h) => h.trim().toLowerCase());
  const ix = (re) => cab.findIndex((h) => re.test(h));
  const c = { ano: ix(/^ano/), mes: ix(/m[êe]s/), nome: ix(/servidor|nome/), cpf: ix(/cpf/),
    mat: ix(/matr[íi]cula/), sit: ix(/situa/), cargo: ix(/cargo/), carga: ix(/carga/),
    base: ix(/base/), tot: ix(/total/), liq: ix(/l[íi]quid/), tipo: ix(/tipo/) };
  return linhas.slice(1).map(parse).filter((v) => v.length >= 5).map((v) => {
    const g = (i) => (i >= 0 && i < v.length ? v[i].trim() : null);
    return { ano: g(c.ano), mes: g(c.mes), nome: g(c.nome), cpf: g(c.cpf), mat: g(c.mat),
      sit: g(c.sit), cargo: g(c.cargo), carga: g(c.carga),
      base: num(g(c.base)), tot: num(g(c.tot)), liq: num(g(c.liq)), tipo: g(c.tipo) };
  }).filter((x) => x.nome);
}

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_admtransp
      (cod_ibge,municipio,uf,entidade,competencia,nome,cpf_masc,matricula,cargo,situacao,carga_horaria,
       vinculo,salario_base,bruto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, situacao=excluded.situacao,
        salario_base=excluded.salario_base, bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cpf_masc"),
       c("matricula"), c("cargo"), c("situacao"), c("carga_horaria"), c("vinculo"),
       c("salario_base"), c("bruto"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

let i = 0, ok = 0, semPortal = 0, erros = 0, total = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, host = null, p = null, comp = null, n = 0, nn = null) =>
      q(`insert into folha_admtransp_coleta (cod_ibge,municipio,host,p,competencia,linhas,linhas_normal,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set host=excluded.host,
         p=excluded.p, competencia=excluded.competencia, linhas=excluded.linhas, linhas_normal=excluded.linhas_normal,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, host, p, comp, n, nn, situacao, detalhe]);
    try {
      const ps = [...new Set([a.p_lido, slug(a.municipio), slug(a.municipio).split("_")[0]].filter(Boolean))];
      let sess = null, host = null, p = null;
      for (const h of HOSTS) {
        for (const pp of ps) {
          const d = await abre(`${h}${CAMINHO}?p=${pp}`);
          if (d) { sess = d; host = h; p = pp; break; }
        }
        if (sess) break;
      }
      if (!sess) { await marca("sem_portal", "nenhum host/slug respondeu com a tela"); semPortal++; continue; }

      const action = new URL((sess.html.match(/<form[^>]*id="filtrosLL"[^>]*action="([^"]+)"/) || [])[1]
        || `${host}${CAMINHO}`, `${host}${CAMINHO}`).href;
      let vs = (sess.html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1];
      const mapa = camposPorRotulo(sess.html);
      const cMes = acha(mapa, /m[êe]s$/i), cAno = acha(mapa, /ano$/i);
      const btnBuscar = (sess.html.match(/source:'(filtrosLL:[^']+)'[^}]*process:'filtrosLL'/) || [])[1];
      const painel = sess.html.slice(sess.html.indexOf("layout2026-export-actions"),
        sess.html.indexOf("layout2026-export-actions") + 3000);
      const btnCsv = [...painel.matchAll(/name="(tbPrincipal:[^"]+)"[\s\S]{0,240}?ui-button-text[^>]*>([^<]{2,12})</g)]
        .find((m) => /csv/i.test(m[2]))?.[1];
      if (!cMes || !cAno || !btnBuscar || !btnCsv) {
        await marca("layout_desconhecido", `mes=${cMes} ano=${cAno} buscar=${btnBuscar} csv=${btnCsv}`, host, p);
        erros++; continue;
      }

      const filtra = async (mes, ano) => {
        const body = new URLSearchParams({ "javax.faces.partial.ajax": "true", "javax.faces.source": btnBuscar,
          "javax.faces.partial.execute": "filtrosLL", "javax.faces.partial.render": "tbPrincipal",
          [btnBuscar]: btnBuscar, filtrosLL: "filtrosLL",
          [cMes]: String(mes), [cAno]: String(ano), "javax.faces.ViewState": vs });
        const r = await fetch(action, { method: "POST", signal: AbortSignal.timeout(300000),
          headers: { ...UA, cookie: sess.cookie, "content-type": "application/x-www-form-urlencoded",
            "faces-request": "partial/ajax", "x-requested-with": "XMLHttpRequest" }, body });
        const t = await r.text();
        // ⚠️ o ViewState MUDA a cada POST; usar o antigo derruba a sessão com ViewExpiredException
        const nvs = (t.match(/ViewState[^>]*><!\[CDATA\[([^\]]+)\]\]/) || [])[1];
        if (nvs) vs = nvs;
        return Number((t.match(/rowCount:(\d+)/) || [])[1] || 0);
      };

      // competência mais cheia: rowCount é medida barata, não baixa CSV
      let melhor = null;
      for (const ano of [ANO_MAX, ANO_MAX - 1]) {
        const med = [];
        for (let mes = 12; mes >= 1; mes--) {
          const n = await filtra(mes, ano);
          if (n) med.push({ mes, ano, n });
          if (med.length >= 4) break;
        }
        if (med.length) {
          // ⚠️ "mais cheio" existe para descartar o mês CORRENTE, que vem parcial — não para preferir um mês
          // antigo que tem 2,5% mais gente por rotatividade normal. Regra: descarto quem tiver < 85% do maior
          // (esse sim está parcial) e, entre os cheios, fico com o MAIS RECENTE.
          console.log(`     [${a.municipio}] medidas: ${med.map((x) => `${x.ano}${String(x.mes).padStart(2,"0")}=${x.n}`).join(" ")}`);
          const teto = Math.max(...med.map((x) => x.n));
          const cheios = med.filter((x) => x.n >= teto * 0.85);
          melhor = cheios.sort((x, y) => y.ano - x.ano || y.mes - x.mes)[0];
          break;
        }
      }
      if (!melhor) { await marca("sem_competencia", "nenhum mês com linhas", host, p); erros++; continue; }

      await filtra(melhor.mes, melhor.ano);   // deixa o filtro na competência escolhida
      const body = new URLSearchParams({ tbPrincipal: "tbPrincipal", [btnCsv]: btnCsv, "javax.faces.ViewState": vs });
      const r = await fetch(action, { method: "POST", redirect: "follow", signal: AbortSignal.timeout(600000),
        headers: { ...UA, cookie: sess.cookie, "content-type": "application/x-www-form-urlencoded" }, body });
      const csv = await r.text();
      if (!/csv/i.test(r.headers.get("content-type") || "") && !/servidor/i.test(csv.slice(0, 200))) {
        await marca("export_falhou", `content-type ${r.headers.get("content-type")}`, host, p,
          `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`); erros++; continue;
      }
      const linhas = leCsv(csv);
      if (!linhas.length) { await marca("vazio", "CSV sem linhas", host, p); erros++; continue; }

      const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
      const regs = linhas.map((x) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: new URL(host).host, competencia: comp,
        nome: x.nome, cpf_masc: x.cpf, matricula: x.mat, cargo: x.cargo, situacao: x.sit,
        carga_horaria: x.carga, vinculo: x.tipo, salario_base: x.base, bruto: x.tot, liquido: x.liq,
        _hash: crypto.createHash("md5").update([a.cod_ibge, comp, x.mat, x.nome, x.cargo, x.tipo].join("|")).digest("hex"),
      }));
      const n = await grava(regs);
      const normais = linhas.filter((x) => /normal/i.test(x.tipo || "")).length;
      total += n; ok++;
      await marca("ok", `${linhas.length} linhas, ${normais} tipo Normal`, host, p, comp, n, normais);
      console.log(`  ✔ ${a.municipio}: ${n} linhas (${normais} normais) · ${comp} · ${new URL(host).host}`);
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[admtransp] ${total.toLocaleString("pt-BR")} linhas · ${ok} municípios · ${semPortal} sem portal · ${erros} erros`);
console.table((await q(`select situacao, count(*) n, sum(linhas) linhas from folha_admtransp_coleta group by 1 order by 2 desc`)).rows);
console.table((await q(`select municipio, competencia, linhas, linhas_normal, host from folha_admtransp_coleta
  where situacao='ok' order by linhas desc`)).rows);
await db.end();
