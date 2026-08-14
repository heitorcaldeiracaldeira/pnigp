// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_govbr_js.mjs — descoberta com RENDER JS dos clientes GovernançaBrasil (cidade360/pronimtb).
//
// A descoberta HTTP (descobre_govbr.mjs) achou só 12 porque a assinatura cidade360 é INJETADA POR JS no site oficial
// (não está no HTML cru). Aqui abro cada site num navegador, deixo o JS rodar, e garima o host do portal GovBR:
//   `webapp1-{slug}.cidade360.cloud` · `{slug}.govbr.cloud` · qualquer host com `/pronimtb/`.
// Se não achar na home, segue o link "transparência/portal do servidor" (2 saltos).
//
// Popula `govbr_portal` (host, banco DW_LC131_AP_0) para o coletor `ingest_folha_govbr_auto.mjs`.
// Retomável: pula quem já está em govbr_descoberta com situacao ok/sem_govbr_js. Prioriza estados onde GovBR é forte
// (MG e vizinhos) mas varre todos. LIMITE e UF por env para lotes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const LIMITE = Number(process.env.LIMITE || 0);
const UF = process.env.UF || null;
const UA_REAL = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const normUrl = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; };

await q(`create table if not exists govbr_portal (
  cod_ibge text primary key, municipio text, uf text, host text, banco text default 'DW_LC131_AP_0',
  situacao text, linhas int, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists govbr_descoberta (
  cod_ibge text primary key, municipio text, uf text, url_portal text, host text, situacao text, em timestamptz default now()
)`);

// extrai o host GovBR do HTML renderizado
function achaHost(html) {
  // 1) host com /pronimtb (o portal de transparência)
  let m = html.match(/https?:\/\/([a-z0-9.-]+)\/[Pp]ronimtb\b/i);
  if (m) return m[1];
  // 2) webapp1-{slug}.cidade360.cloud (o padrão dominante)
  m = html.match(/(webapp\d*-?[a-z0-9-]*\.cidade360\.cloud)/i);
  if (m) return m[1];
  // 3) {slug}.govbr.cloud
  m = html.match(/([a-z0-9-]+\.govbr\.cloud)/i);
  if (m) return m[1];
  // 4) qualquer *.cidade360.cloud
  m = html.match(/([a-z0-9-]+\.cidade360\.cloud)/i);
  if (m) return m[1];
  return null;
}
// filtra hosts que NÃO são transparência (nfse, IP puro, etc.)
const hostBom = (h) => h && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && !/nfse|nota|iss\b/i.test(h);

// alvos: prefeituras ainda não resolvidas por JS
const alvos = (await q(`select r.cod_ibge, r.municipio, r.uf, r.url_portal
  from radar_portal r
  left join govbr_descoberta d on d.cod_ibge=r.cod_ibge and d.situacao in ('ok','sem_govbr_js')
  where r.unidade_gestora ilike 'Prefeitura%' and r.url_portal is not null and r.url_portal <> '-'
    and d.cod_ibge is null and not exists (select 1 from govbr_portal g where g.cod_ibge=r.cod_ibge and g.host is not null)
  ${UF ? "and r.uf=$1" : ""}
  order by case r.uf when 'Minas Gerais' then 0 when 'Mato Grosso do Sul' then 1 when 'Goiás' then 2 when 'São Paulo' then 3 else 9 end, r.municipio
  ${LIMITE ? "limit " + (UF ? "$2" : "$1") : ""}`,
  [UF, LIMITE].filter((x) => x !== null && x !== 0))).rows;
console.log(`[descobre_govbr_js] ${alvos.length} sites para render JS`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const ctx = await browser.newContext({ userAgent: UA_REAL });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();
  const marca = (situacao, host = null) =>
    q(`insert into govbr_descoberta (cod_ibge,municipio,uf,url_portal,host,situacao,em) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (cod_ibge) do update set host=excluded.host, situacao=excluded.situacao, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url_portal, host, situacao]);
  try {
    await page.goto(normUrl(a.url_portal), { waitUntil: "domcontentloaded", timeout: 30000 });
    await dorme(2500); // deixa o JS injetar os links
    let html = await page.content();
    let host = achaHost(html);
    if (!hostBom(host)) {
      host = null;
      // segue link de transparência/portal do servidor (2 saltos)
      const alvo = await page.locator("a").filter({ hasText: /transpar[êe]ncia|portal do servidor|servidores/i }).first();
      if (await alvo.count()) {
        const href = await alvo.getAttribute("href").catch(() => null);
        if (href) {
          const u = href.startsWith("http") ? href : new URL(href, page.url()).href;
          await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await dorme(2000);
          html = await page.content();
          const h2 = achaHost(html);
          if (hostBom(h2)) host = h2;
        }
      }
    }
    if (host) {
      await marca("ok", host);
      await q(`insert into govbr_portal (cod_ibge,municipio,uf,host,situacao) values ($1,$2,$3,$4,'descoberto')
        on conflict (cod_ibge) do update set host=excluded.host, em=now()`, [a.cod_ibge, a.municipio, a.uf, host]);
      ok++; console.log(`  [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio} -> ${host}`);
    } else { await marca("sem_govbr_js"); sem++; }
  } catch (e) { falhas++; await marca("erro_js"); }
  finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[descobre_govbr_js] ${ok} clientes GovBR NOVOS · ${sem} sem assinatura · ${falhas} falhas`);
const r = await q(`select count(*) n from govbr_portal where host is not null`);
console.log("govbr_portal total com host:", r.rows[0].n);
await db.end();
