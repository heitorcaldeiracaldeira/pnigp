// ETL — IBAMA Áreas Embargadas por município. Fonte: IBAMA (CSV direto, ~145MB). Complementa os autos de infração.
// Agrega por município: nº de embargos + área embargada (ha) + série por ano. Casa por NOME (SC). node scripts/ingest_ibama_embargos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const URL = "https://servicos.ibama.gov.br/ctf/publico/areasembargadas/arquivos/areas_embargadas.csv";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const nBR = (s) => { const x = Number(String(s || "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const cp = path.join(dir, "embargos.csv");
  if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e6) { console.log("baixando IBAMA embargos (~145MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "300", "-A", "Mozilla/5.0", "-o", cp, URL], { stdio: "ignore" }); }

  const rl = readline.createInterface({ input: fs.createReadStream(cp, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map();
  for await (const line of rl) {
    const c = line.split(";");
    if (!H) { H = c.map((h) => h.replace(/"/g, "").trim()); ix = { uf: H.indexOf("SIG_UF_TAD"), mun: H.indexOf("NOM_MUNICIPIO_TAD"), dt: H.indexOf("DAT_EMBARGO"), area: H.indexOf("QTD_AREA_EMBARGADA") }; continue; }
    if ((c[ix.uf] || "").replace(/"/g, "").trim() !== UF) continue;
    const cod = byName.get(norm((c[ix.mun] || "").replace(/"/g, ""))); if (!cod) continue;
    const ano = +(String(c[ix.dt] || "").match(/(19|20)\d{2}/)?.[0] || 0);
    if (!M.has(cod)) M.set(cod, { n: 0, area: 0, anos: new Map() });
    const m = M.get(cod); m.n++; m.area += nBR(c[ix.area]);
    if (ano >= 2000 && ano <= 2026) m.anos.set(ano, (m.anos.get(ano) || 0) + 1);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS ibama_embargos_sc (cod_ibge TEXT PRIMARY KEY, n_embargos INTEGER, area_ha NUMERIC, n_recentes INTEGER, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE ibama_embargos_sc`);
  for (const [cod, m] of M) {
    const serie = [...m.anos.entries()].sort((a, b) => a[0] - b[0]).map(([ano, n]) => ({ ano, valor: n }));
    const nRec = [...m.anos.entries()].filter(([y]) => y >= 2016).reduce((s, [, n]) => s + n, 0);
    await db.query(`INSERT INTO ibama_embargos_sc (cod_ibge,n_embargos,area_ha,n_recentes,serie,atualizado) VALUES ($1,$2,$3,$4,$5,now())`, [cod, m.n, Math.round(m.area), nRec, JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_embargos) n, round(sum(area_ha)) ha FROM ibama_embargos_sc`)).rows[0];
  console.log(`✔ ibama_embargos_sc: ${chk.m} municípios · ${Number(chk.n).toLocaleString("pt-BR")} embargos · ${Number(chk.ha).toLocaleString("pt-BR")} ha embargados`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
