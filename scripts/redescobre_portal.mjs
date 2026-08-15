// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// redescobre_portal.mjs — segunda passada para municípios cujo "portal real" descoberto se revelou FALSO.
// Casos: el.com.br (é a tela de LOGIN do ERP GPI, não portal público), ingadigital (portal só de licitações),
// cdnjs/cloudflare (CDN que entrou por conter "cloud"). Aqui o link é escolhido pelo TEXTO do link — "portal da
// transparência" — e não só pelo padrão da URL.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const FALSOS = /el\.com\.br|ingadigital|cdnjs|jsdelivr|cloudflare/i;

const alvos = (await q(`select cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real
  from portal_real_descoberto where url_portal_real ~* $1 order by uf, municipio`, [FALSOS.source])).rows;
console.log(`${alvos.length} municípios com portal falso a redescobrir`);

let ok = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  let novo = null;
  try {
    const r = await fetch(a.url_site, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(35000) });
    const t = new TextDecoder("utf-8").decode(await r.arrayBuffer());
    // âncoras cujo TEXTO fala de transparência — mais confiável que casar padrão de URL
    const ancoras = [...t.matchAll(/<a[^>]+href=["']([^"']{6,160})["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)]
      .map((m) => ({ h: m[1], t: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
      .filter((x) => /transpar[eê]ncia|portal da transp|acesso à informa/i.test(x.t))
      .filter((x) => !FALSOS.test(x.h) && !/^#|javascript:/i.test(x.h));
    const host = (() => { try { return new URL(a.url_site).host.replace(/^www\./, ""); } catch { return ""; } })();
    // prefere link para FORA do site do município (o portal costuma ser de terceiro)
    const escolha = ancoras.find((x) => x.h.startsWith("http") && !x.h.includes(host)) || ancoras[0];
    if (escolha) novo = escolha.h.startsWith("http") ? escolha.h : new URL(escolha.h, a.url_site).href;
  } catch { /* site fora */ }
  if (novo) {
    const forn = (() => { try { return new URL(novo).host.replace(/^www\./, ""); } catch { return null; } })();
    await q(`update portal_real_descoberto set url_portal_real=$1, fornecedor=$2, em=now()
      where cod_ibge=$3 and erp_radar=$4`, [novo, forn, a.cod_ibge, a.erp_radar]);
    ok++;
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${alvos.length} · ${ok} corrigidos`);
}
console.log(`\n${ok}/${alvos.length} portais corrigidos`);
await db.end();
