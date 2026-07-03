// Captura as chamadas à API ARIA do Tesouro feitas pelo dashboard de Transferências Constitucionais.
// Objetivo: descobrir o endpoint de VALORES por município. node scripts/stn_capture.mjs
import { chromium } from "playwright";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (pnigp-i10; institutoi10)" })).newPage();
  const hits = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/apiapex\.tesouro\.gov\.br|transferencias_constitucionais|aria\/v1/i.test(u)) {
      hits.push(`${req.method()} ${u.replace("https://apiapex.tesouro.gov.br/aria/v1/transferencias_constitucionais", "…")}${req.postData() ? " BODY:" + req.postData().slice(0, 200) : ""}`);
    }
  });
  for (const url of [
    "https://www.tesourotransparente.gov.br/consultas/transferencias-constitucionais-realizadas",
  ]) {
    console.log("== abrindo:", url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("goto:", e.message));
    await sleep(8000);
    // procura iframes (dashboards embutidos) e segue o primeiro relevante
    const frames = page.frames().map((f) => f.url()).filter((u) => /apex|aria|apiapex|qlik|transfer/i.test(u));
    console.log("frames relevantes:", JSON.stringify(frames.slice(0, 5)));
  }
  await sleep(4000);
  console.log("=== CHAMADAS À API (", hits.length, ") ===");
  [...new Set(hits)].slice(0, 30).forEach((h) => console.log("  " + h));
  await browser.close();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
