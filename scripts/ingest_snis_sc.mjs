// ETL — SNIS Água e Esgoto por município (desagregado por prestador), via app do Ministério das Cidades.
// Dirige o wizard Yii/jqGrid (app4.cidades.gov.br) e lê o grid completo. State-agnostic: UF/ANO por env.
// UF=SC ANO=2022 node scripts/ingest_snis_sc.mjs   (escala nacional: trocar UF)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg"; import { chromium } from "playwright";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "SC").toUpperCase();
const ANO = process.env.ANO || "2022";
const UF_NOME = { SC: "Santa Catarina", PR: "Paraná", RS: "Rio Grande do Sul", SP: "São Paulo", RJ: "Rio de Janeiro", MG: "Minas Gerais" }[UF] || UF;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const numf = (v) => { const s = String(v == null ? "" : v).trim().replace(/\./g, "").replace(",", "."); if (!s || s === "-") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
// indicadores-chave (mapeados); demais ficam no JSONB
const IND_LABEL = { in055: "Atendimento total de água (%)", in056: "Atendimento total de esgoto (%)", in023: "Atendimento urbano de água (%)", in024: "Atendimento urbano de esgoto (%)", in046: "Coleta de esgoto (%)", in047: "Tratamento de esgoto (%)", in049: "Perdas na distribuição de água (%)", in015: "Índice de coleta de esgoto (%)", in016: "Índice de tratamento de esgoto (%)" };

async function coletar() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (pnigp-i10; institutoi10)" })).newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto("https://app4.cidades.gov.br/serieHistorica/aguaEsgoto/index", { waitUntil: "networkidle", timeout: 60000 });
  await page.click('a[link="/serieHistorica/desagregado/index"]');
  await page.waitForSelector("#ano_ref", { state: "attached", timeout: 25000 }); await sleep(3500);

  const pick = (id, labels) => page.evaluate(async ({ id, labels }) => {
    const $ = window.jQuery; $(id).multiselect("open");
    let w = null; for (let i = 0; i < 40; i++) { w = $(id).multiselect("widget")[0]; if (w && w.querySelectorAll("label").length) break; await new Promise((r) => setTimeout(r, 300)); }
    let n = 0; if (w) w.querySelectorAll("label").forEach((lab) => { const t = lab.textContent.trim(); if (labels.some((l) => l && (t === l || t.includes(l)))) { const cb = lab.querySelector('input[type=checkbox]'); if (cb && !cb.checked) { cb.click(); n++; } } });
    $(id).multiselect("close"); return n;
  }, { id, labels });
  const selAllNative = (id) => page.evaluate(async ({ id }) => {
    const $ = window.jQuery; $(id).multiselect("open");
    // espera o getSelectOpt popular: para quando o nº de opções fica ESTÁVEL por ~3s (após ter carregado)
    let prev = -1, stable = 0; for (let i = 0; i < 60; i++) { const n = $(id)[0].options.length; if (n > 0 && n === prev) { if (++stable >= 8) break; } else stable = 0; prev = n; await new Promise((r) => setTimeout(r, 400)); }
    [...$(id)[0].options].forEach((o) => (o.selected = true)); $(id).multiselect("refresh");
    let gc = 0; try { gc = $(id).multiselect("getChecked").length; } catch {} $(id).multiselect("close");
    return { opts: $(id)[0].options.length, getChecked: gc };
  }, { id });

  await pick("#ano_ref", [ANO]);
  await pick("#sgl_est", [UF_NOME]);
  await selAllNative("#cod_srv"); // TODOS os tipos de serviço (água-só, esgoto-só, ambos) → todos os municípios
  await pick("#cod_fam_info", ["Indicadores operacionais - água", "Indicadores operacionais - esgotos"]);
  await sleep(5000);
  await page.evaluate(() => { const $ = window.jQuery; $("#fk_glossario").multiselect("refresh"); try { $("#fk_glossario").multiselect("checkAll"); } catch {} });
  const mun = await selAllNative("#cod_mun"); // município por ÚLTIMO (senão reseta)
  console.log(`  ${UF}/${ANO}: municípios selecionados=${mun.getChecked} (opts=${mun.opts})`);
  await sleep(1000);
  await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")); // 1º Continuar (cria o grid)
  await sleep(6000);
  await page.evaluate(() => window.jQuery("#bt_gerar").trigger("click")); // 2º Consultar (carrega dados)
  await sleep(9000);
  // pagina o grid inteiro (reloadGrid preserva o postData/search-id)
  const dados = await page.evaluate(async () => {
    const $ = window.jQuery; const g = $("#grid");
    const cols = g.jqGrid("getGridParam", "colModel").map((c) => c.name);
    const records = g.jqGrid("getGridParam", "records") || 0;
    const rowNum = g.jqGrid("getGridParam", "rowNum") || 15;
    const pages = Math.max(1, Math.ceil(records / rowNum));
    let rows = [];
    for (let p = 1; p <= pages; p++) {
      g.jqGrid("setGridParam", { page: p }).trigger("reloadGrid");
      await new Promise((r) => setTimeout(r, 1400));
      rows = rows.concat(g.jqGrid("getDataIDs").map((id) => g.jqGrid("getRowData", id)));
    }
    return { cols, records, rows };
  });
  console.log(`  grid records=${dados.records}, lidas=${dados.rows.length}`);
  await browser.close();
  return dados;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS snis_sc (
    cod_ibge TEXT, ano INT, cod_psv TEXT, prestador TEXT, sigla TEXT, abrangencia TEXT, natureza TEXT, servico TEXT,
    atend_agua NUMERIC, atend_esgoto NUMERIC, coleta_esgoto NUMERIC, trat_esgoto NUMERIC, perdas_agua NUMERIC,
    atend_agua_urb NUMERIC, atend_esgoto_urb NUMERIC, indicadores JSONB, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cod_ibge, ano, cod_psv) )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  // mapa cod_mun SNIS (6 díg) → cod_ibge (7 díg) de entes_sc
  const ent = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf=$1`, [UF])).rows;
  const map6 = new Map(ent.map((r) => [String(r.cod_ibge).slice(0, 6), r.cod_ibge]));

  const { cols, rows } = await coletar();
  console.log(`  grid: ${rows.length} linhas (município×prestador), ${cols.length} colunas`);
  let ok = 0, semMun = 0;
  for (const r of rows) {
    const cod = map6.get(String(r.cod_mun)); if (!cod) { semMun++; continue; }
    const ind = {}; for (const c of cols) if (/^in\d+$/.test(c)) { const v = numf(r[c]); if (v != null) ind[c] = v; }
    await q(`INSERT INTO snis_sc (cod_ibge,ano,cod_psv,prestador,sigla,abrangencia,natureza,servico,atend_agua,atend_esgoto,coleta_esgoto,trat_esgoto,perdas_agua,atend_agua_urb,atend_esgoto_urb,indicadores)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (cod_ibge,ano,cod_psv) DO UPDATE SET prestador=EXCLUDED.prestador,sigla=EXCLUDED.sigla,abrangencia=EXCLUDED.abrangencia,natureza=EXCLUDED.natureza,servico=EXCLUDED.servico,atend_agua=EXCLUDED.atend_agua,atend_esgoto=EXCLUDED.atend_esgoto,coleta_esgoto=EXCLUDED.coleta_esgoto,trat_esgoto=EXCLUDED.trat_esgoto,perdas_agua=EXCLUDED.perdas_agua,atend_agua_urb=EXCLUDED.atend_agua_urb,atend_esgoto_urb=EXCLUDED.atend_esgoto_urb,indicadores=EXCLUDED.indicadores,atualizado=now()`,
      [cod, Number(r.ano_ref) || Number(ANO), r.cod_psv, r.psv_nom, r.psv_sgl, r.nom_abr, r.nom_nat, r.nom_srv, numf(r.in055), numf(r.in056), numf(r.in046), numf(r.in047), numf(r.in049), numf(r.in023), numf(r.in024), JSON.stringify(ind)]);
    ok++;
  }
  const res = await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) munis, round(avg(atend_esgoto),1) esgoto_medio FROM snis_sc WHERE ano=$1`, [Number(ANO)]);
  console.log(`Concluído ${UF}/${ANO}: ${ok} gravadas (${semMun} sem município) · ${JSON.stringify(res.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
