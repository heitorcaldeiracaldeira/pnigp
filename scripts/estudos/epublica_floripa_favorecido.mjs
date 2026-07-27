import { chromium } from "playwright";
const TERMO = process.argv[2] || "SEPAT";
const CAMPO = process.argv[3] || "Favorecido";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
await page.goto("https://transparencia.e-publica.net/epublica-portal/#/florianopolis/portal/despesa/avancado/empenhosTable?entidade=2002", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(5000);

// 1) "Pesquisar em" -> Favorecido (select nativo ou dropdown custom)
try {
  const sel = page.locator("xpath=//*[contains(text(),'Pesquisar em')]/following::select[1]");
  if (await sel.count()) { await sel.selectOption({ label: CAMPO }); }
  else {
    const dd = page.locator("xpath=//*[contains(text(),'Pesquisar em')]/following::*[self::div or self::button or self::span][1]");
    await dd.first().click(); await page.waitForTimeout(600);
    await page.locator(`xpath=//*[contains(text(),'${CAMPO}')]`).last().click(); await page.waitForTimeout(400);
  }
  console.log("Pesquisar em setado p/", CAMPO);
} catch (e) { console.log("pesquisar-em:", e.message.slice(0, 60)); }

// 2) Critério de pesquisa = TERMO
try {
  const crit = page.locator("xpath=//*[contains(text(),'Critério de pesquisa')]/following::input[1]");
  await crit.fill(TERMO);
  console.log("Critério preenchido:", TERMO);
} catch (e) { console.log("criterio:", e.message.slice(0, 60)); }

// 3) Consultar
await page.getByRole("button", { name: /Consultar/i }).click().catch(async () => { await page.locator("button:has-text('Consultar')").click(); });
await page.waitForTimeout(4500);

// 4) lê os totais do topo + linhas
const tot = await page.evaluate(() => {
  const txt = document.body.innerText;
  const grab = (lbl) => { const m = txt.match(new RegExp(lbl + "\\s*R\\$\\s*([\\d.,]+)", "i")); return m ? m[1] : null; };
  return { empenhado: grab("Total Empenhado"), liquidado: grab("Total Liquidado"), retido: grab("Total Retido"), pago: grab("Total Pago") };
});
const linhas = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].map(r => [...r.querySelectorAll("td")].map(c => c.innerText.trim())).filter(a => a.length >= 8));
console.log(`\n=== RESULTADO filtro Favorecido~"${TERMO}" ===`);
console.log("TOTAIS →", JSON.stringify(tot));
console.log("linhas na 1a página:", linhas.length);
linhas.slice(0, 8).forEach(r => console.log(`  ${(r[0] || "").slice(0, 22)} · #${r[1]} · ${r[2]} · ${(r[4] || "").slice(0, 26)} · emp ${r[5]} · pago ${r[8]}`));
await browser.close();
