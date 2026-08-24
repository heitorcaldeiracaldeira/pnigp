// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_abase_token.mjs — extrai o TOKEN do portal Abase a partir do site do município.
//
// Por que existe: a varredura de rodapé (varre_rodape_fornecedor.mjs) prova que o município é Abase lendo a
// assinatura no rodapé do site — mas grava o SITE como candidato. O `ingest_folha_abase.mjs` precisa da URL da
// TELA DE FOLHA, que carrega um token no caminho:
//     /folha-de-pagamento-contratos/{token}     (tela A)
//     /folha-de-pagamento/{token}               (tela B, mais rica: traz secretaria)
// Sem esse passo o coletor fecha "token não extraído da URL" — foi o que aconteceu com 31 municípios de MG.
//
// 🚨 O token pode vir HTML-escapado (`&#199;`) ou URL-encoded (`%C3%87`) — desescapar antes de gravar.
//
// Uso: UF=MG node scripts/descobre_abase_token.mjs      · SO=<município>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// os candidatos que ainda não têm URL de tela de folha
const fila = (await q(`
  select distinct on (c.cod_ibge) c.cod_ibge, c.municipio, c.uf, c.url
    from folha_portal_candidato c
    join municipios_br m on m.cod_ibge = c.cod_ibge
   where c.produto = 'abase' and c.url !~ 'folha-de-pagamento'
     ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by c.cod_ibge, length(c.url)`, [UF, SO].filter(Boolean))).rows;
console.log(`[abase-token] ${fila.length} candidatos sem URL de folha`);

const RE_FOLHA = /https?:\/\/[^"'\s<>]*\/folha-de-pagamento(?:-contratos)?\/[^"'\s<>?]+/gi;
const desescapa = (u) => {
  let s = String(u).replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
  try { s = decodeURI(s); } catch { /* fica como está */ }
  return s.replace(/\/+$/, "");
};

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const ctx = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    let achada = null;
    for (const cam of ["", "/transparencia", "/portal-da-transparencia", "/transparencia/servidores"]) {
      if (achada) break;
      try {
        await page.goto(a.url.replace(/\/+$/, "") + cam, { waitUntil: "domcontentloaded", timeout: 25000 });
        await dorme(2500);
        const html = await page.content();
        const m = html.match(RE_FOLHA);
        if (m?.length) { achada = desescapa(m[0]); break; }
        // o link pode estar só no href de um <a>, sem aparecer no HTML servido
        const href = await page.evaluate(() => {
          const a2 = [...document.querySelectorAll("a[href]")].find((x) => /folha-de-pagamento/i.test(x.href));
          return a2 ? a2.href : null;
        });
        if (href) { achada = desescapa(href); break; }
      } catch { /* próximo caminho */ }
    }
    if (achada) {
      ok++;
      console.log(`  ⭐ [${i + 1}/${fila.length}] ${a.municipio} → ${achada.slice(0, 90)}`);
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
        values ($1,$2,$3,'abase',$4,'token extraído do site',now())
        on conflict (cod_ibge, url) do nothing`, [a.cod_ibge, a.municipio, a.uf, achada]);
    } else { sem++; console.log(`   · [${i + 1}/${fila.length}] ${a.municipio}: site abriu, sem link de folha Abase`); }
  } catch (e) {
    sem++; console.log(`   ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).split("\n")[0].slice(0, 55)}`);
  }
  await ctx.close().catch(() => {});
}
await browser.close();
console.log(`\n[abase-token] ${ok} tokens achados · ${sem} sem link`);
await db.end();
