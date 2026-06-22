// ETL — FNDE/SIMAD: FUNDOS de educação (municipal/estadual) — versão RÁPIDA.
// Por município: sonda 2 anos recentes p/ achar CNPJs de FUNDO/MUNICÍPIO (exclui escolas/APPs). Se achar, coleta a
// SÉRIE COMPLETA (2000-2026) só desses fundos. Complementa a prefeitura (tp=02). Grava em fnde_simad_sc. Resumível.
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANO_FIM = parseInt(process.env.ANO_FIM || "2026", 10);
const ANO_INI = parseInt(process.env.ANO_INI || "2000", 10);
const PROBE = (process.env.PROBE || "2024,2015").split(",").map((x) => x.trim());
const BASE = "https://www.fnde.gov.br/pls/simad";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const MES = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };
const dataISO = (s) => { const m = String(s || "").match(/(\d{2})\/([A-Z]{3})\/(\d{4})/i); return m ? `${m[3]}-${MES[m[2].toUpperCase()] || "01"}-${m[1]}` : null; };
const valorNum = (s) => { const n = parseFloat(String(s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
function PARSE() {
  const out = []; let ent = { cnpj: "", nome: "" };
  for (const tr of Array.from(document.querySelectorAll("tr"))) {
    const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim()); const j = tds.join(" ");
    const m = j.match(/Entidade\.+:\s*([\d.\/-]+)\s*-\s*(.+?)(?:\s{2,}|$)/);
    if (m) { ent = { cnpj: m[1].trim(), nome: m[2].trim() }; continue; }
    if (tds.length >= 8 && /^\d{2}\/[A-Za-z]{3}\/\d{4}$/.test(tds[0])) out.push({ data: tds[0], ob: tds[1], valor: tds[2], parcela: tds[3], programa: tds[4], banco: tds[5], agencia: tds[6], conta: tds[7], cnpj: ent.cnpj, nome: ent.nome });
  }
  return out;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS fnde_simad_sc (cod_ibge TEXT, ano INTEGER, data_pgto DATE, ob TEXT, valor NUMERIC, parcela TEXT, programa TEXT, cnpj_recebedor TEXT, nome_recebedor TEXT, banco TEXT, agencia TEXT, conta TEXT, PRIMARY KEY (cod_ibge, ano, ob, programa, parcela, cnpj_recebedor))`);
  await db.query(`CREATE TABLE IF NOT EXISTS fnde_fundos_check (cod_ibge TEXT PRIMARY KEY, n_fundos INTEGER, n_lib INTEGER)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ${process.env.MUN ? "AND cod_ibge=$1" : ""} ORDER BY cod_ibge`, process.env.MUN ? [process.env.MUN] : [])).rows
    .map((e) => ({ ibge7: e.cod_ibge, ibge6: String(e.cod_ibge).slice(0, 6) }));
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM fnde_fundos_check`)).rows.map((r) => r.cod_ibge));

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" })).newPage();
  const nav = (fn) => Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}), fn()]);
  const buscarFundoCnpjs = async (mun, ano) => {
    await page.goto(`${BASE}/internet_fnde.LIBERACOES_01_PC?p_uf=${UF}&p_municipio=${mun}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(({ ano, mun }) => { const s = (n, v) => { const el = document.querySelector(`[name="${n}"]`); if (el) el.value = v; }; s("p_ano", String(ano)); s("p_municipio", mun); s("p_tp_entidade", ""); s("p_programa", ""); s("p_cgc", ""); s("p_verifica", "sigef"); }, { ano, mun });
    await nav(() => page.evaluate(() => window.submete && window.submete()));
    await sleep(200);
    return page.evaluate(() => { const map = new Map(); for (const tr of Array.from(document.querySelectorAll("tr"))) { const tds = Array.from(tr.querySelectorAll("td")).map((t) => t.innerText.trim()); const ci = tds.findIndex((t) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t)); if (ci >= 0 && tds[ci + 1]) { const nome = tds[ci + 1]; if (/FUNDO|MUNICIPIO DE|FUNDEB|SECRETARIA (MUNICIPAL|DE EDUCA|DE ESTADO)/i.test(nome) && !/A\.?\s?P\.?\s?P|ESCOLA|ASSOCIA|CAIXA ESCOLAR|COLEGIO|CENTRO EDUC|CRECHE|E\.?E\.?B/i.test(nome)) map.set(tds[ci].replace(/\D/g, ""), nome); } } return [...map.keys()]; });
  };
  let proc = 0, totFundos = 0, totLib = 0;
  for (const e of entes) {
    if (feitos.has(e.ibge7)) continue;
    let fundos = new Set();
    try { for (const ano of PROBE) { (await buscarFundoCnpjs(e.ibge6, ano)).forEach((c) => fundos.add(c)); } } catch {}
    let nLib = 0;
    for (const cnpj of fundos) {
      for (let ano = ANO_FIM; ano >= ANO_INI; ano--) {
        try {
          await page.goto(`${BASE}/internet_fnde.LIBERACOES_01_PC?p_uf=${UF}&p_municipio=${e.ibge6}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.evaluate(({ ano, mun }) => { const s = (n, v) => { const el = document.querySelector(`[name="${n}"]`); if (el) el.value = v; }; s("p_ano", String(ano)); s("p_municipio", mun); s("p_tp_entidade", ""); s("p_programa", ""); s("p_cgc", ""); s("p_verifica", "sigef"); }, { ano, mun: e.ibge6 });
          await nav(() => page.evaluate(() => window.submete && window.submete()));
          await sleep(150);
          await nav(() => page.evaluate(({ ano, uf, mun, cnpj }) => window.enviarFormulario && window.enviarFormulario(String(ano), "", uf, mun, "", cnpj), { ano, uf: UF, mun: e.ibge6, cnpj }));
          await sleep(150);
          const linhas = await page.evaluate(PARSE);
          for (const l of linhas) {
            await q(`INSERT INTO fnde_simad_sc (cod_ibge,ano,data_pgto,ob,valor,parcela,programa,cnpj_recebedor,nome_recebedor,banco,agencia,conta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (cod_ibge,ano,ob,programa,parcela,cnpj_recebedor) DO UPDATE SET valor=EXCLUDED.valor`,
              [e.ibge7, ano, dataISO(l.data), l.ob, valorNum(l.valor), l.parcela, l.programa, (l.cnpj || "").replace(/\D/g, ""), l.nome, l.banco, l.agencia, l.conta]);
            nLib++; totLib++;
          }
        } catch {}
      }
    }
    await q(`INSERT INTO fnde_fundos_check (cod_ibge,n_fundos,n_lib) VALUES ($1,$2,$3) ON CONFLICT (cod_ibge) DO UPDATE SET n_fundos=EXCLUDED.n_fundos, n_lib=EXCLUDED.n_lib`, [e.ibge7, fundos.size, nLib]);
    totFundos += fundos.size; proc++;
    if (proc % 20 === 0 || fundos.size) console.log(`  ${proc}/${entes.length} · ${e.ibge7}: ${fundos.size} fundo(s), ${nLib} lib · acum ${totFundos} fundos / ${totLib} lib`);
  }
  await browser.close();
  console.log(`FUNDOS concluído: ${totFundos} fundos, ${totLib} liberações`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
