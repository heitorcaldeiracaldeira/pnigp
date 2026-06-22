// Raspa a tabela oficial código→nome do dropdown p_programa do SIMAD (FNDE), para decodificar/agrupar os repasses.
// node scripts/scrape_simad_programas.mjs
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://www.fnde.gov.br/pls/simad";

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, keepAlive: true });
  await db.query(`CREATE TABLE IF NOT EXISTS fnde_programa_ref (codigo TEXT PRIMARY KEY, nome TEXT)`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/internet_fnde.LIBERACOES_01_PC?p_uf=SC&p_municipio=420540`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // extrai TODOS os selects (procura o de programa) + todas as options
  const selects = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("select")).map((s) => ({
      name: s.name || s.id || "",
      options: Array.from(s.options).map((o) => ({ v: o.value, t: o.text.trim() })),
    }));
  });
  console.log("selects no form:", selects.map((s) => `${s.name}(${s.options.length})`).join(", "));
  const prog = selects.find((s) => /programa/i.test(s.name)) || selects.find((s) => s.options.some((o) => /PNAE|ALIMENT|CAMINHO|PDDE/i.test(o.t)));
  if (!prog) { console.log("⚠️ select de programa não encontrado. Dump das options de cada select:"); selects.forEach((s) => console.log(s.name, "→", s.options.slice(0, 8).map((o) => `${o.v}=${o.t}`).join(" | "))); await browser.close(); await db.end(); return; }
  let n = 0;
  for (const o of prog.options) {
    if (!o.v || !o.t || /selecione|todos|^\s*$/i.test(o.t)) continue;
    await db.query(`INSERT INTO fnde_programa_ref (codigo,nome) VALUES ($1,$2) ON CONFLICT (codigo) DO UPDATE SET nome=EXCLUDED.nome`, [String(o.v).trim(), o.t]);
    n++;
  }
  console.log(`\n✓ ${n} programas gravados em fnde_programa_ref. Amostra:`);
  prog.options.slice(0, 30).forEach((o) => console.log(`  ${o.v}  =  ${o.t}`));
  await browser.close(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
