// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// verifica_municipio_folha.mjs — ENTRA em cada município que falta e tem CERTEZA.
//
// Por que existe, se já há o `diagnostica_faltantes.mjs`: aquele segue o PRIMEIRO link de pessoal que encontra e
// para. Isso o fez marcar 10 municípios como "não publica" quando a folha estava na rota ao lado — o menu tinha
// "Cargos e Salários" (`#/cargos`) antes de "Pessoal" (`#/servidores`) ([[pnigp-spa-publico-folha]]).
//
// Aqui a regra é outra: **visita TODAS as rotas candidatas** (as do menu + uma bateria de caminhos conhecidos) e
// só conclui depois de tentar todas. A prova é sempre a mesma: uma TABELA com linhas de gente ou um JSON com
// lista — nunca a existência do link ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// Grava tudo em `folha_verificacao_municipal`: rota testada, linhas vistas, se havia valor em R$, veredito.
//
// Uso: UF=MG node scripts/verifica_municipio_folha.mjs [CONC=4] [LIMITE=999] [SO=Contagem]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "MG";
const CONC = Number(process.env.CONC || 4);
const LIMITE = Number(process.env.LIMITE || 999);
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_verificacao_municipal (
  cod_ibge text primary key, municipio text, uf text,
  host text, rota_com_dados text, linhas int, tem_valor boolean,
  rotas_testadas int, veredito text, detalhe text, em timestamptz default now())`);

// caminhos que já vimos entregarem folha em algum produto — testados quando o menu não leva a lugar nenhum
const ROTAS_PADRAO = [
  "/servidores", "/pessoal", "/folha-pagamento", "/folhadepagamentos", "/transparencia/servidores",
  "/pessoal/gestao-pessoal", "/publica/recursosHumanos/", "/#/servidores", "/#/pessoal",
  "/transparencia/pessoal", "/portal/servidores", "/recursos-humanos",
];

const RE_PESSOAL = /pessoal|servidor|folha|remunera|salari|quadro de|recursos humanos|rh\b/i;
const RE_DINHEIRO = /R\$\s?\d|\d{1,3}(\.\d{3})*,\d{2}/;

const alvos = (await q(`
  with sem as (
    select m.cod_ibge, m.nome municipio, m.uf
      from municipios_br m
      left join (select distinct cod_ibge from mv_folha_mg) f on f.cod_ibge = m.cod_ibge
     where m.uf = $1 and f.cod_ibge is null ${SO ? "and m.nome ilike '%'||$2||'%'" : ""})
  select s.*, coalesce(
      -- 🚨 CÂMARA fora: já entrou 4 vezes hoje disfarçada (host cm-, cm., cmXxx, .leg.br). Coletar de lá dá
      -- dezenas de pessoas onde há milhares ([[pnigp-entidade-espelho-infla-folha]]).
      (select p.url_portal_real from portal_real_descoberto p where p.cod_ibge = s.cod_ibge
        and p.url_portal_real is not null
        and p.url_portal_real !~* '(nfe-cidades|soundcloud|portaldatransparencia\\.gov\\.br|gov\\.br/cgu|\\.leg\\.br)'
        and p.url_portal_real !~* '//(www\\.)?cm[-.a-z0-9]*\\.' and p.url_portal_real !~* 'camara'
        order by p.em desc limit 1),
      (select d.url_visitada from folha_diagnostico_faltante d where d.cod_ibge = s.cod_ibge limit 1),
      (select r.url_portal from radar_portal r where r.cod_ibge = s.cod_ibge
        and r.unidade_gestora ilike 'Prefeitura%' and coalesce(r.url_portal,'') not in ('','-') limit 1)
    ) url
    from sem s`, SO ? [UF, SO] : [UF])).rows.filter((a) => a.url);

// `revalidar` volta à fila de propósito: são os medidos com o critério antigo, antes de exigir cabeçalho de pessoal
const feitos = new Set((await q(`select cod_ibge from folha_verificacao_municipal
  where uf=$1 and veredito <> 'revalidar'`, [UF])).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge)).slice(0, LIMITE);
console.log(`[verifica] ${alvos.length} municípios sem folha com URL · ${fila.length} na fila (${CONC} em paralelo)`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--ignore-certificate-errors"] });

// mede a página atual: quantas linhas de gente e se há dinheiro
// 🚨 Tabela com linhas e R$ NÃO é prova de folha: Pedro Leopoldo devolveu 340 linhas com dinheiro e era a lista
// de EMENDAS PARLAMENTARES (`Identificação · Objeto · Indicado · Pago`). O cabeçalho tem de falar de GENTE.
const RE_CAB_PESSOAL = /servidor|nome|matr[íi]cula|cargo|fun[çc][ãa]o|lota[çc][ãa]o|vínculo|vinculo|remunera|sal[áa]rio|admiss/i;
async function mede(page) {
  return await page.evaluate((args) => {
    const RE = new RegExp(args.reDin);
    const RECAB = new RegExp(args.reCab, "i");
    let melhor = 0, comValor = false;
    for (const t of document.querySelectorAll("table")) {
      const linhas = t.rows.length - 1;
      const cab = [...(t.rows[0]?.cells || [])].map((c) => c.textContent).join(" ");
      if (!RECAB.test(cab)) continue;               // ← só conta tabela DE PESSOAL
      if (linhas > melhor && (t.rows[0]?.cells?.length || 0) >= 3) {
        melhor = linhas;
        comValor = RE.test(t.innerText || "");
      }
    }
    // grids que não usam <table> (DevExpress/PrimeNG às vezes usam div[role=row])
    // grids que não usam <table>; aqui a prova de "é pessoal" vem do texto da própria página
    const divs = document.querySelectorAll('[role="row"], .ui-datatable tbody tr, .dxgvDataRow');
    if (divs.length - 1 > melhor && RECAB.test(document.body.innerText || "")) {
      melhor = divs.length - 1; comValor = RE.test(document.body.innerText || "");
    }
    return { linhas: melhor, comValor };
  }, { reDin: RE_DINHEIRO.source, reCab: RE_CAB_PESSOAL.source }).catch(() => ({ linhas: 0, comValor: false }));
}

let ok = 0, sem = 0, erro = 0, feito = 0;
async function verifica(a) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", userAgent: UA });
  const page = await ctx.newPage();
  let rotasTestadas = 0, achou = null;
  const base = /^https?:\/\//i.test(a.url) ? a.url : "https://" + a.url;
  const origem = (() => { try { return new URL(base).origin; } catch { return null; } })();
  const jsonComLista = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] || "";
    if (!/json/i.test(ct)) return;
    if (!/servidor|pessoal|folha|remun|salari/i.test(r.url())) return;
    try { const t = await r.text(); if (/\[\s*\{/.test(t) && t.length > 400) jsonComLista.push(r.url().slice(0, 120)); } catch {}
  });

  try {
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(2500);
    await page.evaluate(() => { const b = [...document.querySelectorAll("a,button")].find((x) => /aceitar|concordo|entendi/i.test(x.textContent || "")); if (b) b.click(); }).catch(() => {});

    // 1) TODAS as rotas que o menu oferece (não só a primeira)
    const doMenu = await page.evaluate((re) => {
      const RE = new RegExp(re, "i");
      const out = [];
      for (const a of document.querySelectorAll("a")) {
        const txt = (a.textContent || "").trim(), href = a.getAttribute("href") || "";
        if (!RE.test(txt + " " + href)) continue;
        if (!href || href === "#" || /^javascript:/i.test(href)) continue;
        out.push(a.href);
      }
      return [...new Set(out)];
    }, RE_PESSOAL.source).catch(() => []);

    const candidatas = [...new Set([...doMenu, ...(origem ? ROTAS_PADRAO.map((r) => origem + r) : [])])].slice(0, 14);

    for (const url of candidatas) {
      rotasTestadas++;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await dorme(2600);
        // muitas telas só populam depois de "Pesquisar"
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button,input[type=submit],a")]
            .find((x) => /^(pesquisar|consultar|buscar|filtrar)$/i.test(((x.innerText || x.value || "")).trim()));
          if (b) b.click();
        }).catch(() => {});
        await dorme(2600);
        const m = await mede(page);
        if (m.linhas >= 5) { achou = { url, ...m }; break; }
      } catch { /* rota ruim: segue */ }
    }

    const veredito = achou ? (achou.comValor ? "tem_dados_com_valor" : "tem_dados_sem_valor")
      : (jsonComLista.length ? "json_de_pessoal_sem_tabela" : "nao_achei_dados");
    if (achou) ok++; else sem++;
    await q(`insert into folha_verificacao_municipal
      (cod_ibge,municipio,uf,host,rota_com_dados,linhas,tem_valor,rotas_testadas,veredito,detalhe,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict (cod_ibge) do update set host=excluded.host, rota_com_dados=excluded.rota_com_dados,
        linhas=excluded.linhas, tem_valor=excluded.tem_valor, rotas_testadas=excluded.rotas_testadas,
        veredito=excluded.veredito, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, origem, achou?.url || null, achou?.linhas || 0, achou?.comValor || false,
       rotasTestadas, veredito, jsonComLista.slice(0, 2).join(" | ") || null]);
    if (achou) console.log(`  ⭐ ${a.municipio}: ${achou.linhas} linhas${achou.comValor ? " COM VALOR" : ""} → ${achou.url.slice(0, 70)}`);
  } catch (e) {
    erro++;
    await q(`insert into folha_verificacao_municipal (cod_ibge,municipio,uf,host,rotas_testadas,veredito,detalhe,em)
             values ($1,$2,$3,$4,$5,'erro',$6,now())
             on conflict (cod_ibge) do update set veredito='erro', detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, origem, rotasTestadas, String(e.message).slice(0, 150)]);
  } finally {
    await ctx.close().catch(() => {});
    feito++;
    if (feito % 10 === 0) console.log(`  ${feito}/${fila.length} · ${ok} com dados · ${sem} sem · ${erro} erro`);
  }
}

for (let i = 0; i < fila.length; i += CONC) await Promise.all(fila.slice(i, i + CONC).map(verifica));
await browser.close();
console.log(`\n[verifica] ${feito} municípios visitados · ${ok} COM DADOS · ${sem} sem · ${erro} erro`);
await db.end();
