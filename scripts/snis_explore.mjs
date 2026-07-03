// EXPLORAÇÃO do SNIS desagregado (água/esgoto) — captura como as opções carregam + os códigos.
// node scripts/snis_explore.mjs
import { chromium } from "playwright";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (pnigp-i10; institutoi10)" });
  const page = await ctx.newPage();
  const xhr = [];
  page.on("response", (r) => { const u = r.url(); if (/desagregado|relatorio|ajax|lista|combo|select/i.test(u) && !/\.(js|css|png|gif|jpg)/i.test(u)) xhr.push(`${r.status()} ${r.request().method()} ${u.replace("https://app4.cidades.gov.br/serieHistorica", "")}`); });
  page.on("request", (req) => { if (/getSelectOpt/i.test(req.url())) console.log("getSelectOpt REQ body:", (req.postData() || "").slice(0, 200)); });
  page.on("request", (req) => { if (/RelDesagregado/i.test(req.url())) console.log(">>> RelDesagregado REQ [", req.method(), "]:", (req.postData() || req.url()).slice(0, 500)); });
  page.on("dialog", async (d) => { console.log("### ALERT:", d.message()); await d.accept().catch(() => {}); });
  page.on("response", async (r) => { if (/getSelectOpt/i.test(r.url())) { try { const j = JSON.parse(await r.text()); delete j.debug; const el = r.request().postData()?.match(/element=([^&]+)/)?.[1]; console.log(`getSelectOpt[${el}] keys:`, Object.keys(j).join(","), "| amostra:", JSON.stringify(j).slice(0, 350)); } catch (e) { console.log("parse getSelectOpt err", e.message); } } });
  page.on("response", async (r) => { if (/RelDesagregado/i.test(r.url())) { try { console.log("== RelDesagregado RESP:", r.status(), (await r.text()).slice(0, 700)); } catch {} } });

  await page.goto("https://app4.cidades.gov.br/serieHistorica/aguaEsgoto/index", { waitUntil: "networkidle", timeout: 60000 });
  console.log("1) aguaEsgoto carregado");
  await page.click('a[link="/serieHistorica/desagregado/index"]').catch((e) => console.log("click desagregado falhou:", e.message));
  await sleep(4000);
  await page.waitForSelector("#ano_ref", { timeout: 20000 }).catch(() => console.log("ano_ref não apareceu"));
  console.log("2) form desagregado carregado");
  const cfg = await page.evaluate(() => { try { const r = window.objGlobal?.relatorio; return { nome: r?.nome, strMainCmp: r?.strMainCmp, strMainCmpName: r?.strMainCmpName, arrForms: r?.arrForms2Serialize, arrCmp: r?.arrCmpFiltros }; } catch (e) { return "err " + e.message; } });
  console.log("CONFIG relatorio:", JSON.stringify(cfg));

  // tenta expandir grupos colapsáveis (vários frameworks: .panel-heading, a[data-toggle], legend clicável)
  const toggles = await page.$$eval("a[data-toggle], .panel-heading, .accordion-toggle, legend, .ui-accordion-header", (els) => els.map((e, i) => ({ i, t: (e.textContent || "").trim().slice(0, 30), tag: e.tagName, cls: e.className.slice(0, 25) })));
  console.log("toggles:", JSON.stringify(toggles.slice(0, 12)));

  // clica os multiselects p/ abrir (dispara lazy load) e tenta os toggles
  for (const sel of ["#ano_ref", "#sgl_est"]) {
    const btn = await page.$(`button[id*="${sel.slice(1)}"], .ui-multiselect`);
    if (btn) { await btn.click().catch(() => {}); await sleep(1500); }
  }
  await sleep(3000);

  const dump = await page.evaluate(async () => {
    const cid = "1" + Date.now() + "-" + Math.floor(Math.random() * 9999);
    const get = async (element) => {
      const r = await fetch("/serieHistorica/Desagregado/getSelectOpt", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" }, body: `ajax=1&action=&element=${element}&connID=${cid}` });
      try { const j = await r.json(); return j.arrSelect?.[element] || j.arrSelect || j; } catch { return "parse-fail"; }
    };
    const out = {};
    for (const el of ["sgl_est", "cod_fam_info", "cod_nat", "cod_abr", "cod_srv"]) out[el] = await get(el);
    return out;
  });
  for (const k of Object.keys(dump)) console.log(`OPÇÕES[${k}]:`, JSON.stringify(dump[k]).slice(0, 400));

  // DIRIGE A UI clicando os CHECKBOXES reais do widget multiselect (dispara handlers/cascata do app)
  const pick = (id, labels) => page.evaluate(async ({ id, labels }) => {
    const $ = window.jQuery; if (!$ || !$(id).data) return -1;
    try { $(id).multiselect("open"); } catch {}
    // espera as opções carregarem (lazy via getSelectOpt no open)
    let w = null;
    for (let i = 0; i < 40; i++) { w = $(id).multiselect("widget")[0]; if (w && w.querySelectorAll("label").length > 0) break; await new Promise((r) => setTimeout(r, 300)); }
    if (!w) return -2;
    let n = 0;
    w.querySelectorAll("label").forEach((lab) => { const t = lab.textContent.trim(); if (labels.some((l) => l && (t === l || t.includes(l)))) { const cb = lab.querySelector('input[type=checkbox]'); if (cb && !cb.checked) { cb.click(); n++; } } });
    try { $(id).multiselect("close"); } catch {}
    return n;
  }, { id, labels });
  console.log("pick ano:", await pick("#ano_ref", ["2022"]));
  console.log("pick estado:", await pick("#sgl_est", ["Santa Catarina"]));
  // cod_mun cascateia de sgl_est; espera estabilizar (~295 municípios) antes de checkAll
  const checkAllField = (id, minOpts) => page.evaluate(async ({ id, minOpts }) => {
    const $ = window.jQuery; if (!$(id).length) return { err: "sem campo" };
    try { $(id).multiselect("open"); } catch {} // dispara a cascata lazy
    // espera as opções carregarem e estabilizarem
    let prev = -1, stable = 0;
    for (let i = 0; i < 80; i++) { const n = $(id)[0].options.length; if (n >= (minOpts || 1) && n === prev) { if (++stable >= 4) break; } else stable = 0; prev = n; await new Promise((r) => setTimeout(r, 400)); }
    // marca TODAS as options no native select e reconstrói o widget (refresh lê o estado nativo)
    [...$(id)[0].options].forEach((o) => (o.selected = true));
    try { $(id).multiselect("refresh"); } catch (e) { return { err: "refresh " + e.message }; }
    let getChecked = -1; try { getChecked = $(id).multiselect("getChecked").length; } catch {}
    try { $(id).multiselect("close"); } catch {}
    return { nativeOpts: $(id)[0].options.length, nativeSel: [...$(id)[0].options].filter((o) => o.selected).length, getChecked };
  }, { id, minOpts });
  console.log("pick srv:", await pick("#cod_srv", ["Água e Esgoto"]));
  console.log("pick familia:", await pick("#cod_fam_info", ["Indicadores operacionais - água", "Indicadores operacionais - esgotos"]));
  await sleep(5000); // cascata fk_glossario (carrega o native select)
  // usa a API multiselect('checkAll') — marca todos disparando os eventos que a validação exige
  const nInd = await page.evaluate(() => {
    const $ = window.jQuery;
    const nativeN = $("#fk_glossario")[0]?.options.length || 0;
    try { $("#fk_glossario").multiselect("refresh"); } catch (e) { return "refresh err " + e.message; }
    try { $("#fk_glossario").multiselect("checkAll"); } catch (e) { return "checkAll err " + e.message; }
    const sel = [...($("#fk_glossario")[0]?.options || [])].filter((o) => o.selected).length;
    return { nativeN, selecionados: sel };
  }).catch((e) => "err " + e.message);
  console.log("pick indicadores (checkAll):", JSON.stringify(nInd));
  // município POR ÚLTIMO (senão as cascatas seguintes resetam o widget)
  console.log("checkAll municípios (cod_mun):", JSON.stringify(await checkAllField("#cod_mun", 100)));
  const gc = await page.evaluate(() => { try { return window.jQuery("#cod_mun").multiselect("getChecked").length; } catch (e) { return "err"; } });
  console.log("cod_mun getChecked antes do clique:", gc);
  await sleep(1000);
  await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")).catch(() => {}); // 1º: Continuar (valida + getGridConfig)
  await sleep(5000);
  const lbl1 = await page.evaluate(() => document.querySelector("#bt_gerar")?.textContent.trim());
  console.log("botão após 1º clique:", lbl1);
  await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")).catch(() => {}); // 2º: Consultar (carrega dados)
  await sleep(8000);
  const after = await page.evaluate(() => {
    const $ = window.jQuery; const g = $("#grid");
    let colModel = [], records = 0, row1 = null;
    try { colModel = g.jqGrid("getGridParam", "colModel").map((c) => ({ name: c.name, label: c.label || c.name })); } catch {}
    try { records = g.jqGrid("getGridParam", "records"); } catch {}
    try { const ids = g.jqGrid("getDataIDs"); if (ids.length) row1 = g.jqGrid("getRowData", ids[0]); } catch {}
    return { records, nCols: colModel.length, colModel: colModel.slice(0, 40), row1 };
  });
  console.log("GRID records:", after.records, "| nCols:", after.nCols);
  console.log("COLUNAS:", JSON.stringify(after.colModel));
  console.log("ROW1:", JSON.stringify(after.row1));
  console.log("XHRs:", JSON.stringify([...new Set(xhr)].slice(0, 20), null, 1));
  await browser.close();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
