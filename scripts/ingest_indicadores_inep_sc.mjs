// ETL — Indicadores educacionais INEP por município (rede MUNICIPAL): AFD (formação docente adequada, CAT_1),
// TDI (distorção idade-série, CAT_0), ATU (alunos por turma, CAT_0). Por etapa. Fonte: download.inep.gov.br (xlsx).
// Sub-aba "Indicadores" da Educação. node scripts/ingest_indicadores_inep_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC"; const ANO = Number(process.env.ANO || 2025);
const BASE = `https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/${ANO}`;
// mapa etapa → coluna por indicador. AFD = CAT_1 (adequado). TDI/ATU = CAT_0.
const IND = {
  AFD: { ed_inf: "ED_INF_CAT_1", fun_ai: "FUN_AI_CAT_1", fun_af: "FUN_AF_CAT_1", medio: "MED_CAT_1" },
  DSU: { ed_inf: "ED_INF_CAT_0", fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" }, // % docentes com curso superior
  TDI: { ed_inf: null, fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
  ATU: { ed_inf: "ED_INF_CAT_0", fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
  APROVACAO: { arq: "tx_rend_municipios", ed_inf: null, fun_ai: "1_CAT_FUN_AI", fun_af: "1_CAT_FUN_AF", medio: "1_CAT_MED" }, // taxa de aprovação
  ABANDONO: { arq: "tx_rend_municipios", ed_inf: null, fun_ai: "3_CAT_FUN_AI", fun_af: "3_CAT_FUN_AF", medio: "3_CAT_MED" }, // taxa de abandono
};
const nv = (v) => { const s = String(v ?? "").replace(",", ".").trim(); if (!s || s === "--" || s === "") return null; const x = Number(s); return Number.isFinite(x) ? x : null; };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS indicadores_inep_sc (cod_ibge TEXT, ano INTEGER, indicador TEXT, ed_inf NUMERIC, fun_ai NUMERIC, fun_af NUMERIC, medio NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, indicador))`);

  for (const [ind, mapa] of Object.entries(IND)) {
    const arq = mapa.arq || `${ind}_${ANO}_MUNICIPIOS`;
    const url = mapa.arq ? `${BASE}/${mapa.arq}_${ANO}.zip` : `${BASE}/${ind}_${ANO}_MUNICIPIOS.zip`;
    const xlsx = path.join(os.tmpdir(), mapa.arq ? `${mapa.arq}_${ANO}.xlsx` : `${ind}_MUNICIPIOS_${ANO}.xlsx`);
    if (!fs.existsSync(xlsx)) { // baixa só se ainda não extraído (rendimento é 1 arquivo p/ APROVACAO + ABANDONO)
      const zip = path.join(os.tmpdir(), `inep_${arq}.zip`);
      try { execFileSync("curl", ["-s", "-L", "--max-time", "180", "--retry", "5", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", zip, url], { stdio: "ignore" }); } catch { console.log(`  ${ind}: download falhou`); continue; }
      if (!fs.existsSync(zip) || fs.statSync(zip).size < 10000) { console.log(`  ${ind}: zip vazio`); continue; }
      { const { extrai } = await import("./descompacta.mjs"); extrai(zip, os.tmpdir()); }  // unzip nao existe no PATH da tarefa agendada
    }
    if (!fs.existsSync(xlsx)) { console.log(`  ${ind}: xlsx não encontrado`); continue; }
    const rows = XLSX.utils.sheet_to_json(XLSX.readFile(xlsx).Sheets[XLSX.readFile(xlsx).SheetNames[0]], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.includes("CO_MUNICIPIO")); const H = rows[hi];
    const ix = (n) => (n ? H.indexOf(n) : -1);
    const iUF = H.indexOf("SG_UF"), iCod = H.indexOf("CO_MUNICIPIO"), iCat = H.indexOf("NO_CATEGORIA"), iDep = H.indexOf("NO_DEPENDENCIA");
    const cols = { ed_inf: ix(mapa.ed_inf), fun_ai: ix(mapa.fun_ai), fun_af: ix(mapa.fun_af), medio: ix(mapa.medio) };
    let n = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (r[iUF] !== UF) continue;
      if (!/municipal/i.test(String(r[iDep])) || !/total/i.test(String(r[iCat]))) continue; // rede municipal, localização total
      const cod = String(r[iCod]).replace(/\D/g, ""); if (cod.length !== 7) continue;
      await db.query(`INSERT INTO indicadores_inep_sc (cod_ibge,ano,indicador,ed_inf,fun_ai,fun_af,medio,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
        ON CONFLICT (cod_ibge,ano,indicador) DO UPDATE SET ed_inf=EXCLUDED.ed_inf,fun_ai=EXCLUDED.fun_ai,fun_af=EXCLUDED.fun_af,medio=EXCLUDED.medio,atualizado=now()`,
        [cod, ANO, ind, cols.ed_inf >= 0 ? nv(r[cols.ed_inf]) : null, nv(r[cols.fun_ai]), nv(r[cols.fun_af]), nv(r[cols.medio])]);
      n++;
    }
    console.log(`  ✔ ${ind}: ${n} municípios`);
  }
  const chk = (await db.query(`SELECT indicador, count(*) n FROM indicadores_inep_sc WHERE ano=$1 GROUP BY indicador`, [ANO])).rows;
  console.log(`✔ indicadores_inep_sc ${ANO}: ${chk.map((r) => r.indicador + "=" + r.n).join(" · ")}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
