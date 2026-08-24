// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_iframe_folha.mjs — abre a tela de pessoal de cada município sem folha e extrai o IFRAME/EMBED.
//
// POR QUÊ: muitos portais municipais são só uma CASCA que embute o portal do ERP num iframe montado por
// JavaScript. O HTML servido não tem o src (Alpine/Vue preenchem depois), então nem curl nem o identificador
// por assinatura enxergam. Riachinho/TO parecia "tela sem linhas" e na verdade embute
// `riachinho.datalins.com/transparencia/` — que é **SCPI 9.0**, coletor que já temos
// ([[pnigp-portal-proprio-e-white-label]]).
//
// É o passo 3 de [[pnigp-diagnostico-profundo-menu-dados-produto]] (qual PRODUTO?) para os casos em que o
// produto está escondido atrás de um iframe.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = (process.env.UF || "TO,GO").split(",");
const CONC = Number(process.env.CONC || 3);

await q(`create table if not exists folha_iframe_descoberto (
  cod_ibge text primary key, municipio text, uf text, url_visitada text,
  iframe_src text, host_iframe text, produto text, em timestamptz default now())`);

// alvos: os que o diagnóstico marcou com menu de pessoal mas sem linhas, e que seguem sem folha
// ⭐ TODO município ainda sem folha, e a URL vem de QUALQUER origem conhecida — diagnóstico, portal real,
// site derivado ou o Radar. Restringir aos `tela_sem_linhas` deixava de fora justamente quem o diagnóstico
// nem conseguiu abrir. "Entrar no site do município" é a instrução; a origem da URL é detalhe.
// ⚠️ o prefixo do IBGE é a chave sem ambiguidade: `municipios_br.uf` guarda SIGLA, `portal_real_descoberto.uf`
// guarda o NOME POR EXTENSO, e `folha_diagnostico_faltante.uf` guarda sigla. Já perdi medição por isso hoje.
const COD_UF = { TO: "17", GO: "52", BA: "29", MG: "31", SP: "35" };
const alvos = (await q(`
  with falta as (
    select m.cod_ibge, m.nome municipio, m.uf
      from municipios_br m
     where left(m.cod_ibge,2) = any($1)
       and not exists (select 1 from vw_folha_municipal_brasil v where v.cod_ibge=m.cod_ibge and v.fonte<>'rais')
       and not exists (select 1 from folha_iframe_descoberto i where i.cod_ibge=m.cod_ibge))
  select f.cod_ibge, f.municipio, f.uf,
         coalesce(
           (select coalesce(d.url_pessoal, d.url_visitada) from folha_diagnostico_faltante d
             where d.cod_ibge=f.cod_ibge and coalesce(d.url_pessoal,d.url_visitada) ~* '^https?://' limit 1),
           (select p.url_portal_real from portal_real_descoberto p where p.cod_ibge=f.cod_ibge
             and p.url_portal_real ~* '^https?://' order by p.em desc limit 1),
           (select s.url_site from site_municipal_derivado s where s.cod_ibge=f.cod_ibge
             and s.url_site ~* '^https?://' limit 1),
           (select r.url_portal from radar_portal r where r.cod_ibge=f.cod_ibge
             and r.unidade_gestora ilike 'Prefeitura%' and r.url_portal ~* '^https?://' limit 1)
         ) url
    from falta f
   order by f.uf, f.municipio`, [UF.map((u) => COD_UF[u] || u)])).rows.filter((a) => a.url);
console.log(`[iframe] ${alvos.length} municípios a abrir`);

// assinatura do produto pelo HOST do iframe — o que interessa é cair num coletor que já existe
const PRODUTO = [
  [/datalins\.com|sgpcloud|-scpi\.|dcfiorilli|sigmix|masterpublica/i, "scpi"],
  [/memory\.com\.br/i, "memory"],
  [/7focus\.inf\.br/i, "7focus"],
  [/bsit-br\.com\.br|sigep\.com\.br/i, "bsit"],
  [/megasoft/i, "megasoft"],
  [/nucleogov|acessoainformacao\./i, "nucleogov"],
  [/betha\.cloud|e-gov\.betha/i, "betha"],
  [/portaltp\.com\.br/i, "portaltp"],
  [/elotech/i, "elotech"],
  [/govbr\.cloud|cidade360/i, "govbr"],
  [/atende\.net/i, "ipm"],
];

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let achados = 0, feitos = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
      await page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);   // dá tempo do JS montar o iframe
      const srcs = await page.evaluate(() => [...document.querySelectorAll("iframe,embed,object")]
        .map((f) => f.src || f.getAttribute("src") || f.getAttribute("data") || f.dataset?.src)
        .filter((s) => s && /^https?:/i.test(s)));
      // ignora ruído (mapas, vídeos, analytics)
      const util = srcs.find((s) => !/youtube|google|facebook|maps|vimeo|recaptcha|doubleclick/i.test(s));
      if (!util) return;
      const host = new URL(util).hostname;
      const produto = (PRODUTO.find(([re]) => re.test(util)) || [])[1] || null;
      await q(`insert into folha_iframe_descoberto (cod_ibge,municipio,uf,url_visitada,iframe_src,host_iframe,produto)
               values ($1,$2,$3,$4,$5,$6,$7) on conflict (cod_ibge) do update
               set iframe_src=excluded.iframe_src, host_iframe=excluded.host_iframe, produto=excluded.produto, em=now()`,
        [a.cod_ibge, a.municipio, a.uf, a.url, util, host, produto]);
      achados++;
      console.log(`  ✔ ${a.municipio.padEnd(28)} ${produto ? "[" + produto + "] " : ""}${host}`);
    } catch { /* portal fora do ar */ }
    finally { try { await ctx.close(); } catch {} }
  }));
  feitos += Math.min(CONC, alvos.length - i);
  process.stdout.write(`   ${feitos}/${alvos.length} · ${achados} com iframe\r`);
}
try { await browser.close(); } catch {}
console.log(`\n[iframe] ${achados} de ${alvos.length} com iframe útil`);
console.table((await q(`select coalesce(produto,'(não reconhecido)') produto, count(*)::int n
  from folha_iframe_descoberto group by 1 order by 2 desc`)).rows);
await db.end();
