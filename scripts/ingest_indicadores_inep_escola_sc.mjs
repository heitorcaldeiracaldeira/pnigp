// ETL — Indicadores educacionais INEP POR ESCOLA (CO_ENTIDADE): AFD/TDI/ATU. Casa com escolas_sc (georreferenciado)
// → detalhe por escola no mapa + desigualdade INTRAMUNICIPAL. Fonte: download.inep.gov.br _ESCOLAS.
// node scripts/ingest_indicadores_inep_escola_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC"; const ANO = Number(process.env.ANO || 2025);
const BASE = `https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/${ANO}`;
const IND = {
  AFD: { ed_inf: "ED_INF_CAT_1", fun_ai: "FUN_AI_CAT_1", fun_af: "FUN_AF_CAT_1", medio: "MED_CAT_1" },
  TDI: { ed_inf: null, fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
  ATU: { ed_inf: "ED_INF_CAT_0", fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
};
const nv = (v) => { const s = String(v ?? "").replace(",", ".").trim(); if (!s || s === "--") return null; const x = Number(s); return Number.isFinite(x) ? x : null; };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const escolas = new Map((await db.query(`SELECT co_entidade, cod_ibge FROM escolas_sc`)).rows.map((e) => [String(e.co_entidade), e.cod_ibge]));
  console.log(`escolas SC de referência: ${escolas.size}`);
  await db.query(`CREATE TABLE IF NOT EXISTS indicadores_inep_escola_sc (co_entidade TEXT, cod_ibge TEXT, ano INTEGER, indicador TEXT, ed_inf NUMERIC, fun_ai NUMERIC, fun_af NUMERIC, medio NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (co_entidade, ano, indicador))`);

  for (const [ind, mapa] of Object.entries(IND)) {
    const zip = path.join(os.tmpdir(), `inepesc_${ind}.zip`);
    try { execFileSync("curl", ["-s", "-L", "--max-time", "200", "--retry", "5", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", zip, `${BASE}/${ind}_${ANO}_ESCOLAS.zip`], { stdio: "ignore" }); } catch { console.log(`  ${ind}: download falhou`); continue; }
    if (!fs.existsSync(zip) || fs.statSync(zip).size < 10000) { console.log(`  ${ind}: zip vazio`); continue; }
    execFileSync("unzip", ["-o", "-j", zip, "-d", os.tmpdir()], { stdio: "ignore" });
    const xlsx = path.join(os.tmpdir(), `${ind}_ESCOLAS_${ANO}.xlsx`);
    if (!fs.existsSync(xlsx)) { console.log(`  ${ind}: xlsx não encontrado`); continue; }
    const wb = XLSX.readFile(xlsx); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.includes("CO_ENTIDADE")); const H = rows[hi];
    const ix = (n) => (n ? H.indexOf(n) : -1);
    const iUF = H.indexOf("SG_UF"), iEnt = H.indexOf("CO_ENTIDADE");
    const cols = { ed_inf: ix(mapa.ed_inf), fun_ai: ix(mapa.fun_ai), fun_af: ix(mapa.fun_af), medio: ix(mapa.medio) };
    let n = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (r[iUF] !== UF) continue;
      const ent = String(r[iEnt]).replace(/\D/g, ""); const cod = escolas.get(ent); if (!cod) continue; // só escolas que já temos (georref.)
      await db.query(`INSERT INTO indicadores_inep_escola_sc (co_entidade,cod_ibge,ano,indicador,ed_inf,fun_ai,fun_af,medio,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
        ON CONFLICT (co_entidade,ano,indicador) DO UPDATE SET cod_ibge=EXCLUDED.cod_ibge,ed_inf=EXCLUDED.ed_inf,fun_ai=EXCLUDED.fun_ai,fun_af=EXCLUDED.fun_af,medio=EXCLUDED.medio,atualizado=now()`,
        [ent, cod, ANO, ind, cols.ed_inf >= 0 ? nv(r[cols.ed_inf]) : null, nv(r[cols.fun_ai]), nv(r[cols.fun_af]), nv(r[cols.medio])]);
      n++;
    }
    console.log(`  ✔ ${ind}: ${n} escolas casadas`);
  }
  const chk = (await db.query(`SELECT indicador, count(*) n, count(distinct cod_ibge) munis FROM indicadores_inep_escola_sc WHERE ano=$1 GROUP BY indicador`, [ANO])).rows;
  chk.forEach((r) => console.log(`✔ ${r.indicador}: ${r.n} escolas em ${r.munis} municípios`));
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
