// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_memory.mjs — folha NOMINAL COM SALÁRIO dos municípios Memory/iLAI (~123, MG).
//
// ⭐ A tela "Gasto com Pessoal" (`#/public/pessoal/gastopessoal`) lista TODOS os servidores COM remuneração.
// Fonte: query OData Cronapp `wspessoalabateteto` → nome_servidor, funcao(=cargo), vinculo, mes_referencia,
// remuneracao (R$ salário), salario_prefeito, abate_teto. 721 em Bambuí (07/2026).
//
// 🚨 O portal iLAI é FRÁGIL: rota direta cai no login; o contexto de tenant vem da navegação pelo SPA (share do site
// municipal ou #/public/inicio após entrar pela entidade). E HTTP direto dá 500 (sessão). Por isso: Playwright abre
// o portal com a entidade, navega a gastopessoal, e busca a query OData por fetch INTERNO paginado ($skip/$top).
//
// A entidade tem o formato `9840MT` — descoberta pelo link `share` no site municipal. O nome exato da query
// (query107467) VARIA por município/versão; então descobrimos a query em runtime: navegamos a gastopessoal, clicamos
// pesquisar, e capturamos qual `queryNNNN` retornou `wspessoalabateteto`. Depois paginamos essa query.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA_REAL = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
let ULTIMA_QUERY = null; // id da query OData capturada na última navegação (usado pelo DUMP)

await q(`create table if not exists folha_servidores_memory (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, cargo text, vinculo text, remuneracao numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_mem_mun on folha_servidores_memory (cod_ibge, competencia)`);
await q(`create table if not exists folha_memory_coleta (
  cod_ibge text primary key, municipio text, uf text, entidade text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
// ⭐ 21/ago/2026 — PODER=legislativo: o Memory identifica o ente por CÓDIGO (`9AG9TM`), e o código da CÂMARA vem
//    dentro da URL do portal dela (`ilai.memory.com.br/#/entidades/login/9BUD72/6`). Mesmo produto, outro ente.
//    🚨 Como a coluna `entidade` guarda o CÓDIGO e não o nome, é `poder` que separa os dois na camada de câmara
//    e no veto da view do executivo ([[pnigp-memory-ilai-folha]]).
const PODER = (process.env.PODER || "executivo").toLowerCase();
await q(`alter table folha_servidores_memory add column if not exists poder text`);
await q(`alter table folha_memory_coleta add column if not exists poder text not null default 'executivo'`);
await q(`do $do$ begin
  if exists (select 1 from pg_constraint where conname = 'folha_memory_coleta_pkey'
               and (select count(*) from unnest(conkey)) = 1) then
    alter table folha_memory_coleta drop constraint folha_memory_coleta_pkey;
    alter table folha_memory_coleta add primary key (cod_ibge, poder);
  end if;
end $do$`);

const num = (v) => (v == null ? null : (Number.isFinite(+v) ? +v : null));

// alvos: municípios Memory. A entidade (9840MT) sai do link 'share' no site — aqui usamos a tabela de descoberta
// `memory_entidade` (cod_ibge, entidade). Enquanto ela não existir, aceita SO + ENTIDADE por env para teste pontual.
let alvos;
if (process.env.ENTIDADE) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`,
    process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, entidade: process.env.ENTIDADE }];
} else {
  alvos = (await q(`select e.cod_ibge, m.nome, m.uf, e.entidade from memory_entidade e
    join municipios_br m on m.cod_ibge=e.cod_ibge where e.entidade is not null
    ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
}
// REFAZ=1 reprocessa quem ja esta ok — necessario depois do de-para de lotacao (17/ago/2026), senao o conserto
// nao alcanca os 92 municipios ja coletados
if (PODER === "legislativo") {
  alvos = (await q(`select cod_ibge, municipio nome, uf, coalesce(url_erp_camara, url_camara, url_camara_2) url
      from folha_camara_fila where coalesce(erp_camara,'') = 'memory'
        and coalesce(url_erp_camara, url_camara, url_camara_2) ~ 'memory\\.com\\.br'
        ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
      order by rais_legislativo desc nulls last`, SO ? [SO] : [])).rows
    .map((r) => ({ ...r, entidade: (String(r.url).match(/\/([0-9][A-Z0-9]{5})(\/|$|\?)/) || [])[1] || null }))
    .filter((r) => r.entidade);
  console.log(`[memory] PODER=legislativo · ${alvos.length} câmaras com código do ente na URL`);
}

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_memory_coleta where situacao like 'ok%' and poder=$1`, [PODER])).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[memory] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_memory
      (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,cargo,vinculo,remuneracao,lotacao,_hash,poder)
      select *, '${PODER}'::text from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::numeric[],$11::text[],$12::text[])
      -- o _hash nao inclui a lotacao: sem o coalesce aqui, o de-para preenche em memoria e NAO chega ao banco
      -- (foi o que aconteceu no Betha e custou um reprocessamento inteiro)
      on conflict (_hash) do update set remuneracao=excluded.remuneracao,
        lotacao=coalesce(excluded.lotacao, folha_servidores_memory.lotacao),
        cargo=coalesce(excluded.cargo, folha_servidores_memory.cargo), _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("vinculo"), c("remuneracao"), c("lotacao"), c("_hash")]);
  }
}

// navega, descobre a query de gastopessoal e pagina wspessoalabateteto
// 🚨 O número depois da entidade na URL (`#/{entidade}/N/…`) NÃO é constante: é o índice do exercício/entidade.
// O coletor fixava 1 e os municípios cujo portal usa 2 abriam a tela VAZIA — "gastopessoal sem linhas" em
// Vespasiano (7.239 servidores na RAIS), João Pinheiro e Guanhães. As URLs descobertas mostram o número certo.
// Tenta os índices em ordem e para no primeiro que traz linhas ([[feedback-descobrir-versao-nao-fixar]]).
const INDICES = (process.env.INDICES || "1,2,3").split(",").map((s) => s.trim()).filter(Boolean);

// ⭐ A MESMA NAVEGAÇÃO SERVE PARA OUTRAS TELAS (17/ago/2026). Instrumentando o coletor (`_memory_recursos.mjs`)
// descobri que `public/pessoal/servidor` existe e a query dela traz **`lotacao`** — o campo que faltava para os
// 92 municípios de MG saírem de "parcial" (a folha `gastopessoal` tem nome/cargo/vínculo/valor e nenhuma lotação).
// ⚠️ Nome de resource inventado NÃO dispara query: a instrumentação distingue "existe" de "não existe", coisa que
// sondar por fora não fazia (o SPA renderiza a mesma casca para qualquer `resource=`).
// Ver [[pnigp-memory-ilai-folha]] e o de-para equivalente do Betha ([[pnigp-betha-secretaria-esta-noutra-consulta]]).
async function coleta(page, entidade, indice = "1", recurso = "public/pessoal/gastopessoal") {
  // ⚠️ o listener precisa existir ANTES das navegações: a query do SPA dispara já no carregamento da tela,
  // não só no clique de "Pesquisar" — registrando depois, ela passa despercebida.
  let queryId = null;
  ULTIMA_QUERY = null;
  const capta = (resp) => {
    const m = resp.url().match(/\/odata\/v2\/app\/(query\d+)/);
    if (m && !queryId) { queryId = m[1]; ULTIMA_QUERY = m[1]; }
    if (m && process.env.DUMP === "1") console.log("    [SPA pediu]", decodeURIComponent(resp.url()).replace(/^https?:\/\/[^/]+/, ""));
  };
  page.on("response", capta);
  // entra pelo share (estabelece o tenant), depois vai a gastopessoal
  await page.goto(`https://ilai.memory.com.br/#/${entidade}/${indice}/share?resource=${recurso}`, { waitUntil: "networkidle", timeout: 60000 });
  await dorme(2500);
  await page.goto(`https://ilai.memory.com.br/#/${recurso}`, { waitUntil: "networkidle", timeout: 60000 });
  await dorme(2000);
  // 🚨 O ID DA QUERY MUDA POR MUNICÍPIO (Bambuí ≠ Araújos) e procurá-lo em `performance.getEntriesByType` só
  // funcionava no município de referência: o buffer não lista a chamada do SPA de forma confiável. Em 54 de 54
  // municípios isso produzia "query de gastopessoal nao encontrada" — que parecia portal sem a tela, e não era:
  // a tela existe e dispara `/odata/v2/app/queryNNNNN`. Interceptar pelo Playwright é o que enxerga de fato.
  if (process.env.DUMP === "1") {
    // espera o select de exercício POPULAR (vem por chamada assíncrona) antes de fotografar o formulário
    await page.waitForFunction(() => (document.querySelector("#select-exercicio")?.options?.length || 0) > 0,
      { timeout: 20000 }).catch(() => {});
    const form = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("select, input, .ui-select, [role=combobox]")) {
        const lab = el.closest("[class*=form], .row, div")?.querySelector("label")?.innerText?.trim() || el.getAttribute("placeholder") || el.name || el.id || "";
        const ops = el.tagName === "SELECT" ? [...el.options].map((o) => `${o.value}=${o.text}`.trim()).slice(0, 24) : null;
        out.push({ tag: el.tagName, label: String(lab).slice(0, 40), valor: el.value ?? null, opcoes: ops });
      }
      return out;
    }).catch(() => []);
    console.log("    [controles da tela]");
    for (const f of form) console.log("      ", f.tag, "|", f.label, "| valor:", f.valor, f.opcoes ? "| opções: " + f.opcoes.join(" ; ") : "");
  }
  await page.evaluate(() => { document.querySelector("#btn-search button, #btn-search")?.click(); }).catch(() => {});
  for (let w = 0; w < 30 && !queryId; w++) await dorme(500);
  page.off("response", capta);
  if (!queryId) throw new Error(`query de ${recurso} nao encontrada`);
  // pagina a query inteira
  return await page.evaluate(async ({ qid, rec }) => {
    const H = location.origin;
    const out = []; let skip = 0; const top = 200; let total = null;
    while (true) {
      const u = `${H}/api/cronapi/odata/v2/app/${qid}?$format=json&$inlinecount=allpages&$skip=${skip}&$top=${top}`;
      const r = await fetch(u, { headers: { accept: "application/json", "origin-path": `/${rec}`, "x-from-datasource": "true" } });
      const j = await r.json();
      const rows = j?.d?.results || [];
      if (total == null) total = +j?.d?.__count || 0;
      out.push(...rows);
      skip += top;
      if (out.length >= total || rows.length === 0 || skip > 100000) break;
    }
    return out;
  }, { qid: queryId, rec: recurso });
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_memory_coleta (cod_ibge,municipio,uf,entidade,linhas,situacao,detalhe,poder,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge,poder) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.entidade, linhas, situacao, detalhe, PODER]);
  const ctx = await browser.newContext({ userAgent: UA_REAL });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();
  try {
    // 🚨 Parar no PRIMEIRO índice que traz linhas põe a CÂMARA no lugar da prefeitura: o índice 2 costuma ser
    // ela, e 14 municípios entraram com 12 a 29 pessoas. O índice certo é o que traz MAIS linhas — só em
    // Porteirinha a prefeitura estava no 2 (1.712). Ver [[pnigp-entidade-espelho-infla-folha]].
    let rows = [], indiceUsado = null;
    for (const ix of INDICES) {
      const r = await coleta(page, a.entidade, ix);
      if (r.length > rows.length) { rows = r; indiceUsado = ix; }
    }
    if (!rows.length) { await marca("vazio", `gastopessoal sem linhas (índices ${INDICES.join("/")})`); vazios++; continue; }
    // DUMP=1 imprime o registro CRU da fonte e não grava nada. Existe porque "remuneração zerada" e "o portal não
    // publica" têm a mesma cara no banco, e só o payload separa as duas ([[pnigp-etl-orquestrador-stderr-descartado]]).
    if (process.env.DUMP === "1") {
      console.log(`
=== ${a.nome}/${a.uf} · índice ${indiceUsado} · ${rows.length} linhas ===`);
      console.log("CAMPOS:", Object.keys(rows[0]).join(" | "));
      for (const r of rows.slice(0, 3)) console.log("  ", JSON.stringify(r));
      const comR = rows.filter((r) => +r.remuneracao > 0).length;
      const meses = [...new Set(rows.map((r) => String(r.mes_referencia ?? "?")))].sort();
      console.log(`  remuneracao>0: ${comR}/${rows.length} · meses vistos: ${meses.join(",")}`);
      if (ULTIMA_QUERY) {
        const sonda = await page.evaluate(async ({ qid }) => {
          const out = [];
          for (const mes of ["01","02","03","04","05","06","07","08","09","10","11","12"]) {
            try {
              const u = `${location.origin}/api/cronapi/odata/v2/app/${qid}?$format=json&$inlinecount=allpages&$top=200&$filter=` +
                encodeURIComponent(`mes_referencia eq '${mes}'`);
              const j = await (await fetch(u, { headers: { accept: "application/json", "x-from-datasource": "true" } })).json();
              const rs = j?.d?.results || [];
              out.push({ mes, total: +j?.d?.__count || rs.length, comValor: rs.filter((r) => +r.remuneracao > 0).length });
            } catch (e) { out.push({ mes, erro: String(e).slice(0, 40) }); }
          }
          return out;
        }, { qid: ULTIMA_QUERY });
        console.log("  sonda por mês ($filter):");
        for (const x of sonda) if (x.total || x.erro) console.log(`    mes ${x.mes}: total=${x.total ?? "-"} comValor(1ª pág)=${x.comValor ?? "-"} ${x.erro || ""}`);
      }
      continue;
    }
    // 🚨 A COMPETÊNCIA GRAVAVA SÓ O MÊS ("07", "06"): 55.787 linhas em 62 municípios sem ANO nenhum — impossível
    // saber de que ano é a folha, e "07" de 2025 e de 2026 empilhariam na mesma competência. A fonte devolve o
    // ano em `ano_referencia`/`exercicio` quando existe; quando não, vale o ano da coleta, que é o único
    // defensável (a consulta é sempre do exercício corrente).
    const anoDe = (s) => {
      const a2 = String(s.ano_referencia ?? s.exercicio ?? s.ano ?? "").match(/(20\d\d)/);
      return a2 ? a2[1] : String(new Date().getFullYear());
    };
    const compDe = (s) => {
      const mes = String(s.mes_referencia ?? "").match(/(\d{1,2})/);
      if (!mes || +mes[1] < 1 || +mes[1] > 12) return null;
      return `${anoDe(s)}${String(+mes[1]).padStart(2, "0")}`;
    };
    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, entidade: a.entidade,
      competencia: compDe(s), matricula: String(s.numero_matricula ?? ""),
      nome: s.nome_servidor, cargo: s.funcao, vinculo: s.vinculo, remuneracao: num(s.remuneracao),
      _hash: crypto.createHash("md5").update([a.cod_ibge, compDe(s), s.numero_matricula, s.nome_servidor, s.funcao].join("¦")).digest("hex"),
    }));
    // ⭐ DE-PARA DE LOTAÇÃO: a folha não traz o órgão, a tela `servidor` traz. Casa por matrícula (+nome) e
    // preenche — mesma receita do Betha. Só de-para: essa tela é CADASTRO (tem desligados).
    try {
      const cad = await coleta(page, a.entidade, indiceUsado, "public/pessoal/servidor");
      const chave = (nome, mat) => `${String(nome || "").trim().toUpperCase()}¦${String(mat || "").trim()}`;
      const mapa = new Map();
      for (const c of cad) {
        if (!c.lotacao) continue;
        mapa.set(chave(c.nome_servidor, c.numero_matricula), c.lotacao);
        mapa.set(chave(c.nome_servidor, ""), c.lotacao);
      }
      let n = 0;
      for (const r of regs) {
        const hit = mapa.get(chave(r.nome, r.matricula)) || mapa.get(chave(r.nome, ""));
        if (hit) { r.lotacao = hit; n++; }
      }
      if (n) console.log(`     ⭐ lotação preenchida em ${n}/${regs.length} pela tela "servidor"`);
    } catch (e) { console.log(`     (sem de-para de lotação: ${String(e.message).slice(0, 40)})`); }
    // 🚨 GUARDA DE PODER (22/ago/2026): o portal Memory identifica o ente por CÓDIGO, e o código da câmara abre
    //    a tela do MUNICÍPIO INTEIRO em vários municípios — Matozinhos/MG gravou 1.439 "vereadores" para 49 da
    //    RAIS. Sem esta checagem o coletor fecha `ok` com a folha da prefeitura ([[_folha_guarda_camara]]).
    if (PODER === "legislativo") {
      const pessoas = new Set(regs.map((x) => x.nome).filter(Boolean)).size;
      const g = await guardaCamara(q, a.cod_ibge, pessoas);
      if (!g.ok) { await marca("recusado_volume", g.motivo, 0); console.log(`  ⛔ ${a.nome}: ${g.motivo}`); continue; }
    }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} servidores`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(800);
}
await browser.close();
console.log(`\n[memory] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
