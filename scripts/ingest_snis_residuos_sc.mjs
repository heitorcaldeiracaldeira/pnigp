// ETL — SNIS RESÍDUOS SÓLIDOS por município, via app do Ministério das Cidades (mesmo wizard Yii/jqGrid da água/esgoto,
// módulo "Agrupamento dinâmico de indicadores"). Entrada pelo link interno (URL direta dá 500 por falta de sessão).
// UF=SC ANO=2022 node scripts/ingest_snis_residuos_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg"; import { chromium } from "playwright";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "SC").toUpperCase();
const ANO = process.env.ANO || "2022";
const UF_NOME = { SC: "Santa Catarina", PR: "Paraná", RS: "Rio Grande do Sul", SP: "São Paulo", RJ: "Rio de Janeiro", MG: "Minas Gerais" }[UF] || UF;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const numf = (v) => { const s = String(v == null ? "" : v).trim().replace(/\./g, "").replace(",", "."); if (!s || s === "-") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

async function coletar() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (pnigp-i10; institutoi10)" })).newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto("https://app4.cidades.gov.br/serieHistorica/residuosSolidos/index", { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => { const a = document.querySelector('a[link="/serieHistorica/agrupamentoRs/index"]'); if (a) a.click(); });
  await page.waitForSelector("#ano_ref", { state: "attached", timeout: 25000 }); await sleep(4000);

  const pick = (id, labels) => page.evaluate(async ({ id, labels }) => {
    const $ = window.jQuery; $(id).multiselect("open");
    let w = null; for (let i = 0; i < 40; i++) { w = $(id).multiselect("widget")[0]; if (w && w.querySelectorAll("label").length) break; await new Promise((r) => setTimeout(r, 300)); }
    let n = 0; if (w) w.querySelectorAll("label").forEach((lab) => { const t = lab.textContent.trim(); if (labels.some((l) => l && (t === l || t.includes(l)))) { const cb = lab.querySelector('input[type=checkbox]'); if (cb && !cb.checked) { cb.click(); n++; } } });
    $(id).multiselect("close"); return n;
  }, { id, labels });
  const selAllNative = (id) => page.evaluate(async ({ id }) => {
    const $ = window.jQuery; if (!$(id).length) return { opts: -1, getChecked: 0 }; $(id).multiselect("open");
    let prev = -1, stable = 0; for (let i = 0; i < 60; i++) { const n = $(id)[0].options.length; if (n > 0 && n === prev) { if (++stable >= 8) break; } else stable = 0; prev = n; await new Promise((r) => setTimeout(r, 400)); }
    [...$(id)[0].options].forEach((o) => (o.selected = true)); $(id).multiselect("refresh");
    let gc = 0; try { gc = $(id).multiselect("getChecked").length; } catch {} $(id).multiselect("close");
    return { opts: $(id)[0].options.length, getChecked: gc };
  }, { id });

  await pick("#ano_ref", [ANO]);
  await pick("#sgl_est", [UF_NOME]);
  await selAllNative("#cod_fam_info"); // TODAS as famílias de indicadores de resíduos
  await sleep(5000);
  await page.evaluate(() => { const $ = window.jQuery; try { $("#fk_glossario").multiselect("refresh"); $("#fk_glossario").multiselect("checkAll"); } catch {} });
  await sleep(2000);
  const psv = await selAllNative("#cod_psv"); // PRESTADOR = componente principal do agrupamento → selecionar por ÚLTIMO
  console.log(`  ${UF}/${ANO}: cod_psv (principal) selecionados=${psv.getChecked} (opts=${psv.opts})`);
  await sleep(1000);
  // 1º "Continuar" → surge o passo de COLUNAS (frm_colunas) — exclusivo do agrupamento de resíduos
  await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")); await sleep(7000);
  // selecionar TODAS as colunas (frm_colunas → fk_glossario = os indicadores de resíduos)
  await page.evaluate(() => { const $ = window.jQuery; const el = $("select#fk_glossario").filter(function () { return $(this).closest("#frm_colunas").length; }); if (el.length) { [...el[0].options].forEach((o) => (o.selected = true)); try { el.multiselect("refresh"); } catch {} } });
  await sleep(2000);
  // 2º "Consultar" → grid. RETRY: o POST agrupamentoRs/getGridConfig do SNIS dá 500 (Zend_Http_Client_Adapter_Exception
  // = backend de dados de resíduos fora do ar). Quando o servidor voltar (200), o grid é criado e paginamos.
  const lerGrid = () => page.evaluate(async () => {
    const $ = window.jQuery; const g = $("#grid");
    if (!g.length || !g[0].grid) return { cols: [], records: 0, rows: [] };
    const cols = g.jqGrid("getGridParam", "colModel").map((c) => c.name);
    const records = g.jqGrid("getGridParam", "records") || 0;
    const rowNum = g.jqGrid("getGridParam", "rowNum") || 15;
    const pages = Math.max(1, Math.ceil(records / rowNum));
    let rows = [];
    for (let p = 1; p <= pages; p++) { g.jqGrid("setGridParam", { page: p }).trigger("reloadGrid"); await new Promise((r) => setTimeout(r, 1400)); rows = rows.concat(g.jqGrid("getDataIDs").map((id) => g.jqGrid("getRowData", id))); }
    return { cols, records, rows };
  });
  let dados = { cols: [], records: 0, rows: [] };
  for (let t = 0; t < 5; t++) {
    await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")); await sleep(10000);
    dados = await lerGrid(); if (dados.records > 0) break;
    console.log(`  tentativa ${t + 1}/5: grid vazio (getGridConfig do SNIS provavelmente 500); retry…`);
  }
  console.log(`  grid records=${dados.records}, lidas=${dados.rows.length}, colunas=${dados.cols.length}`);
  if (dados.cols.length) console.log("  colunas:", dados.cols.filter((c) => !/^in\d+$/.test(c)).join(","), "| indicadores in*:", dados.cols.filter((c) => /^in\d+$/.test(c)).length);
  await browser.close();
  return dados;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS snis_residuos_sc (
    cod_ibge TEXT, ano INT, cod_psv TEXT, prestador TEXT, sigla TEXT, abrangencia TEXT, natureza TEXT,
    indicadores JSONB, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano, cod_psv) )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const ent = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf=$1`, [UF])).rows;
  const map6 = new Map(ent.map((r) => [String(r.cod_ibge).slice(0, 6), r.cod_ibge]));

  const { cols, rows } = await coletar();
  if (!rows.length) { console.log("Nenhuma linha — verificar o wizard/colunas."); await db.end(); return; }
  // descobre a coluna de código de município (cod_mun) e de prestador
  const codCol = cols.find((c) => /^cod_mun$/i.test(c)) || cols.find((c) => /cod.*mun/i.test(c));
  let ok = 0, semMun = 0;
  for (const r of rows) {
    const raw = String(r[codCol] || "").replace(/\D/g, "").slice(0, 6);
    const cod = map6.get(raw); if (!cod) { semMun++; continue; }
    const ind = {}; for (const c of cols) if (/^in\d+$/.test(c)) { const v = numf(r[c]); if (v != null) ind[c] = v; }
    await q(`INSERT INTO snis_residuos_sc (cod_ibge,ano,cod_psv,prestador,sigla,abrangencia,natureza,indicadores)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (cod_ibge,ano,cod_psv) DO UPDATE SET prestador=EXCLUDED.prestador,sigla=EXCLUDED.sigla,abrangencia=EXCLUDED.abrangencia,natureza=EXCLUDED.natureza,indicadores=EXCLUDED.indicadores,atualizado=now()`,
      [cod, Number(r.ano_ref) || Number(ANO), r.cod_psv || r.cod_mun || "0", r.psv_nom || r.mun_nom || "", r.psv_sgl || "", r.nom_abr || "", r.nom_nat || "", JSON.stringify(ind)]);
    ok++;
  }
  const res = await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) munis FROM snis_residuos_sc WHERE ano=$1`, [Number(ANO)]);
  console.log(`Concluído ${UF}/${ANO}: ${ok} gravadas (${semMun} sem município) · ${JSON.stringify(res.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
