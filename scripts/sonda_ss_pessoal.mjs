// Mede se o portal S&S Informática entrega PESSOAL: abre "Pessoal Servidores" em N municípios do CE e
// varre competências. A prova é o dado aparecer, não o menu existir ([[pnigp-sonda-folha-prova-e-a-coleta]]).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const N = Number(process.env.N || 8);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const COMPS = (process.env.COMPS || "2026-07,2026-06,2025-12").split(",");

const alvos = (await q(`select entcod, municipio_nome from ss_catalogo
  where uf = 'CE' and tipo = 'prefeitura' and cod_ibge is not null order by random() limit ${N}`)).rows;
console.log(`[ss] sondando ${alvos.length} municípios do CE × ${COMPS.length} competências`);

const br = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const ctx = await br.newContext({ ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
let comDado = 0, semDado = 0, falhas = 0;
for (const a of alvos) {
  const page = await ctx.newPage();
  try {
    await page.goto(`http://sstransparenciamunicipal.net:8080/transparencia/pagamento.php?entcod=${a.entcod}`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(6500);
    await page.getByText("Pessoal Servidores", { exact: false }).first().click({ timeout: 20000 });
    await dorme(8000);
    let achou = null;
    for (const comp of COMPS) {
      await page.getByText("Nova busca", { exact: false }).first().click({ timeout: 12000 }).catch(() => {});
      await dorme(3000);
      await page.evaluate((v) => { const e = document.querySelector("#IWEDIT1");
        if (e) { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); } }, comp);
      await dorme(900);
      await page.evaluate(() => document.querySelector("#IWIMAGEBUTTON1")?.click());
      await dorme(8000);
      // 🚨 contar `table tr` da PÁGINA inclui menu e layout: a sonda anterior acusou "10 linhas" em municípios
      //    que mostravam "Nenhuma Informação Encontrada". Contar SÓ as linhas do grid IWDBGRID1 com conteúdo.
      const r = await page.evaluate(() => {
        const vazio = /Nenhuma Informa/i.test(document.body.innerText);
        const grid = document.querySelector("#IWDBGRID1") || document.querySelector("[id^=IWDBGRID]");
        const linhas = grid
          ? [...grid.querySelectorAll("tr")].filter((tr, i) => i > 0 && [...tr.cells].some((c) => c.innerText.trim())).length
          : 0;
        return { vazio, linhas };
      });
      if (!r.vazio && r.linhas > 0) { achou = `${comp}: ${r.linhas} linhas`; break; }
    }
    if (achou) { comDado++; console.log(`   ⭐ ${a.municipio_nome.padEnd(24)} ${achou}`); }
    else { semDado++; console.log(`   · ${a.municipio_nome.padEnd(24)} vazio em ${COMPS.join(", ")}`); }
  } catch (e) { falhas++; console.log(`   ✖ ${a.municipio_nome.padEnd(24)} ${String(e.message).slice(0, 45)}`); }
  finally { await page.close().catch(() => {}); }
}
await br.close();
console.log(`\n[ss] ${comDado} com dado · ${semDado} sem dado · ${falhas} falhas`);
console.log(comDado === 0
  ? "⛔ VEREDITO: o portal S&S tem a tela de Pessoal e NÃO entrega dado — não construir coletor."
  : "⭐ há municípios publicando: vale coletor.");
await db.end();
