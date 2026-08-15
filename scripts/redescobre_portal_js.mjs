// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// redescobre_portal_js.mjs — 3ª passada: abre o site institucional COM NAVEGADOR e procura o link do portal de
// transparência. Serve para os municípios em que a busca por HTML cru falhou porque o menu é montado por JS.
//
// Contexto: os portais "el.com.br" que sobraram são NFS-e/ERP (ba-itape-pm-NFS.cloud.el.com.br), não transparência.
// Ver [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]].
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const FILTRO = process.env.FILTRO || "el.com.br";
const RUIDO = /facebook|instagram|twitter|youtube|whatsapp|google|w3\.org|jquery|bootstrap|cdnjs|jsdelivr|radardatransparencia|atricon|tce\.|tcm\.|planalto|receita\.fazenda|\-nfs\.|nfse|notafiscal/i;

const alvos = (await q(`select cod_ibge, erp_radar, municipio, uf, url_site from portal_real_descoberto
  where url_portal_real ilike '%'||$1||'%' order by uf, municipio`, [FILTRO])).rows;
console.log(`[redescoberta JS] ${alvos.length} municípios`);

const browser = await chromium.launch({ headless: true });
let ok = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let novo = null;
  try {
    await page.goto(a.url_site, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(3500);
    novo = await page.evaluate((ruido) => {
      const re = new RegExp(ruido, "i");
      const cands = [...document.querySelectorAll("a")]
        .map((x) => ({ t: (x.innerText || x.title || "").replace(/\s+/g, " ").trim(), h: x.href || "" }))
        .filter((x) => /transpar[eê]ncia|acesso à informa|portal da transp/i.test(x.t + " " + x.h))
        .filter((x) => x.h.startsWith("http") && !re.test(x.h));
      const host = location.host.replace(/^www\./, "");
      // prefere o link que sai do domínio do município (o portal costuma ser de terceiro)
      return (cands.find((x) => !x.h.includes(host)) || cands[0] || {}).h || null;
    }, RUIDO.source);
  } catch { /* site fora */ }
  if (novo) {
    const forn = (() => { try { return new URL(novo).host.replace(/^www\./, ""); } catch { return null; } })();
    await q(`update portal_real_descoberto set url_portal_real=$1, fornecedor=$2, em=now()
      where cod_ibge=$3 and erp_radar=$4`, [novo, forn, a.cod_ibge, a.erp_radar]);
    ok++;
    console.log(`  ${a.uf} ${String(a.municipio).padEnd(20)} → ${novo.slice(0, 70)}`);
  } else {
    console.log(`  ${a.uf} ${String(a.municipio).padEnd(20)} (nada)`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${ok}/${alvos.length} redescobertos`);
await db.end();
