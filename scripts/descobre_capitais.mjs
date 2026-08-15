// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_capitais.mjs — levanta o portal de transparência e a ROTA DE PESSOAL de cada capital.
//
// POR QUÊ: só 4 das 27 capitais têm folha na base, e todas parciais (Cuiabá com 54 de 54.290). Capital não usa ERP
// de prateleira — tem portal sob medida —, então nenhum coletor por bloco de fornecedor as alcança. Mas elas
// somam ~1 milhão de servidores: mais que todo o resto coletado. Aqui cada uma é tratada como caso próprio.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

const CAPITAIS = [
  ["1100205", "Porto Velho", "RO", "https://www.portovelho.ro.gov.br/"],
  ["1200401", "Rio Branco", "AC", "https://riobranco.ac.gov.br/"],
  ["1302603", "Manaus", "AM", "https://www.manaus.am.gov.br/"],
  ["1400100", "Boa Vista", "RR", "https://boavista.rr.gov.br/"],
  ["1501402", "Belém", "PA", "https://belem.pa.gov.br/"],
  ["1600303", "Macapá", "AP", "https://macapa.ap.gov.br/"],
  ["1721000", "Palmas", "TO", "https://www.palmas.to.gov.br/"],
  ["2111300", "São Luís", "MA", "https://www.saoluis.ma.gov.br/"],
  ["2211001", "Teresina", "PI", "https://pmt.pi.gov.br/"],
  ["2304400", "Fortaleza", "CE", "https://www.fortaleza.ce.gov.br/"],
  ["2408102", "Natal", "RN", "https://natal.rn.gov.br/"],
  ["2507507", "João Pessoa", "PB", "https://www.joaopessoa.pb.gov.br/"],
  ["2611606", "Recife", "PE", "https://www2.recife.pe.gov.br/"],
  ["2704302", "Maceió", "AL", "https://maceio.al.gov.br/"],
  ["2800308", "Aracaju", "SE", "https://www.aracaju.se.gov.br/"],
  ["2927408", "Salvador", "BA", "https://www.salvador.ba.gov.br/"],
  ["3106200", "Belo Horizonte", "MG", "https://prefeitura.pbh.gov.br/"],
  ["3205309", "Vitória", "ES", "https://www.vitoria.es.gov.br/"],
  ["3304557", "Rio de Janeiro", "RJ", "https://prefeitura.rio/"],
  ["3550308", "São Paulo", "SP", "https://capital.sp.gov.br/"],
  ["4106902", "Curitiba", "PR", "https://www.curitiba.pr.gov.br/"],
  ["4205407", "Florianópolis", "SC", "https://www.pmf.sc.gov.br/"],
  ["4314902", "Porto Alegre", "RS", "https://prefeitura.poa.br/"],
  ["5002704", "Campo Grande", "MS", "https://www.campogrande.ms.gov.br/"],
  ["5103403", "Cuiabá", "MT", "https://www.cuiaba.mt.gov.br/"],
  ["5208707", "Goiânia", "GO", "https://www.goiania.go.gov.br/"],
  ["5300108", "Brasília", "DF", "https://www.transparencia.df.gov.br/"],
];

await q(`create table if not exists capital_portal (
  cod_ibge text primary key, municipio text, uf text, site text,
  url_transparencia text, url_pessoal text, produto text, detalhe text, em timestamptz default now()
)`);

const RUIDO = /facebook|instagram|twitter|youtube|whatsapp|google|w3\.org|cdnjs|jsdelivr|radardatransparencia|atricon|planalto/i;
const browser = await chromium.launch({ headless: true });
let comPortal = 0, comPessoal = 0;

for (const [cod, nome, uf, site] of CAPITAIS) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  let urlTransp = null, urlPessoal = null, produto = null, detalhe = null;
  try {
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(3500);
    // 1) o link do portal da transparência
    urlTransp = await page.evaluate((ruido) => {
      const re = new RegExp(ruido, "i");
      const c = [...document.querySelectorAll("a")]
        .map((x) => ({ t: (x.innerText || x.title || "").replace(/\s+/g, " ").trim(), h: x.href || "" }))
        .filter((x) => /transpar[eê]ncia/i.test(x.t + " " + x.h) && x.h.startsWith("http") && !re.test(x.h));
      return (c[0] || {}).h || null;
    }, RUIDO.source);
    if (urlTransp) {
      comPortal++;
      await page.goto(urlTransp, { waitUntil: "domcontentloaded", timeout: 45000 });
      await dorme(4000);
      // 2) dentro do portal, a rota de pessoal/servidores/folha
      const achado = await page.evaluate(() => {
        const c = [...document.querySelectorAll("a")]
          .map((x) => ({ t: (x.innerText || x.title || "").replace(/\s+/g, " ").trim(), h: x.href || "" }))
          .filter((x) => /servidor|pessoal|folha de pagamento|remunera|quadro de pessoal/i.test(x.t + " " + x.h))
          .filter((x) => x.h.startsWith("http"));
        return c.length ? { t: c[0].t.slice(0, 40), h: c[0].h } : null;
      });
      if (achado) { urlPessoal = achado.h; detalhe = achado.t; comPessoal++; }
      // 3) assinatura de produto conhecido
      const html = await page.content();
      const ASSIN = [[/SCPI\s*9|ProcessaDados\(/i, "scpi"], [/portaltp/i, "portaltp"], [/betha/i, "betha"],
        [/pronimtb|cidade360/i, "govbr"], [/elotech|eloweb/i, "elotech"], [/megasoft/i, "megasoft"],
        [/equiplano/i, "equiplano"], [/atende\.net/i, "ipm"], [/memory/i, "memory"], [/primefaces|javax\.faces/i, "jsf"]];
      for (const [re, p] of ASSIN) if (re.test(html + urlTransp)) { produto = p; break; }
    }
  } catch (e) { detalhe = String(e.message).slice(0, 60); }
  await q(`insert into capital_portal (cod_ibge,municipio,uf,site,url_transparencia,url_pessoal,produto,detalhe,em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
    url_transparencia=excluded.url_transparencia, url_pessoal=excluded.url_pessoal, produto=excluded.produto,
    detalhe=excluded.detalhe, em=now()`, [cod, nome, uf, site, urlTransp, urlPessoal, produto, detalhe]);
  console.log(`${uf} ${nome.padEnd(16)} ${(produto || "-").padEnd(10)} ${(urlPessoal || urlTransp || detalhe || "?").slice(0, 78)}`);
  await ctx.close();
}
await browser.close();
console.log(`\n${comPortal}/27 com portal · ${comPessoal}/27 com rota de pessoal identificada`);
await db.end();
