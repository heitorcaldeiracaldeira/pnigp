// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_genexus_srvbr_js.mjs — 2ª passada da descoberta srv.br, agora com RENDER JS (Playwright).
// A 1ª passada (HTTP, descobre_genexus_srvbr.mjs) só achou 10/456 porque os links `*.srv.br` são injetados por
// JavaScript no site oficial. Aqui abro cada site 'sem_link' num navegador, deixo renderizar, e garima o link.
// Se não achar na home, procura um link de "transparência" e o segue (2 saltos).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const LIMITE = Number(process.env.LIMITE || 0);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const normUrl = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; };

const RE = /https?:\/\/([a-z0-9.-]+\.srv\.br)\/([a-z0-9._-]+)\/servlet\/([a-z0-9._]+)/i;
function extrai(html) {
  const m = html.match(RE);
  if (!m) return null;
  const [, host, app, servlet] = m;
  const versao = /_v2|_v3/i.test(servlet) || /home_portal_v2|home_servidor/i.test(html) ? "v2" : "v1";
  return { base: `https://${host}/${app}`, servlet: servlet.replace(/[?].*$/, ""), versao };
}

const fila = (await q(`select cod_ibge, municipio, uf, rotulo_radar, url_portal from genexus_srvbr_portal
  where situacao='sem_link' and url_portal is not null order by uf, municipio ${LIMITE ? "limit " + LIMITE : ""}`)).rows;
console.log(`[descobre_srvbr_js] ${fila.length} sites 'sem_link' para render JS`);

const browser = await chromium.launch({ headless: true });
let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const page = await browser.newPage();
  const marca = (situacao, base = null, servlet = null, versao = null, detalhe = null) =>
    q(`update genexus_srvbr_portal set base_url=$2, home_servlet=$3, versao=$4, situacao=$5, detalhe=$6, em=now() where cod_ibge=$1`,
      [a.cod_ibge, base, servlet, versao, situacao, detalhe]);
  try {
    await page.goto(normUrl(a.url_portal), { waitUntil: "domcontentloaded", timeout: 30000 });
    await dorme(2500); // deixa o JS injetar os links
    let html = await page.content();
    let f = extrai(html);
    if (!f) {
      // procura link de "transparência" e segue
      const alvo = await page.locator("a").filter({ hasText: /transpar[êe]ncia/i }).first();
      if (await alvo.count()) {
        const href = await alvo.getAttribute("href").catch(() => null);
        if (href) {
          const u = href.startsWith("http") ? href : new URL(href, page.url()).href;
          await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await dorme(2000);
          html = await page.content();
          f = extrai(html);
        }
      }
    }
    if (f) { await marca("ok", f.base, f.servlet, f.versao); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ${f.versao}: ${f.base}`); }
    else { await marca("sem_link_js", null, null, null, "sem srv.br apos render"); sem++; }
  } catch (e) { falhas++; await marca("erro_js", null, null, null, String(e.message).slice(0, 100)); }
  finally { await page.close(); }
}
await browser.close();
console.log(`\n[descobre_srvbr_js] ${ok} novas URLs · ${sem} ainda sem link · ${falhas} falhas`);
const r = await q(`select versao, count(*) n from genexus_srvbr_portal where situacao='ok' group by versao`);
console.log("total com URL por versão:", r.rows.map((x) => (x.versao || "?") + "=" + x.n).join(" "));
await db.end();
