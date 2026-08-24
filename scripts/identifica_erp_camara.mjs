// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// identifica_erp_camara.mjs — descobre QUAL produto serve a folha em cada portal de CÂMARA da fila.
//
// POR QUÊ: `folha_camara_fila` tem 3.385 municípios com URL de câmara já mapeada (o subproduto do achado que
// virou causa nacional — o radar apontava o poder errado, [[pnigp-radar-mapeou-a-camara-causa-nacional]]).
// Portal conhecido com produto desconhecido é portal inútil: sem o fornecedor não se sabe qual coletor chamar.
//
// Faz os 2 saltos do identificador original (home → link de transparência) e grava a EVIDÊNCIA (`erp_via`).
// 🚨 200 não prova nada ([[pnigp-sonda-soft404-falso-positivo]]) e assinatura não é folha: aqui o veredito é
//    "que produto é", nunca "tem folha" — quem dá o veredito de folha é o COLETOR
//    ([[pnigp-sonda-folha-prova-e-a-coleta]], [[pnigp-prefeitura-ao-lado-da-camara]]).
//
// Uso: node scripts/identifica_erp_camara.mjs            · CONC=5 LIMITE=100 UF=BA REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
import { identifica, linkTransparencia, baixa } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 5);
const LIMITE = process.env.LIMITE ? Number(process.env.LIMITE) : null;
const UF = process.env.UF || null;
const REFAZ = process.env.REFAZ === "1";

for (const c of ["erp_camara text", "url_erp_camara text", "erp_via text", "checado_em timestamptz"]) {
  await q(`alter table folha_camara_fila add column if not exists ${c}`);
}

const alvos = (await q(`select cod_ibge, municipio, uf, coalesce(url_camara, url_camara_2) url
  from folha_camara_fila
  where coalesce(url_camara, url_camara_2) is not null
    ${process.env.SO_SEM_URL === "1" ? "and erp_camara is not null and url_erp_camara is null" : ""}
    ${REFAZ || process.env.SO_SEM_URL === "1" ? "" : "and checado_em is null"}
    ${UF ? "and uf = $1" : ""}
  order by rais_legislativo desc nulls last ${LIMITE ? `limit ${LIMITE}` : ""}`, UF ? [UF] : [])).rows;

console.log(`[erp/camara] ${alvos.length} portais de câmara a identificar · concorrência ${CONC}`);
let achados = 0, feitos = 0;
const placar = new Map();

for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    let erp = null, urlErp = null, via = "sem_resposta";
    const html = await baixa(a.url);
    if (html) {
      let id = identifica(html);
      via = "assinatura";
      if (!id.erp) {                                   // 2º salto: segue o link de transparência
        const alvo = linkTransparencia(html, a.url);
        if (alvo && !/\.(gov|leg)\.br\/?$/i.test(alvo)) {
          const h2 = await baixa(alvo);
          if (h2) { id = identifica(h2); via = "assinatura-2salto"; }
        }
      }
      erp = id.erp || null;
      urlErp = id.url || (via === "assinatura-2salto" ? linkTransparencia(html, a.url) : null);
      // 🚨 A ASSINATURA NA HOME NÃO DÁ O PORTAL. Em 148 câmaras MegaSoft a home é `{slug}.{uf}.leg.br` e o portal
      //    de transparência mora noutro host (`{slug}.megasofttransparencia.com.br`) — sem a URL do produto o
      //    coletor bate em `sem_token` (HTTP 400) nas 98 que tentei. O link para o produto está no HTML da home:
      //    é ele que vale, não o host do site ([[pnigp-rota-identifica-o-produto-nao-o-host]]).
      // 🚨 O PRIMEIRO LINK QUE CITA O FORNECEDOR COSTUMA SER ASSET, NÃO PORTAL: em 123 câmaras NucleoGov o
      //    regex trouxe `file.nucleogov.com.br/webfonts/design-kit-icons/…`. Fonte, ícone e folha de estilo
      //    provam o produto e não servem de porta — o alvo é a PÁGINA ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
      if (erp && !urlErp) {
        const ASSET = /\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico)(\?|$)|\/(webfonts|assets|static|css|js|img|images|fonts)\//i;
        const re = new RegExp(`https?://[^"'\\s<>]*${erp.replace(/[^a-z0-9]/gi, "")}[^"'\\s<>]*`, "ig");
        urlErp = (html.match(re) || []).find((u) => !ASSET.test(u)) || linkTransparencia(html, a.url) || null;
      }
      if (!erp) via = "sem_assinatura";
    }
    await q(`update folha_camara_fila set erp_camara=$2, url_erp_camara=$3, erp_via=$4, checado_em=now()
             where cod_ibge=$1`, [a.cod_ibge, erp, urlErp, via]);
    feitos++;
    if (erp) { achados++; placar.set(erp, (placar.get(erp) || 0) + 1); }
  }));
  if (i % 200 === 0) console.log(`  … ${feitos}/${alvos.length} · ${achados} com produto identificado`);
}

console.log(`\n[erp/camara] ${feitos} portais checados · ${achados} com produto identificado`);
console.table([...placar.entries()].sort((a, b) => b[1] - a[1]).map(([erp, n]) => ({ erp, municipios: n })));
await db.end();
