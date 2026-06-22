// ETL — FNDE/SIMAD do ESTADO (SC): recursos federais da educação ao Governo do Estado / Secretaria de Estado da
// Educação / Fundo Estadual. As entidades estaduais ficam na capital → consulta Florianópolis (420540), filtra as
// de esfera ESTADUAL e grava sob cod_ibge='42'. Série completa. Resumível (fnde_estado_check por ano).
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO_FIM = parseInt(process.env.ANO_FIM || "2026", 10), ANO_INI = parseInt(process.env.ANO_INI || "2000", 10);
const CAP = "420540"; // Florianópolis (capital, onde ficam as entidades estaduais)
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
  const db = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS fnde_estado_check (ano INTEGER PRIMARY KEY, n INTEGER)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const feitos = new Set((await db.query(`SELECT ano FROM fnde_estado_check`)).rows.map((r) => Number(r.ano)));
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" })).newPage();
  const nav = (fn) => Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}), fn()]);
  const ehEstadual = (nome) => /SECRETARIA DE ESTADO|GOVERNO DO ESTADO|ESTADO DE SANTA CATARINA|FUNDO ESTADUAL|SECRETARIA ESTADUAL/i.test(nome) && !/MUNIC|PREFEITURA|A\.?\s?P\.?\s?P|ESCOLA/i.test(nome);
  let tot = 0;
  for (let ano = ANO_FIM; ano >= ANO_INI; ano--) {
    if (feitos.has(ano)) continue;
    let n = 0;
    try {
      await page.goto(`${BASE}/internet_fnde.LIBERACOES_01_PC?p_uf=SC&p_municipio=${CAP}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.evaluate((a) => { const s = (n, v) => { const e = document.querySelector(`[name="${n}"]`); if (e) e.value = v; }; s("p_ano", String(a)); s("p_municipio", "420540"); s("p_tp_entidade", ""); s("p_programa", ""); s("p_verifica", "sigef"); }, ano);
      await nav(() => page.evaluate(() => window.submete && window.submete()));
      await sleep(250);
      const alvos = await page.evaluate(() => { const m = new Map(); for (const tr of Array.from(document.querySelectorAll("tr"))) { const tds = Array.from(tr.querySelectorAll("td")).map((t) => t.innerText.trim()); const ci = tds.findIndex((t) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t)); if (ci >= 0 && tds[ci + 1]) m.set(tds[ci].replace(/\D/g, ""), tds[ci + 1]); } return [...m.entries()]; });
      for (const [cnpj, nome] of alvos) {
        if (!ehEstadual(nome)) continue;
        await nav(() => page.evaluate(({ a, c }) => window.enviarFormulario && window.enviarFormulario(String(a), "", "SC", "420540", "", c), { a: ano, c: cnpj }));
        await sleep(150);
        for (const l of await page.evaluate(PARSE)) {
          await q(`INSERT INTO fnde_simad_sc (cod_ibge,ano,data_pgto,ob,valor,parcela,programa,cnpj_recebedor,nome_recebedor,banco,agencia,conta) VALUES ('42',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (cod_ibge,ano,ob,programa,parcela,cnpj_recebedor) DO UPDATE SET valor=EXCLUDED.valor`,
            [ano, dataISO(l.data), l.ob, valorNum(l.valor), l.parcela, l.programa, (l.cnpj || "").replace(/\D/g, ""), l.nome, l.banco, l.agencia, l.conta]);
          n++; tot++;
        }
        await nav(() => page.goBack()).catch(() => {});
      }
    } catch {}
    await q(`INSERT INTO fnde_estado_check (ano,n) VALUES ($1,$2) ON CONFLICT (ano) DO UPDATE SET n=EXCLUDED.n`, [ano, n]);
    console.log(`  ${ano}: ${n} liberações estaduais · acum ${tot}`);
  }
  await b.close();
  const r = await db.query(`SELECT count(*) n, round(coalesce(sum(valor),0)/1e6) mi FROM fnde_simad_sc WHERE cod_ibge='42'`);
  console.log(`ESTADO concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
