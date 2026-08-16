// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// diagnostica_faltantes.mjs — abre o portal de CADA município ainda sem folha e responde, com navegador:
//   1. o menu tem item de PESSOAL?         (se não tem, acabou: é LAI, não engenharia)
//   2. a tela de pessoal tem DADOS?        (`getAnos: []` é base vazia, não bug)
//   3. que PRODUTO é esse portal?          (para agrupar em bloco e escrever um coletor que serve N municípios)
//
// POR QUE com navegador: a sonda HTTP (`sonda_folha_municipal.mjs`) não enxerga SPA, e SPA é justamente onde
// estão os municípios maiores. Este script é a versão automatizada da investigação que fiz à mão nos 12 SPA do
// RS ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]]) — inclusive a ORDEM das perguntas, que é o que evita
// escrever coletor para portal que não publica.
//
// 🚨 A LIÇÃO QUE ESTE SCRIPT CODIFICA: achar rota de pessoal no bundle JS NÃO prova que o município publica —
// em Caxias do Sul o bundle tinha `/consultaRemuneracaoTodosServidoresAtivos` e o portal não tem o módulo.
// Por isso o veredito só vira "tem dados" quando a TELA mostra linhas ou a API devolve conteúdo.
//
// Uso: UF=RS node scripts/diagnostica_faltantes.mjs        (CONC, LIMITE para lotes)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { COD_UF } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 3);
const LIMITE = Number(process.env.LIMITE || 999);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

await q(`create table if not exists folha_diagnostico_faltante (
  cod_ibge text primary key, municipio text, uf text,
  url_visitada text, url_pessoal text, produto text,
  tem_menu_pessoal boolean, tem_dados boolean, apis text, menu text,
  veredito text, detalhe text, em timestamptz default now()
)`);

// alvos: municípios da UF SEM nenhuma linha em qualquer folha_servidores_*
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where left(cod_ibge::text,2)=$1`);
}
const F = partes.join(" union ");
const alvos = (await q(`
  select m.cod_ibge, m.nome municipio, m.uf,
         coalesce(p.url_portal_real, s.url_pessoal, s.url_base, r.url_erp, r.url_portal) url
    from municipios_br m
    left join lateral (select url_portal_real from portal_real_descoberto p2
                        where left(p2.cod_ibge,6)=left(m.cod_ibge,6) and p2.url_portal_real is not null limit 1) p on true
    left join folha_sonda_municipal s on s.cod_ibge = m.cod_ibge
    -- 🚨 UF que nunca passou pela sonda (MT/MS: folha_sonda_municipal vazia) saía toda como "sem_portal" sem
    -- uma única visita. O Radar tem a URL de 100% das prefeituras — é o último fallback, nunca o primeiro
    -- (o portal REAL descoberto vence o site institucional).
    left join lateral (select url_erp, url_portal from radar_portal r2
                        where r2.cod_ibge = m.cod_ibge and r2.unidade_gestora ilike 'Prefeitura%'
                          and coalesce(r2.url_portal,'') not in ('','-') limit 1) r on true
   where left(m.cod_ibge,2) = $1 and left(m.cod_ibge,6) not in (${F})
     and not exists (select 1 from folha_diagnostico_faltante d where d.cod_ibge = m.cod_ibge)
   order by m.nome limit ${LIMITE}`, [COD_UF])).rows;
console.log(`[diag] ${alvos.length} municípios a diagnosticar · ${CONC} em paralelo`);

const RE_PESSOAL = /servidor|pessoal|remunera|folha de pagamento|folha_pagamento|quadro de pessoal|sal[áa]rio/i;
// assinaturas de produto conhecidas — agrupar é o que transforma 1 município em N
// 🚨 ANCORAR NO DOMÍNIO, não na palavra solta: `/abase/i` casa com "dat**abase**" e classificou 14 municípios
// como Abase — entre eles Rio Grande, São Leopoldo e Lajeado, que nem portal Abase têm. Assinatura de produto
// tem de ser o host/caminho ([[pnigp-sys523-cecam-bloco-rs]]), nunca uma palavra que aparece em qualquer HTML.
const PRODUTOS = [
  [/multi24/i, "multi24"], [/abase\.com\.br/i, "abase"], [/sys523/i, "sys523"], [/cittaweb|\/citta\//i, "citta"],
  [/sinsoft/i, "sinsoft"], [/digifred/i, "digifred"], [/betha/i, "betha"], [/atende\.net/i, "ipm"],
  [/govbr|cidade360|pronim/i, "govbr"], [/fiorilli|:8079|:5656|:879/i, "scpi"], [/equiplano/i, "equiplano"],
  [/elotech/i, "elotech"], [/portaltp/i, "portaltp"], [/nucleogov/i, "nucleogov"], [/grp\./i, "grp"],
  [/sistemaslah/i, "sistemaslah"], [/folha_pagamentos/i, "api-folha-pagamentos"], [/memory/i, "memory"],
  [/publicsoft|elmar/i, "publicsoft"], [/instar/i, "instar(cms)"], [/hardsoft/i, "hardsoft"],
];
const produtoDe = (txt) => (PRODUTOS.find(([re]) => re.test(txt || "")) || [])[1] || null;

const browser = await chromium.launch({ headless: true });
let n = 0, comMenu = 0, comDados = 0;

async function diagnostica(a) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await ctx.newPage();
  const apis = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] || "";
    if (/json/i.test(ct) && !/\.js/i.test(r.url()) && RE_PESSOAL.test(r.url())) {
      let n2 = 0; try { const j = await r.json(); n2 = Array.isArray(j) ? j.length : Object.keys(j || {}).length; } catch {}
      apis.push(`${r.url().slice(0, 110)}→${n2}`);
    }
  });
  try {
    if (!a.url) return { veredito: "sem_portal", detalhe: "nenhuma URL conhecida" };
    const url = a.url.startsWith("http") ? a.url : "https://" + a.url;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    if (!resp) return { veredito: "sem_resposta", detalhe: "goto falhou", url_visitada: url };
    await page.waitForTimeout(4500);

    const info = await page.evaluate(() => {
      const itens = [...document.querySelectorAll("a,button,li,span,h2,h3")]
        .map((e) => ({ t: (e.innerText || "").trim(), h: e.getAttribute("href") || "" }))
        .filter((x) => x.t && x.t.length > 2 && x.t.length < 60);
      return { itens, html: document.documentElement.outerHTML.slice(0, 300000) };
    });
    const re = /servidor|pessoal|remunera|folha de pagamento|quadro de pessoal|sal[áa]rio/i;
    const doMenu = info.itens.filter((x) => re.test(x.t));
    const produto = produtoDe(info.html) || produtoDe(url);
    if (!doMenu.length) {
      return { veredito: "sem_item_de_pessoal", detalhe: "menu não oferece pessoal/folha",
               url_visitada: url, produto, tem_menu_pessoal: false,
               menu: info.itens.slice(0, 25).map((x) => x.t).join(" · ").slice(0, 400) };
    }
    comMenu++;
    // segue o item de pessoal e vê se há DADOS
    const alvoTxt = doMenu[0].t;
    await page.getByText(alvoTxt, { exact: false }).first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const depois = await page.evaluate(() => {
      const linhas = [...document.querySelectorAll("table")].reduce((s, t) => s + Math.max(0, t.rows.length - 1), 0);
      const txt = document.body.innerText.replace(/\s+/g, " ");
      return { linhas, url: location.href,
               vazio: /nenhum registro|sem registros|no data|não há dados|nenhum dado/i.test(txt),
               temDinheiro: /R\$\s?\d{1,3}(\.\d{3})*,\d{2}/.test(txt) };
    });
    const temDados = (depois.linhas > 2 || depois.temDinheiro) && !depois.vazio;
    if (temDados) comDados++;
    return {
      veredito: temDados ? "tem_dados" : (depois.vazio ? "tela_vazia" : "tela_sem_linhas"),
      detalhe: `item "${alvoTxt}" · ${depois.linhas} linhas${depois.vazio ? " · diz que não há registros" : ""}`,
      url_visitada: url, url_pessoal: depois.url, produto: produto || produtoDe(depois.url),
      tem_menu_pessoal: true, tem_dados: temDados, apis: apis.slice(0, 3).join(" | ") || null,
      menu: doMenu.slice(0, 6).map((x) => x.t).join(" · ").slice(0, 300),
    };
  } catch (e) {
    return { veredito: "erro", detalhe: String(e.message).slice(0, 120), url_visitada: a.url };
  } finally { await ctx.close(); }
}

for (let i = 0; i < alvos.length; i += CONC) {
  const bloco = alvos.slice(i, i + CONC);
  const res = await Promise.all(bloco.map(async (a) => ({ a, r: await diagnostica(a) })));
  for (const { a, r } of res) {
    await q(`insert into folha_diagnostico_faltante
      (cod_ibge,municipio,uf,url_visitada,url_pessoal,produto,tem_menu_pessoal,tem_dados,apis,menu,veredito,detalhe,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
      on conflict (cod_ibge) do update set url_visitada=excluded.url_visitada, url_pessoal=excluded.url_pessoal,
        produto=excluded.produto, tem_menu_pessoal=excluded.tem_menu_pessoal, tem_dados=excluded.tem_dados,
        apis=excluded.apis, menu=excluded.menu, veredito=excluded.veredito, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, r.url_visitada ?? a.url, r.url_pessoal ?? null, r.produto ?? null,
       r.tem_menu_pessoal ?? null, r.tem_dados ?? null, r.apis ?? null, r.menu ?? null, r.veredito, r.detalhe]);
  }
  n += bloco.length;
  process.stdout.write(`   ${n}/${alvos.length} · ${comMenu} com menu de pessoal · ${comDados} COM DADOS\r`);
}
await browser.close();
console.log(`\n[diag] ${n} diagnosticados · ${comMenu} com item de pessoal · ${comDados} com dados`);
console.log("\n═══ VEREDITO ═══");
console.table((await q(`select veredito, count(*)::int mun from folha_diagnostico_faltante group by 1 order by 2 desc`)).rows);
console.log("═══ PRODUTOS encontrados (o que vira bloco) ═══");
console.table((await q(`select coalesce(produto,'(não identificado)') produto, count(*)::int mun,
  count(*) filter (where tem_dados)::int com_dados
  from folha_diagnostico_faltante group by 1 order by 2 desc limit 20`)).rows);
await db.end();
