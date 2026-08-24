// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_portal_pelo_site.mjs — abre o SITE OFICIAL de cada município sem folha e classifica os links pelo
// PRODUTO de transparência, devolvendo um alvo pronto para o coletor que já existe.
//
// ⭐ POR QUE: os três maiores ganhos de 16/ago vieram exatamente daqui, não de varredura de subdomínio —
//   Venâncio Aires  → `transparenciarh.venancioaires.rs.gov.br` (ADMRH), no menu "Recursos Humanos"
//   Cachoeira do Sul→ `webapp1-cachoeira.cidade360.cloud` (GovBR), no link do ITBI
//   Bento Gonçalves → `bentogoncalves.oxy.elotech.com.br` (Elotech), no menu do rodapé
// O portal real quase sempre está a um clique do site oficial; o que falta é ler o site, não adivinhar host.
//
// 🚨 Playwright e não fetch: Cloudflare devolve 403 para requisição sem navegador (Osório) e muitos sites montam
// o menu por JS.
//
// Uso: UF=RS node scripts/descobre_portal_pelo_site.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 4);
const LIMITE = Number(process.env.LIMITE || 999);
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// assinatura → produto que já tem coletor. Ordem importa: a primeira que casar vale.
const ASSINATURAS = [
  [/rhsysportaltransp|rhsysweb/i, "admrh"],
  [/\/api\/folha_pagamentos|dbseller/i, "dbseller"],
  [/TransparenciaJavaEnvironment|com\.tche/i, "tche"],
  [/\.oxy\.elotech\.com\.br|\.eloweb\.net/i, "elotech"],
  [/cidade360|pronimtb|govbr\.cloud/i, "govbr"],
  [/\.atende\.net/i, "ipm"],
  [/multi24/i, "multi24"],
  [/msgestaopublica|dcfiorilli|rcmsuporte|:879\//i, "scpi"],
  [/e-gov\.betha\.com\.br|betha\.cloud/i, "betha"],
  [/abase\.com\.br/i, "abase"],
  [/hardsoftsistemas|hardsoftsfa/i, "hardsoft"],
  [/digifred/i, "digifred"],
  [/sinsoft/i, "sinsoft"],
  [/citta/i, "citta"],
  [/sys523|cecam/i, "sys523"],
  [/portaltp|epublica/i, "portaltp"],
  [/publicsoft|smarapd/i, "publicsoft"],
  [/equiplano|tenosoft/i, "equiplano"],
  [/memory|ilai/i, "memory"],
  [/\/grp\/|grp\./i, "grp"],
];

await q(`create table if not exists folha_portal_candidato (
  cod_ibge text, municipio text, uf text, produto text, url text, achado_via text,
  achado_em timestamptz default now(), primary key (cod_ibge, url)
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome limit ${LIMITE}`, [UF])).rows;
console.log(`[site] ${muns.length} municípios ${UF} sem folha · ${CONC} em paralelo`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });

async function varreSite(m) {
  const s = so(m.nome);
  // 🚨 o domínio estava FIXO em `.rs.gov.br` — o script servia a um estado só. Vem da UF do município.
  const u = UF.toLowerCase();
  const candidatosHost = [`https://www.${s}.${u}.gov.br/`, `https://${s}.${u}.gov.br/`,
                          `https://www.pm${s}.${u}.gov.br/`, `https://www.pm${s}.com.br/`];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const achados = new Map();
  try {
    let abriu = null;
    for (const u of candidatosHost) {
      try {
        const r = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 40000 });
        if (r && r.ok()) { abriu = page.url(); break; }
      } catch { /* próximo host */ }
    }
    if (!abriu) return { erro: "site oficial não abriu" };
    await page.waitForTimeout(3500);

    // 1ª passada: links da home. 2ª: a página de transparência, onde mora o link do produto.
    const paginas = [abriu];
    const links1 = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
    const transp = links1.find((h) => /transpar/i.test(h) && !/radardatransparencia|portaltransparencia\.gov/i.test(h));
    if (transp) paginas.push(transp);

    for (const p of paginas) {
      if (p !== abriu) {
        try { await page.goto(p, { waitUntil: "domcontentloaded", timeout: 40000 }); await page.waitForTimeout(3000); }
        catch { continue; }
      }
      const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href],[onclick],iframe[src]")]
        .map((e) => e.getAttribute("href") || e.getAttribute("src") || e.getAttribute("onclick") || "")
        .filter(Boolean));
      for (const h of hrefs) {
        for (const [re, produto] of ASSINATURAS) {
          if (!re.test(h)) continue;
          // 🚨 o link tem de ser DESTE município: portais de fornecedor citam outros clientes no rodapé
          const url = h.startsWith("http") ? h : (h.match(/https?:\/\/[^\s"')]+/) || [])[0];
          if (!url) break;
          if (!achados.has(produto)) achados.set(produto, url.slice(0, 300));
          break;
        }
      }
    }
    return { achados: [...achados.entries()], site: abriu };
  } catch (e) { return { erro: String(e.message).slice(0, 80) }; }
  finally { await ctx.close(); }
}

let comProduto = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  const bloco = muns.slice(k, k + CONC);
  const res = await Promise.all(bloco.map((m) => varreSite(m).then((r) => ({ m, r }))));
  for (const { m, r } of res) {
    if (r.erro || !r.achados?.length) continue;
    comProduto++;
    console.log(`⭐ ${m.nome.padEnd(26)} ${r.achados.map(([p, u]) => `${p}: ${u.slice(0, 62)}`).join("\n" + " ".repeat(29))}`);
    for (const [produto, url] of r.achados) {
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via)
        values ($1,$2,$3,$4,$5,'site oficial') on conflict (cod_ibge, url) do update set produto=excluded.produto,
        achado_em=now()`, [m.cod_ibge, m.nome, m.uf, produto, url]);
    }
  }
  i += bloco.length;
  process.stdout.write(`   ${i}/${muns.length} · ${comProduto} com produto\r`);
}
await browser.close();
console.log(`\n[site] ${comProduto} municípios com produto identificado`);
console.table((await q(`select produto, count(*)::int municipios from folha_portal_candidato
  where uf=$1 group by 1 order by 2 desc`, [UF])).rows);
await db.end();
