// ETL — Equipamentos da Assistência Social (unidades CRAS/CREAS/Centro POP/Acolhimento…) por município.
// Fonte: CadSUAS (Cadastro Nacional do SUAS) — consulta pública. App JSF/stateful → Playwright headless
// (mesmo padrão do FNDE SIMAD). Lista cada unidade (nome, tipo, nº identificador, código CadSUAS).
// Idempotente/resumível: pula município que já tem unidades (use REFRESH=1 p/ recoletar).
//   node scripts/ingest_equipamentos_suas.mjs        (env: UF=SC  MUN=<ibge7 p/ testar>  REFRESH=1)
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const BASE = "https://aplicacoes.mds.gov.br/cadsuas/";
const SEARCH = "https://aplicacoes.mds.gov.br/cadsuas/visualizarConsultaExterna.html";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
// classifica o tipo da unidade a partir do nome (CadSUAS não traz coluna de tipo na lista)
const tipoDe = (nome) => {
  const n = String(nome || "").toUpperCase();
  if (/CREAS|REFERENCIA ESPECIALIZAD/.test(n)) return /REGIONAL/.test(n) ? "CREAS REGIONAL" : "CREAS";
  if (/\bCRAS\b|REFERENCIA DE ASSIST/.test(n)) return "CRAS";
  if (/CENTRO\s*POP|POPULACAO EM SITUACAO|PESSOA EM SITUACAO DE RUA/.test(n)) return "CENTRO POP";
  if (/ACOLHIMENTO|ABRIGO|CASA LAR|ACOLHEDOR|REPUBLICA|CASA DE PASSAGEM/.test(n)) return "UNIDADE DE ACOLHIMENTO";
  if (/CENTRO[ -]?DIA/.test(n)) return "CENTRO-DIA";
  if (/CONVIV/.test(n)) return "CENTRO DE CONVIVENCIA";
  if (/CADASTRO UNICO|CADUNICO|CAD\.?\s*UNICO|POSTO/.test(n)) return "POSTO CADASTRO UNICO";
  return "OUTRA";
};
const SEL_UF = "#visualizarConsultaExterna_consultaExternaHelper_endereco_municipio_uf_sigla";
const SEL_MUN = "#visualizarConsultaExterna_consultaExternaHelper_endereco_municipio_id";

// roda no browser: extrai as unidades da tabela de resultados (nome, nº identificador, código de detalhe)
function PARSE() {
  const tbls = Array.from(document.querySelectorAll("table"));
  let best = null, bn = 0;
  // a tabela de RESULTADOS é a que tem links de detalhe (codigo=) — não a maior por linhas
  for (const t of tbls) { const n = t.querySelectorAll('a[href*="codigo="]').length; if (n > bn) { bn = n; best = t; } }
  if (!best) return [];
  const out = [];
  for (const tr of Array.from(best.querySelectorAll("tr"))) {
    const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim().replace(/\s+/g, " "));
    if (tds.length < 4) continue;
    const link = tr.querySelector('a[href*="codigo="]');
    const cod = link ? (link.getAttribute("href").match(/codigo=(\d+)/) || [])[1] : null;
    // colunas FIXAS: Cnpj (vazio p/ unidade pública), Nome, Nº Identificador, UF, Município
    const cnpj = (tds[0] || "").replace(/\D/g, "") || null;
    const nome = tds[1], nrId = tds[2];
    if (!nome || nome.toLowerCase() === "nome" || !cod) continue;
    out.push({ nome, nrId: nrId || null, codigo: cod, cnpj });
  }
  return out;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS equipamentos_suas_sc (
    codigo_cadsuas TEXT PRIMARY KEY, cod_ibge TEXT, nome TEXT, tipo TEXT, nr_identificador TEXT, cnpj TEXT,
    uf TEXT, municipio TEXT, atualizado timestamptz DEFAULT now() )`);
  await db.query(`ALTER TABLE equipamentos_suas_sc ADD COLUMN IF NOT EXISTS cnpj TEXT`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  // grafia CadSUAS ≠ IBGE em alguns entes
  const ALIASES = { LUISALVES: "4210001" };
  const byName = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND uf=$1`, [UF])).rows.map((e) => [norm(e.nome), e.cod_ibge]));
  const jaTem = new Set((await db.query(`SELECT DISTINCT cod_ibge FROM equipamentos_suas_sc`)).rows.map((r) => r.cod_ibge));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SEL_UF);
  await page.selectOption(SEL_UF, UF);
  await page.waitForFunction((sel) => document.querySelector(sel) && document.querySelector(sel).options.length > 1, SEL_MUN, { timeout: 45000 });
  // mapa município(nome CadSUAS) → id do dropdown
  const muns = await page.$$eval(`${SEL_MUN} option`, (opts) => opts.map((o) => ({ id: o.value, nome: o.text.trim() })).filter((o) => o.id));
  const alvoMun = process.env.MUN || null; // ibge7 p/ testar 1 município

  let totMun = 0, totUni = 0, pulados = 0;
  for (const m of muns) {
    const cod = byName.get(norm(m.nome)) || ALIASES[norm(m.nome)];
    if (!cod) { console.log(`  [skip] sem cod_ibge: ${m.nome}`); continue; }
    if (alvoMun && cod !== alvoMun) continue;
    if (!process.env.REFRESH && !alvoMun && jaTem.has(cod)) { pulados++; continue; }
    let unidades = null;
    for (let tent = 0; tent < 4; tent++) {
      try {
        await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(SEL_UF);
        await page.selectOption(SEL_UF, UF);
        await page.waitForFunction((sel) => document.querySelector(sel) && document.querySelector(sel).options.length > 1, SEL_MUN);
        await page.selectOption(SEL_MUN, m.id);
        await Promise.all([page.waitForLoadState("domcontentloaded"), page.click('button:has-text("Pesquisar"), input[value="Pesquisar"]')]);
        // espera os RESULTADOS renderizarem (links de detalhe) — distingue "carregando" de "vazio de verdade"
        await page.waitForSelector('a[href*="codigo="]', { timeout: 12000 }).catch(() => {});
        const u = await page.evaluate(PARSE);
        if (u.length > 0) { unidades = u; break; } // sucesso
        unidades = u; // possivelmente 0 real — mas tenta de novo p/ descartar falha de carga
        await sleep(1500);
      } catch (e) { await sleep(2000 * (tent + 1)); }
    }
    if (unidades == null) { console.log(`  [falha] ${m.nome}`); continue; }
    for (const u of unidades) {
      await q(`INSERT INTO equipamentos_suas_sc (codigo_cadsuas,cod_ibge,nome,tipo,nr_identificador,cnpj,uf,municipio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (codigo_cadsuas) DO UPDATE SET cod_ibge=EXCLUDED.cod_ibge, nome=EXCLUDED.nome, tipo=EXCLUDED.tipo, nr_identificador=EXCLUDED.nr_identificador, cnpj=EXCLUDED.cnpj, atualizado=now()`,
        [u.codigo, cod, u.nome, tipoDe(u.nome), u.nrId, u.cnpj, UF, m.nome]);
    }
    totMun++; totUni += unidades.length;
    console.log(`  ${m.nome} (${cod}): ${unidades.length} unidades`);
    await sleep(300);
  }
  await browser.close();
  const resumo = await db.query(`SELECT tipo, count(*) n FROM equipamentos_suas_sc GROUP BY 1 ORDER BY 2 DESC`);
  console.log(`Equipamentos SUAS: ${totMun} municípios coletados (${pulados} já tinham) · ${totUni} unidades gravadas · por tipo: ${JSON.stringify(resumo.rows)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
