// 2ª passada da auditoria: as telas marcadas CAMPO_SEM_VALOR costumam ser FORMULÁRIO DE BUSCA — abrir e olhar
// não basta, é preciso DISPARAR a consulta antes de dizer que a capital não publica valor. Sem isso o veredito é
// falso negativo. (O caso de Fortaleza é diferente e já está provado por API: HTTP 500 em 7 competências.)
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

const alvos = (await q(`select cod_ibge, municipio, uf, coalesce(url_pessoal,url_transparencia) url
  from capital_portal where tem_salario in ('CAMPO_SEM_VALOR','SEM_VALOR') order by municipio`)).rows;
console.log(`[auditoria 2] ${alvos.length} capitais a reavaliar com interação\n`);

const browser = await chromium.launch({ headless: true });
const resumo = new Map();
for (const a of alvos) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const erros = [];
  page.on("response", (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${r.url().slice(0, 60)}`); });
  let veredito = "?", evid = null;
  try {
    await page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(4000);
    // dispara a consulta: botão de pesquisa OU primeiro item de uma lista/tabela
    for (const rot of [/pesquisar|consultar|buscar|filtrar|ver dados|gerar/i]) {
      const el = page.locator("button, input[type=submit], input[type=button], a").filter({ hasText: rot }).first();
      if (await el.count()) { await el.click({ timeout: 8000 }).catch(() => {}); await dorme(6000); break; }
    }
    // se houver tabela, abre o 1º registro (a remuneração costuma estar na ficha)
    await page.evaluate(() => {
      const a1 = document.querySelector("table a, table button, .lista a");
      if (a1) a1.click();
    }).catch(() => {});
    await dorme(6000);
    const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    const valores = [...t.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => m[1]).filter((v) => !/^0+,00$/.test(v));
    if (valores.length >= 3) { veredito = "TEM_VALOR"; evid = `${valores.length} valores após consulta (ex.: R$ ${valores[0]})`; }
    else if (erros.length) { veredito = "QUEBRADO"; evid = `backend falhou: ${erros[0]}`; }
    else { veredito = "SEM_VALOR_CONFIRMADO"; evid = "após disparar a consulta, nenhum valor > 0"; }
  } catch (e) { veredito = "ERRO"; evid = String(e.message).slice(0, 60); }
  await q(`update capital_portal set tem_salario=$1, evidencia_salario=$2, em=now() where cod_ibge=$3`, [veredito, evid, a.cod_ibge]);
  resumo.set(veredito, (resumo.get(veredito) || 0) + 1);
  console.log(`  ${a.uf} ${a.municipio.padEnd(16)} ${veredito.padEnd(22)} ${String(evid).slice(0, 62)}`);
  await ctx.close();
}
await browser.close();
console.log("\nRESUMO:", [...resumo.entries()].map(([k, v]) => `${k}=${v}`).join(" · "));
await db.end();
