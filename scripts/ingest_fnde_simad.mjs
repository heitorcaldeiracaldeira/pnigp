// ETL — FNDE/SIMAD liberações por município (educação). Browser-only (WAF F5 bloqueia curl) → Playwright headless.
// Fluxo: form (tp vazio) → LISTA DE ENTIDADES → enviarFormulario(cnpj) por entidade (prefeitura + fundos municipal/
// estadual de educação + escolas) → tabela de liberações. Idempotente + resumível (fnde_simad_check por município/ano).
// Uso: node scripts/ingest_fnde_simad.mjs   (env: ANO_INI=2000 ANO_FIM=2026 UF=SC MUN=<ibge7 p/ testar>)
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANO_FIM = parseInt(process.env.ANO_FIM || "2026", 10);
const ANO_INI = parseInt(process.env.ANO_INI || "2000", 10);
const MODE = process.env.MODE || "pref"; // "pref" = prefeitura (tp=02 direto) · "fundos" = fundo municipal/estadual de educação
const BASE = "https://www.fnde.gov.br/pls/simad";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const MES = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };
const dataISO = (s) => { const m = String(s || "").match(/(\d{2})\/([A-Z]{3})\/(\d{4})/i); return m ? `${m[3]}-${MES[m[2].toUpperCase()] || "01"}-${m[1]}` : null; };
const valorNum = (s) => { const n = parseFloat(String(s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

// roda no browser: extrai linhas de liberação + entidade (uma tabela de resultado)
function PARSE() {
  const out = []; let ent = { cnpj: "", nome: "" };
  for (const tr of Array.from(document.querySelectorAll("tr"))) {
    const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim());
    const j = tds.join(" ");
    const m = j.match(/Entidade\.+:\s*([\d.\/-]+)\s*-\s*(.+?)(?:\s{2,}|$)/);
    if (m) { ent = { cnpj: m[1].trim(), nome: m[2].trim() }; continue; }
    if (tds.length >= 8 && /^\d{2}\/[A-Za-z]{3}\/\d{4}$/.test(tds[0]))
      out.push({ data: tds[0], ob: tds[1], valor: tds[2], parcela: tds[3], programa: tds[4], banco: tds[5], agencia: tds[6], conta: tds[7], cnpj: ent.cnpj, nome: ent.nome });
  }
  return out;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS fnde_simad_sc (cod_ibge TEXT, ano INTEGER, data_pgto DATE, ob TEXT, valor NUMERIC, parcela TEXT, programa TEXT, cnpj_recebedor TEXT, nome_recebedor TEXT, banco TEXT, agencia TEXT, conta TEXT, PRIMARY KEY (cod_ibge, ano, ob, programa, parcela, cnpj_recebedor))`);
  const CHECK = MODE === "fundos" ? "fnde_fundos_check" : "fnde_simad_check";
  await db.query(`CREATE TABLE IF NOT EXISTS ${CHECK} (cod_ibge TEXT, ano INTEGER, n INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };

  const entes = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' ${process.env.MUN ? "AND cod_ibge=$1" : ""} ORDER BY cod_ibge`, process.env.MUN ? [process.env.MUN] : [])).rows
    .map((e) => ({ ibge7: e.cod_ibge, ibge6: String(e.cod_ibge).slice(0, 6), nome: e.nome }));
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM ${CHECK}`)).rows.map((r) => r.k));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" });
  const page = await ctx.newPage();
  const nav = (fn) => Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}), fn()]);
  let totalGrav = 0, proc = 0;
  for (const e of entes) {
    for (let ano = ANO_FIM; ano >= ANO_INI; ano--) {
      if (feitos.has(`${e.ibge7}-${ano}`)) continue;
      const linhas = [];
      try {
        await page.goto(`${BASE}/internet_fnde.LIBERACOES_01_PC?p_uf=${UF}&p_municipio=${e.ibge6}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        const tp = MODE === "fundos" ? "" : "02"; // pref: tp=02 direto · fundos: lista todas as entidades
        await page.evaluate(({ ano, mun, tp }) => { const s = (n, v) => { const el = document.querySelector(`[name="${n}"]`); if (el) el.value = v; }; s("p_ano", String(ano)); s("p_municipio", mun); s("p_tp_entidade", tp); s("p_programa", ""); s("p_cgc", ""); s("p_verifica", "sigef"); }, { ano, mun: e.ibge6, tp });
        await nav(() => page.evaluate(() => window.submete && window.submete()));
        await sleep(250);
        if (MODE === "fundos") {
          // captura só entidades de governo/fundo (exclui escolas/APPs) → fundo municipal/estadual de educação
          const alvos = await page.evaluate(() => {
            const map = new Map();
            for (const tr of Array.from(document.querySelectorAll("tr"))) {
              const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim());
              const ci = tds.findIndex((t) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t));
              if (ci >= 0 && tds[ci + 1]) {
                const nome = tds[ci + 1];
                if (/FUNDO|MUNICIPIO DE|FUNDEB|SECRETARIA (MUNICIPAL|DE EDUCA|DE ESTADO)/i.test(nome) && !/A\.?\s?P\.?\s?P|ESCOLA|ASSOCIA|CAIXA ESCOLAR|COLEGIO|CENTRO EDUC|CRECHE|E\.?E\.?B/i.test(nome))
                  map.set(tds[ci].replace(/\D/g, ""), nome);
              }
            }
            return [...map.keys()];
          });
          for (const cnpj of alvos) {
            await nav(() => page.evaluate(({ ano, uf, mun, cnpj }) => window.enviarFormulario && window.enviarFormulario(String(ano), "", uf, mun, "", cnpj), { ano, uf: UF, mun: e.ibge6, cnpj }));
            await sleep(180);
            linhas.push(...await page.evaluate(PARSE));
            await nav(() => page.goBack()).catch(() => {});
          }
        } else {
          // prefeitura: tp=02 vai direto à tabela (mas se vier lista, segue cada uma)
          const cnpjs = await page.evaluate(() => { const set = new Set(); document.querySelectorAll("a").forEach((a) => { const m = (a.getAttribute("onclick") || "").match(/enviarFormulario\([^)]*'(\d{14})'\s*\)/); if (m) set.add(m[1]); }); return [...set]; });
          if (cnpjs.length) {
            for (const cnpj of cnpjs) {
              await nav(() => page.evaluate(({ ano, uf, mun, cnpj }) => window.enviarFormulario && window.enviarFormulario(String(ano), "", uf, mun, "", cnpj), { ano, uf: UF, mun: e.ibge6, cnpj }));
              await sleep(180);
              linhas.push(...await page.evaluate(PARSE));
              await nav(() => page.goBack()).catch(() => {});
            }
          } else {
            linhas.push(...await page.evaluate(PARSE));
          }
        }
      } catch { /* mantém o que coletou */ }
      for (const l of linhas) {
        await q(`INSERT INTO fnde_simad_sc (cod_ibge,ano,data_pgto,ob,valor,parcela,programa,cnpj_recebedor,nome_recebedor,banco,agencia,conta)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (cod_ibge,ano,ob,programa,parcela,cnpj_recebedor) DO UPDATE SET valor=EXCLUDED.valor, data_pgto=EXCLUDED.data_pgto`,
          [e.ibge7, ano, dataISO(l.data), l.ob, valorNum(l.valor), l.parcela, l.programa, (l.cnpj || "").replace(/\D/g, ""), l.nome, l.banco, l.agencia, l.conta]);
        totalGrav++;
      }
      await q(`INSERT INTO ${CHECK} (cod_ibge,ano,n) VALUES ($1,$2,$3) ON CONFLICT (cod_ibge,ano) DO UPDATE SET n=EXCLUDED.n`, [e.ibge7, ano, linhas.length]);
      await sleep(200);
    }
    proc++;
    console.log(`  ${proc}/${entes.length} ${e.nome} · acum ${totalGrav} liberações`);
  }
  await browser.close();
  const r = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n, round(coalesce(sum(valor),0)/1e6) mi, min(ano) a0, max(ano) a1 FROM fnde_simad_sc`);
  console.log(`FNDE/SIMAD concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
