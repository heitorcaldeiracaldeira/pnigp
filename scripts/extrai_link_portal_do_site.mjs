// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// extrai_link_portal_do_site.mjs — do SITE do município para o LINK DO PORTAL de transparência.
//
// Por que existe: `varre_rodape_fornecedor.mjs` identifica o fornecedor pela assinatura no HTML e grava o SITE
// como candidato. Mas os coletores precisam da URL do PORTAL, que quase sempre mora em outro host:
//   Japaraíba/MG  → https://japaraiba-scpi.sigmix.net/transparencia/         (hospedagem sigmix.net)
//   Esmeraldas/MG → https://esmeraldamg.dcfiorilli.com.br:879/transparencia
//   Sério/RS      → http://transparencia.serio.rs.gov.br:8080/multi24/…      (porta alta)
// Sem este passo o coletor usa o site como base e fecha "sem tela nominal" — 41 municípios de MG saíram assim do
// SCPI, e 36 do Abase saíram como "token não extraído" ([[pnigp-modulo-vs-host-fornecedor]]).
//
// ⭐ O link do portal é sempre EXTERNO ao site (outro host) e casa com a assinatura do produto. É essa combinação
// — host diferente + assinatura — que o distingue dos 200 links internos de uma home municipal.
//
// Uso: UF=MG PRODUTO=scpi node scripts/extrai_link_portal_do_site.mjs      · SO=<município>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const PRODUTO = process.env.PRODUTO || null;
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// como reconhecer o PORTAL de cada produto num link externo
const ASSINATURA = {
  scpi: /dcfiorilli|sigmix|fiorilli|scpi|\/transparencia\/?(\?|$)|Default\.aspx\?AcessoIndividual/i,
  abase: /abase|folha-de-pagamento(-contratos)?\//i,
  multi24: /multi24/i,
  citta: /cittaweb|cittatec/i,
  betha: /betha\.cloud|e-gov\.betha/i,
  ipm: /atende\.net/i,
  govbr: /pronimtb|cidade360/i,
  portaltp: /portaltp\.com\.br/i,
  elotech: /eloweb\.net|elotech/i,
  memory: /memory\.com\.br/i,
  equiplano: /equiplano|e-gov\b/i,
};

const alvos = (await q(`
  select distinct on (c.cod_ibge) c.cod_ibge, c.municipio, c.uf, c.produto, c.url
    from folha_portal_candidato c join municipios_br m on m.cod_ibge = c.cod_ibge
   where c.achado_via = 'rodapé do portal'
     ${PRODUTO ? "and c.produto = $1" : ""}
     ${UF ? `and m.uf = $${PRODUTO ? 2 : 1}` : ""}
     ${SO ? `and m.nome ilike '%'||$${(PRODUTO ? 1 : 0) + (UF ? 1 : 0) + 1}||'%'` : ""}
   order by c.cod_ibge, length(c.url)`, [PRODUTO, UF, SO].filter(Boolean))).rows;
console.log(`[extrai-link] ${alvos.length} candidatos com URL de SITE (não de portal)`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const re = ASSINATURA[a.produto];
  if (!re) { console.log(`   ? ${a.municipio}: produto "${a.produto}" sem assinatura de portal`); continue; }
  const ctx = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    let achado = null;
    for (const cam of ["", "/transparencia", "/portal-da-transparencia", "/transparencia-e-acesso-a-informacao"]) {
      if (achado) break;
      try {
        await page.goto(a.url.replace(/\/+$/, "") + cam, { waitUntil: "domcontentloaded", timeout: 25000 });
        await dorme(2200);
        // 🚨 só links EXTERNOS: o site tem dezenas de `/transparencia/...` internos que não são o portal
        achado = await page.evaluate((fonte) => {
          const meu = location.hostname;
          const re2 = new RegExp(fonte, "i");
          const cand = [...document.querySelectorAll("a[href]")]
            .map((x) => x.href)
            .filter((h) => { try { return new URL(h).hostname !== meu && re2.test(h); } catch { return false; } });
          return cand[0] || null;
        }, re.source);
      } catch { /* próximo caminho */ }
    }
    if (achado) {
      ok++;
      console.log(`  ⭐ ${a.municipio.padEnd(24)} ${a.produto.padEnd(9)} ${achado.slice(0, 80)}`);
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
        values ($1,$2,$3,$4,$5,'link do portal extraído do site',now())
        on conflict (cod_ibge, url) do nothing`, [a.cod_ibge, a.municipio, a.uf, a.produto, achado]);
    } else { sem++; console.log(`   · ${a.municipio}: sem link externo de ${a.produto}`); }
  } catch (e) {
    sem++; console.log(`   ✖ ${a.municipio}: ${String(e.message).split("\n")[0].slice(0, 55)}`);
  }
  await ctx.close().catch(() => {});
}
await browser.close();
console.log(`\n[extrai-link] ${ok} links de portal achados · ${sem} sem link`);
await db.end();
