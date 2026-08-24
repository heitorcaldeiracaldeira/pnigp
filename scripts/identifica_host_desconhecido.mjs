// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// identifica_host_desconhecido.mjs — abre o host que a varredura achou mas não soube classificar e identifica o
// PRODUTO pelo conteúdo da página (não pelo domínio).
//
// ⭐ POR QUE: no RN 18 municípios ficaram com host e sem produto. O domínio não diz nada (`topdown.servehttp.com`,
//    `177.87.15.68:8079`), mas a PÁGINA diz: o SCPI tem `AcessoIndividual=LnkServidores` e `gridPessoal`, o
//    IPM tem `atende.net`, e assim por diante. Ver [[pnigp-fornecedor-e-host-nao-erp]].
// 🚨 A porta :8079 é assinatura forte de SCPI/Fiorilli on-premise ([[pnigp-varredura-host-porta-onpremise]]).
//
// Uso: UF=RN node scripts/identifica_host_desconhecido.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";
const CONC = Number(process.env.CONC || 3);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// assinatura no CONTEÚDO (html + urls carregadas) → produto
const MARCAS = [
  // 🚨 ORDEM IMPORTA: marcas ESPECÍFICAS primeiro. "elotech" casava dentro de páginas do markasystem e
  //    Roteiro/AL saiu como Elotech — produto errado, coletor errado ([[pnigp-fornecedor-e-host-nao-erp]]).
  [/markasystem/i, "markasystem"],
  [/tcgestaopublica/i, "tcgestaopublica"],
  [/AcessoIndividual=Lnk|gridPessoal|ProcessaDados\(/i, "scpi"],
  [/atende\.net|ipmsistemas/i, "ipm"],
  [/e-publica|portaltp/i, "portaltp"],
  [/elotech|oxy\./i, "elotech"],
  [/betha|e-gov\.betha/i, "betha"],
  // 🚨 `govbr` na marca casava com **vlibras.gov.br** — o plugin de acessibilidade que quase todo site público
  //    brasileiro carrega. 29 municípios de AL saíram como GovBR/PRONIM e não são nada disso. A marca do
  //    produto é `cidade360`/`pronim`/`governancabrasil`, nunca a string "gov.br".
  [/cidade360|pronim|governancabrasil/i, "govbr"],
  [/agora\.app\.br/i, "agora"],
  [/elmartecnologia|publicsoft/i, "publicsoft"],
  [/municipioonline|genesis/i, "municipioonline"],
  [/memory|ilai/i, "memory"],
  [/siplan/i, "siplanweb"],
  [/agili/i, "agili"],
  [/aossoftware/i, "aos"],
  [/topdown/i, "topdown"],
  // produtos vistos em ALAGOAS (18/ago)
  [/kalana\.com\.br|portalcidadao\.net\/tributos/i, "tributário (não é folha)"],
  [/nfse\.srv\.br/i, "NFS-e (não é folha)"],
  [/\/acesso_lai|\/esic/i, "e-SIC (não é folha)"],
  [/sstransparencia/i, "sstransparencia"],
];

const alvos = (await q(`select cod_ibge, municipio, host, url from folha_host_candidato
  where uf = $1 and produto = 'desconhecido' order by municipio`, [UF])).rows;
console.log(`[identifica] ${alvos.length} hosts a classificar em ${UF}`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });

async function trata(a) {
  const page = await ctx.newPage();
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  try {
    // 🚨 o descobridor gravou o HOST puro ("topdown.servehttp.com:8080") como url — sem esquema o goto falha
    //    e 18 de 18 saíram "não abriu". Zero absoluto é defeito meu, não 18 sites fora do ar.
    const base = /^https?:\/\//i.test(a.url) ? a.url : `http://${a.url}`;
    let r = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    if (!r && !/^https?:\/\//i.test(a.url)) r = await page.goto(`https://${a.url}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    if (!r) { console.log(`   ✖ ${a.municipio.padEnd(24)} não abriu (${base.slice(0, 50)})`); return; }
    await dorme(4500);
    const html = await page.content().catch(() => "");
    const alvo = html + " " + urls.join(" ") + " " + page.url();
    const prod = (MARCAS.find(([re]) => re.test(alvo)) || [])[1];
    // sinal secundário: a página fala de servidores?
    const temPessoal = /servidor|folha de pagamento|remunera|quadro de pessoal/i.test(html);
    if (prod) {
      await q(`update folha_host_candidato set produto = $2, achado_via = 'conteúdo da página', em = now()
               where cod_ibge = $1`, [a.cod_ibge, prod]);
      console.log(`   ⭐ ${a.municipio.padEnd(24)} ${prod.padEnd(16)} ${a.host}${temPessoal ? "  (fala de servidores)" : ""}`);
    } else {
      const t = (await page.evaluate(() => document.title || "").catch(() => "")) || "";
      console.log(`   ? ${a.municipio.padEnd(24)} ${"(sem marca)".padEnd(16)} ${a.host} · "${t.slice(0, 40)}"${temPessoal ? " (fala de servidores)" : ""}`);
    }
  } catch (e) { console.log(`   ✖ ${a.municipio.padEnd(24)} ${String(e.message).slice(0, 50)}`); }
  finally { await page.close().catch(() => {}); }
}

for (let i = 0; i < alvos.length; i += CONC) await Promise.all(alvos.slice(i, i + CONC).map(trata));
await browser.close();
console.table((await q(`select produto, count(*)::int municipios from folha_host_candidato
  where uf = $1 group by 1 order by 2 desc`, [UF])).rows);
await db.end();
