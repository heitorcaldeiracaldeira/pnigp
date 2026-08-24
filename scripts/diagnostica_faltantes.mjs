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
// ⭐ 21/ago/2026 — PODER=legislativo: o MESMO diagnóstico serve à CÂMARA. Muda o alvo (a fila das câmaras, não
//    os municípios sem folha da UF) e a tabela de veredito. As três perguntas — tem menu de pessoal? tem dados?
//    que produto é? — valem igual para os dois poderes ([[feedback-varios-metodos-um-por-tipo]]).
const PODER = (process.env.PODER || "executivo").toLowerCase();
const TAB_DIAG = PODER === "legislativo" ? "folha_diagnostico_camara" : "folha_diagnostico_faltante";
const LIMITE = Number(process.env.LIMITE || 999);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

await q(`create table if not exists ${TAB_DIAG} (
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
// ⭐ 23/ago/2026 — INCLUI_COM_FOLHA=1 atravessa o filtro "só quem não tem folha".
//    POR QUÊ: os vereditos `tem_dados` acumulados foram carimbados por um critério frouxo (qualquer tabela com
//    linhas ou um R$ na tela) e precisam de re-passada — mas a maioria desses municípios JÁ TEM folha, então o
//    filtro padrão os tornava inalcançáveis pela própria ferramenta que precisa corrigi-los. Só usar junto com
//    REFAZ=1 e REFAZ_VEREDITO ([[pnigp-diagnostico-tem-dados-nao-e-folha-nominal]]).
const SO_SEM_FOLHA = process.env.INCLUI_COM_FOLHA === "1" ? "" : `and left(m.cod_ibge,6) not in (${F})`;
// ⭐ alvos do LEGISLATIVO: a fila das câmaras que TEM portal mapeado e nenhum produto reconhecido pela
//    assinatura — é o maior bloco restante (~2,2 mil municípios). Aqui a pergunta não é "onde está o portal",
//    é "esse portal publica folha, e em que produto".
const alvosCamara = PODER !== "legislativo" ? [] : (await q(`
  select cod_ibge, municipio, uf, coalesce(url_erp_camara, url_camara, url_camara_2) url
    from folha_camara_fila
   where coalesce(url_erp_camara, url_camara, url_camara_2) is not null
     -- ⭐ 23/ago/2026 — INCLUI_PROMOVIDAS=1 atravessa o filtro "sem produto reconhecido". Espelho de
     --    INCLUI_COM_FOLHA no ramo do executivo: as câmaras já PROMOVIDAS têm erp_camara preenchido e eram
     --    inalcançáveis pela ferramenta — e são exatamente as que precisam de revisão, porque foram promovidas
     --    com o critério frouxo ([[pnigp-diagnostico-tem-dados-nao-e-folha-nominal]]).
     ${process.env.INCLUI_PROMOVIDAS === "1" ? "" : "and erp_camara is null"}
     ${process.env.UF ? "and uf = $1" : ""}
     ${process.env.REFAZ === "1" ? "" : `and not exists (select 1 from ${TAB_DIAG} d where d.cod_ibge = folha_camara_fila.cod_ibge)`}
     -- ⭐ REFAZ_VEREDITO=sem_resposta,erro — revisita só quem caiu nesses vereditos. Portal municipal cai e
     --    volta: "não respondeu" quase nunca é definitivo ([[pnigp-ordem-retorno-resondar-corrigir-criar]]).
     ${process.env.REFAZ_VEREDITO ? `and exists (select 1 from ${TAB_DIAG} d2 where d2.cod_ibge = folha_camara_fila.cod_ibge
         and d2.veredito = any(string_to_array('${process.env.REFAZ_VEREDITO.replace(/'/g, "")}', ',')))` : ""}
     ${process.env.PULA_REFEITOS === "1" ? `and not exists (select 1 from ${TAB_DIAG} d5
         where d5.cod_ibge = folha_camara_fila.cod_ibge and d5.detalhe ilike '%nominais%')` : ""}
   order by rais_legislativo desc nulls last limit ${LIMITE}`, process.env.UF ? [process.env.UF] : [])).rows;

const alvos = PODER === "legislativo" ? alvosCamara : (await q(`
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
   where left(m.cod_ibge,2) = $1 ${SO_SEM_FOLHA}
     ${process.env.REFAZ === "1" ? "" : `and not exists (select 1 from folha_diagnostico_faltante d where d.cod_ibge = m.cod_ibge)`}
     -- REFAZ_LIXO=1: só os que ficaram com URL que NÃO é do município (portaltransparencia.gov.br,
     -- tesourotransparente, transparencia.rs.gov.br, webde.com.br…). Um diagnóstico feito sobre a URL errada
     -- responde sobre o portal errado — e foi o que carimbou vários como "sem item de pessoal".
     -- REFAZ_VEREDITO=a,b: revisita só quem caiu nesses vereditos. Serve para a re-sondagem barata de
     -- sem_resposta / sem_portal, que quase nunca são definitivos — portal municipal cai e volta
     -- ([[pnigp-ordem-retorno-resondar-corrigir-criar]]). Precisa vir junto com REFAZ=1, que é quem libera
     -- quem já foi diagnosticado.
     ${process.env.REFAZ_VEREDITO ? `and exists (select 1 from folha_diagnostico_faltante d3 where d3.cod_ibge = m.cod_ibge
         and d3.veredito = any(string_to_array('${process.env.REFAZ_VEREDITO.replace(/'/g, "")}', ',')))` : ""}
     -- ⭐ PULA_REFEITOS=1: retoma re-passada interrompida sem repetir trabalho. O detalhe do critério NOVO
     --    sempre contém "nominais"; o do critério velho, nunca. É o marcador mais barato que existe — está
     --    no dado, não numa tabela de controle à parte.
     ${process.env.PULA_REFEITOS === "1" ? `and not exists (select 1 from folha_diagnostico_faltante d4
         where d4.cod_ibge = m.cod_ibge and d4.detalhe ilike '%nominais%')` : ""}
     ${process.env.REFAZ_LIXO === "1" ? `and exists (select 1 from folha_diagnostico_faltante d2 where d2.cod_ibge = m.cod_ibge
         -- 🚨 16/ago (SP): o fornecedor e-transparência serve VÁRIOS módulos em subdomínios distintos, e a
         -- descoberta pega o primeiro que aparece: nfe. é a NOTA FISCAL, ouvidoria. e cartadeservicos. são
         -- atendimento, /esic/wp_login é a tela de login do e-SIC. Nenhum deles tem folha — 20 municípios de SP
         -- (Taboão da Serra, Poá, Caçapava, Bragança Paulista, Guarujá, Itapevi…) foram carimbados
         -- "sem item de pessoal" por causa disso. O portal certo é {slug}.prefeitura.{uf}/TDAPortalClient.aspx,
         -- que a redescoberta com navegador encontra. Ver [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]].
         and coalesce(d2.url_pessoal, d2.url_visitada) ~* '(portaltransparencia\\.gov\\.br|tesourotransparente|transparencia\\.rs\\.gov\\.br|webde\\.com\\.br|gov\\.br/acessoainformacao|leismunicipais|cespro|nfe\\.etransparencia|ouvidoria\\.etransparencia|cartadeservicos\\.etransparencia|etransparencia\\.com\\.br/esic/)')` : ""}
   order by m.nome limit ${LIMITE}`, PODER === "legislativo" ? [] : [COD_UF])).rows;
console.log(`[diag] ${alvos.length} municípios a diagnosticar · ${CONC} em paralelo`);

// 🚨 23/ago: este regex também filtra as ROTAS DE DADOS capturadas na rede, e era estreito demais —
//    `folhaClass.php` (a rota que destravou as 16 câmaras de PE) não casa com "folha de pagamento".
//    Alargado para pedaços de palavra, que é como fornecedor nomeia endpoint
//    ([[pnigp-pe-leg-whitelabel-folhaclass]]).
const RE_PESSOAL = /servidor|pessoal|remunera|folha|quadro de pessoal|sal[áa]rio|vencimento|holerite|contracheque/i;
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
    // 🚨 23/ago/2026 — A URL DA FILA VEM SUJA, e isso estava sendo lido como "o portal não respondeu".
    //    Dois casos achados no PI: `radar_portal.url_portal` com um ESPAÇO (virava `https:// `, inválida) e
    //    Corrente/PI apontando para `/informacoesgerais/redes-sociais` — a página de redes sociais, não o
    //    portal. Nem navegador nem fetch resolvem endereço errado; o que resolve é declarar o que é.
    const cru = String(a.url || "").trim();
    if (!cru || cru === "-" || !/[a-z0-9]/i.test(cru)) {
      return { veredito: "sem_portal", detalhe: "URL vazia ou inválida na fila" };
    }
    const url = cru.startsWith("http") ? cru : "https://" + cru;
    // 🚨 23/ago/2026 — O RETORNO DO `goto` NÃO É PROVA. SPA que redireciona logo após o load faz o Playwright
    //    abortar a navegação original e o goto REJEITAR, com a página carregada e funcionando. O critério
    //    antigo (`if (!resp) sem_resposta`) carimbou 120 municípios como "não respondeu" sem olhar a tela —
    //    e 37 deles só no PI, todos com portal vivo ([[pnigp-goto-falha-mas-pagina-carrega]]).
    //    A prova passa a ser o ESTADO da página: tem conteúdo, então carregou.
    await page.goto(url, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
    // 🚨 terceira passada: `commit` volta ANTES de qualquer conteúdo, e a espera fixa de 4,5s não alcançava
    //    portal municipal lento. Prova: `fetch` com 25s de paciência trouxe 46 a 105 KB dos mesmos endereços
    //    que o navegador dava por mortos. A espera passa a ser ADAPTATIVA — sai assim que houver HTML.
    const temHtml = () => page.evaluate(() => {
      const html = document.documentElement ? document.documentElement.outerHTML.length : 0;
      const texto = document.body ? document.body.innerText.replace(/\s+/g, " ").trim().length : 0;
      return html > 2000 || texto > 150;
    }).catch(() => false);
    let pronto = false;
    for (let t = 0; t < 8 && !pronto; t++) { await page.waitForTimeout(2500); pronto = await temHtml(); }
    // 🚨 segunda passada do mesmo conserto: testar `innerText` também dava falso negativo — ele vem VAZIO em
    //    frameset e quando o conteúdo mora em iframe, que é o caso dos portais do PI. Provado por fetch puro:
    //    4 de 5 devolviam HTTP 200 com 46 a 105 KB enquanto o navegador dizia "sem conteúdo".
    //    A prova passa a ser o HTML servido, que existe nos dois casos.
    // ⭐⭐ RECUO PARA HTTP PURO. Provado em 23/ago: `fetch` com paciência traz 46 a 105 KB de portais que o
    //    navegador dá por mortos (4 de 5 testados no PI, HTTP 200). Três consertos na navegação não resolveram,
    //    então a saída não é uma quarta espera — é usar o HTML que o servidor entrega. Esses portais são
    //    renderizados no servidor, então o menu está no HTML e as três perguntas do diagnóstico continuam
    //    respondíveis. O veredito fica marcado como vindo do HTTP, para não se confundir com diagnóstico
    //    completo — sem JS, não dá para CLICAR no item de pessoal e ver a tela.
    // ⭐ e quando o caminho profundo não entrega, tentar a RAIZ do mesmo host: o link que o radar guardou pode
    //    ser uma página interna qualquer (notícias, redes sociais), e a home do portal costuma existir.
    let raizTentada = null;
    if (!pronto) {
      try {
        const o = new URL(url).origin;
        if (o !== url.replace(/\/+$/, "")) {
          raizTentada = o;
          await page.goto(o, { waitUntil: "commit", timeout: 45000 }).catch(() => {});
          for (let t = 0; t < 4 && !pronto; t++) { await page.waitForTimeout(2500); pronto = await temHtml(); }
        }
      } catch { /* URL não parseável já foi tratada acima */ }
    }
    let viaHttp = false;
    if (!pronto) {
      try {
        const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow",
                                     signal: AbortSignal.timeout(30000) });
        if (r.ok) {
          const html = await r.text();
          if (html.length > 2000) {
            await page.setContent(html, { waitUntil: "domcontentloaded" }).catch(() => {});
            pronto = await temHtml();
            viaHttp = pronto;
          }
        }
      } catch { /* servidor fora mesmo */ }
    }
    if (!pronto) return { veredito: "sem_resposta", detalhe: "nem navegador nem HTTP devolveram HTML", url_visitada: url };

    // ⭐⭐ 23/ago — AS ROTAS CITADAS NA PÁGINA, mesmo que nunca disparem. No bloco `pe-leg` a tabela é montada
    //    por jQuery Bootgrid e a folha inteira vive em `folhaClass.php?...&rowCount=-1`: a TELA mostrava zero
    //    linhas e o DADO estava a um GET de distância. Ler `url:`, `action=` e `fetch()` do HTML transforma
    //    "tela sem linhas" de veredito final em PISTA ([[pnigp-pe-leg-whitelabel-folhaclass]]).
    const citadas = await page.evaluate(() => {
      const html = document.documentElement.outerHTML;
      const rx = /(?:url\s*:\s*|fetch\(\s*|action\s*=\s*|ajax\s*:\s*\{[^}]*url\s*:\s*)["']([^"']{5,120})["']/gi;
      return [...new Set([...html.matchAll(rx)].map((m) => m[1]))]
        .filter((u) => /\.(php|asp|aspx|jsp|json|do|ashx)|\/api\/|servlet|rest\//i.test(u))
        .slice(0, 12);
    }).catch(() => []);
    const info = await page.evaluate(() => {
      const itens = [...document.querySelectorAll("a,button,li,span,h2,h3")]
        .map((e) => ({ t: (e.innerText || "").trim(), h: e.getAttribute("href") || "" }))
        .filter((x) => x.t && x.t.length > 2 && x.t.length < 60);
      return { itens, html: document.documentElement.outerHTML.slice(0, 300000) };
    });
    const re = /servidor|pessoal|remunera|folha de pagamento|quadro de pessoal|sal[áa]rio/i;
    // 🚨 23/ago — O PRIMEIRO ITEM QUE CASA NÃO É O MELHOR. "Perguntas e Respostas sobre PESSOAL" casa com o
    //    regex e leva ao FAQ: 8 municípios de PE fecharam `tela_sem_linhas` porque o diagnóstico clicou no
    //    lugar errado e descreveu a tela errada. Agora os candidatos são ORDENADOS por especificidade — quem
    //    diz "folha de pagamento"/"remuneração"/"servidores" ganha de quem só tem "pessoal" no meio da frase,
    //    e itens que denunciam OUTRA tela (perguntas, glossário, e-SIC, legislação) caem para o fim.
    const PESO = (t) => {
      const s2 = t.toLowerCase();
      if (/pergunta|glossário|glossario|e-?sic|legisla|manual|ajuda|d[úu]vida/.test(s2)) return -1;
      if (/folha de pagamento|folha_pagamento|remunera[çc][ãa]o dos servidores/.test(s2)) return 4;
      if (/servidores|quadro de pessoal|remunera/.test(s2)) return 3;
      if (/sal[áa]rio|vencimento|contracheque|holerite/.test(s2)) return 2;
      return 1;
    };
    const doMenu = info.itens.filter((x) => re.test(x.t))
      .map((x) => ({ ...x, peso: PESO(x.t) }))
      .filter((x) => x.peso > 0)
      .sort((a, b) => b.peso - a.peso);
    const produto = produtoDe(info.html) || produtoDe(url);
    if (!doMenu.length) {
      return { veredito: "sem_item_de_pessoal",
               detalhe: "menu não oferece pessoal/folha" + (viaHttp ? " (lido via HTTP, sem JS)" : ""),
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
      const DINHEIRO = /R\$\s?\d{1,3}(\.\d{3})*,\d{2}|\d{1,3}(\.\d{3})*,\d{2}/;
      // 🚨 23/ago/2026 — NOME E VALOR NA MESMA LINHA. O critério antigo (mais de 2 linhas OU um R$ na tela)
      //    aceitava a TABELA DE VENCIMENTOS POR CARGO como se fosse folha: tem linhas e tem dinheiro, e não tem
      //    ninguém. Resultado medido: dos 30 alvos que o promotor mandou ao coletor do SCPI, 18 voltaram
      //    'sem_tela_nominal' e só 1 virou folha. É [[pnigp-lista-sem-valor-nao-e-folha]] pelo outro lado —
      //    valor sem nome não é folha ([[pnigp-tela-certa-nao-e-so-ter-tabela]]).
      // A régua do NOME é deliberadamente frouxa (2+ palavras alfabéticas de 3+ letras na mesma célula): nome
      //    de pessoa varia demais para regex apertada, e falso positivo aqui só custa uma visita do coletor —
      //    falso negativo custa um município.
      const EH_NOME = /^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇa-záâãàéêíóôõúç'´`. ]{6,}$/;
      const nome2 = (c) => EH_NOME.test(c.trim()) && c.trim().split(/\s+/).filter((w) => w.length >= 3).length >= 2;
      // 🚨 24/ago — NOME DE CARGO PARECE NOME DE PESSOA. Em Ubatuba/SP a tabela
      //    `Cargo | Salário | Quantitativos Providos | Quantitativos Vagos` deu 32 "linhas nominais": o
      //    detector via duas palavras longas na célula e aceitava. É a tabela de vencimentos por cargo — a
      //    MESMA armadilha que o veredito `tela_sem_nome` veio corrigir, escapando por outro caminho.
      //    Agora a tabela precisa DECLARAR uma coluna de pessoa no cabeçalho, e as linhas contam só ali.
      const CAB_NOME = /(nome|funcion[áa]rio|servidor|benefici[áa]rio|colaborador|agente\s+p[úu]blico)/i;
      const CAB_CARGO = /^\s*(cargo|fun[çc][ãa]o|classe|refer[êe]ncia)\s*$/i;
      let nominais = 0;
      for (const t of document.querySelectorAll("table")) {
        const cab = [...(t.rows[0] ? t.rows[0].cells : [])].map((c) => c.innerText.replace(/\s+/g, " ").trim());
        const iNome = cab.findIndex((c) => CAB_NOME.test(c) && !CAB_CARGO.test(c));
        // ⚖️ CONTRADIÇÃO recusa, AUSÊNCIA não — a mesma régua do poder (ente manda sobre setor):
        //    · cabeçalho que declara pessoa  → conta só a coluna dela (preciso)
        //    · cabeçalho que declara CARGO e nenhuma pessoa → é tabela de vencimentos, PULA
        //    · sem cabeçalho legível → cai na régua antiga, porque falso negativo custa um município e
        //      falso positivo custa uma visita do coletor
        const soCargo = iNome < 0 && cab.some((c) => CAB_CARGO.test(c));
        if (soCargo) continue;
        for (const row of t.rows) {
          const cels = [...row.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim());
          const temNome = iNome >= 0 ? (cels[iNome] && nome2(cels[iNome])) : cels.some(nome2);
          if (temNome && cels.some((c) => DINHEIRO.test(c))) nominais++;
        }
      }
      return { linhas, nominais, url: location.href,
               vazio: /nenhum registro|sem registros|no data|não há dados|nenhum dado/i.test(txt),
               temDinheiro: /R\$\s?\d{1,3}(\.\d{3})*,\d{2}/.test(txt) };
    });
    // ⭐ o veredito FORTE agora exige linha nominal; o que tem dado sem nome ganha veredito PRÓPRIO em vez de
    //    virar 'tem_dados' e entupir a fila de coleta com alvo que nenhum coletor consegue usar.
    const temDados = depois.nominais >= 2 && !depois.vazio;
    const temDadoSemNome = !temDados && (depois.linhas > 2 || depois.temDinheiro) && !depois.vazio;
    if (temDados) comDados++;
    return {
      veredito: temDados ? "tem_dados"
              : temDadoSemNome ? "tela_sem_nome"
              : (depois.vazio ? "tela_vazia" : "tela_sem_linhas"),
      detalhe: `item "${alvoTxt}" · ${depois.linhas} linhas · ${depois.nominais} nominais` +
               (depois.vazio ? " · diz que não há registros" : "") + (viaHttp ? " · via HTTP (sem JS)" : ""),
      url_visitada: url, url_pessoal: depois.url, produto: produto || produtoDe(depois.url),
      tem_menu_pessoal: true, tem_dados: temDados, apis: [...apis.slice(0, 3), ...citadas.map((c) => "cit:" + c)].join(" | ").slice(0, 900) || null,
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
    await q(`insert into ${TAB_DIAG}
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
console.table((await q(`select veredito, count(*)::int mun from ${TAB_DIAG} group by 1 order by 2 desc`)).rows);
console.log("═══ PRODUTOS encontrados (o que vira bloco) ═══");
console.table((await q(`select coalesce(produto,'(não identificado)') produto, count(*)::int mun,
  count(*) filter (where tem_dados)::int com_dados
  from ${TAB_DIAG} group by 1 order by 2 desc limit 20`)).rows);
await db.end();
