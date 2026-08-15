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

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA_REAL = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_memory (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, cargo text, vinculo text, remuneracao numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_mem_mun on folha_servidores_memory (cod_ibge, competencia)`);
await q(`create table if not exists folha_memory_coleta (
  cod_ibge text primary key, municipio text, uf text, entidade text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

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
const feitos = new Set((await q(`select cod_ibge from folha_memory_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[memory] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_memory
      (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,cargo,vinculo,remuneracao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::numeric[],$11::text[])
      on conflict (_hash) do update set remuneracao=excluded.remuneracao, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("vinculo"), c("remuneracao"), c("_hash")]);
  }
}

// navega, descobre a query de gastopessoal e pagina wspessoalabateteto
async function coleta(page, entidade) {
  // ⚠️ o listener precisa existir ANTES das navegações: a query do SPA dispara já no carregamento da tela,
  // não só no clique de "Pesquisar" — registrando depois, ela passa despercebida.
  let queryId = null;
  const capta = (resp) => {
    const m = resp.url().match(/\/odata\/v2\/app\/(query\d+)/);
    if (m && !queryId) queryId = m[1];
  };
  page.on("response", capta);
  // entra pelo share (estabelece o tenant), depois vai a gastopessoal
  await page.goto(`https://ilai.memory.com.br/#/${entidade}/1/share?resource=public/pessoal/gastopessoal`, { waitUntil: "networkidle", timeout: 60000 });
  await dorme(2500);
  await page.goto(`https://ilai.memory.com.br/#/public/pessoal/gastopessoal`, { waitUntil: "networkidle", timeout: 60000 });
  await dorme(2000);
  // 🚨 O ID DA QUERY MUDA POR MUNICÍPIO (Bambuí ≠ Araújos) e procurá-lo em `performance.getEntriesByType` só
  // funcionava no município de referência: o buffer não lista a chamada do SPA de forma confiável. Em 54 de 54
  // municípios isso produzia "query de gastopessoal nao encontrada" — que parecia portal sem a tela, e não era:
  // a tela existe e dispara `/odata/v2/app/queryNNNNN`. Interceptar pelo Playwright é o que enxerga de fato.
  await page.evaluate(() => { document.querySelector("#btn-search button, #btn-search")?.click(); }).catch(() => {});
  for (let w = 0; w < 30 && !queryId; w++) await dorme(500);
  page.off("response", capta);
  if (!queryId) throw new Error("query de gastopessoal nao encontrada");
  // pagina a query inteira
  return await page.evaluate(async (qid) => {
    const H = location.origin;
    const out = []; let skip = 0; const top = 200; let total = null;
    while (true) {
      const u = `${H}/api/cronapi/odata/v2/app/${qid}?$format=json&$inlinecount=allpages&$skip=${skip}&$top=${top}`;
      const r = await fetch(u, { headers: { accept: "application/json", "origin-path": "/public/pessoal/gastopessoal", "x-from-datasource": "true" } });
      const j = await r.json();
      const rows = j?.d?.results || [];
      if (total == null) total = +j?.d?.__count || 0;
      out.push(...rows);
      skip += top;
      if (out.length >= total || rows.length === 0 || skip > 100000) break;
    }
    return out;
  }, queryId);
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_memory_coleta (cod_ibge,municipio,uf,entidade,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.entidade, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ userAgent: UA_REAL });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();
  try {
    const rows = await coleta(page, a.entidade);
    if (!rows.length) { await marca("vazio", "gastopessoal sem linhas"); vazios++; continue; }
    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, entidade: a.entidade,
      competencia: String(s.mes_referencia ?? ""), matricula: String(s.numero_matricula ?? ""),
      nome: s.nome_servidor, cargo: s.funcao, vinculo: s.vinculo, remuneracao: num(s.remuneracao),
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.mes_referencia, s.numero_matricula, s.nome_servidor, s.funcao].join("¦")).digest("hex"),
    }));
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
