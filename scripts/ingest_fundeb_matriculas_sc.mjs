// ETL — Matrículas por SEGMENTO FUNDEB da REDE MUNICIPAL (INEP Censo, Tabela_Matricula) por município.
// Base do "Painel FUNDEB Retrato": segmentos ativos, tempo integral, educação especial. Rede municipal = escola dependencia=3.
// Grão do arquivo = escola (CO_ENTIDADE); casa via escolas_sc (dependencia + cod_ibge). Idempotente (UPSERT cod_ibge+ano).
// node scripts/ingest_fundeb_matriculas_sc.mjs   (ZIP já baixado em SCRATCH)
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = process.env.ANO || "2025";
// ⚠️ apontava para o scratchpad de uma sessão antiga (`.../ba9cc77b-.../censo2025.zip`), que já não existe:
// o arquivo tinha sido baixado à mão uma vez e o caminho ficou cravado. Agora vem da fonte compartilhada.
const ZIP = process.env.ZIP || (await import("./fonte_censo_escolar.mjs")).zipCensoEscolar().zip;
const ENTRY = `microdados_censo_escolar_${ANO}/dados/Tabela_Matricula_${ANO}.csv`;
const nn = (v) => { const x = Number(String(v || "").trim()); return Number.isFinite(x) ? x : 0; };
// segmentos FUNDEB → coluna Censo (agregado por escola). Integral separado onde o FUNDEB pondera diferente.
const SEG = { creche: "QT_MAT_INF_CRE", creche_int: "QT_MAT_INF_CRE_INT", pre: "QT_MAT_INF_PRE", pre_int: "QT_MAT_INF_PRE_INT",
  fund_ai: "QT_MAT_FUND_AI", fund_ai_int: "QT_MAT_FUND_AI_INT", fund_af: "QT_MAT_FUND_AF", fund_af_int: "QT_MAT_FUND_AF_INT",
  medio: "QT_MAT_MED", medio_int: "QT_MAT_MED_INT", prof: "QT_MAT_PROF", eja: "QT_MAT_EJA", especial: "QT_MAT_ESP",
  total: "QT_MAT_BAS", total_int: "QT_MAT_BAS_INT" };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  // CO_ENTIDADE -> {cod_ibge, dependencia} da rede municipal (dependencia=3)
  const ents = (await db.query(`SELECT co_entidade, cod_ibge, dependencia FROM escolas_sc`)).rows;
  const muni = new Map(ents.filter((e) => Number(e.dependencia) === 3).map((e) => [String(e.co_entidade), e.cod_ibge]));
  console.log(`escolas municipais SC: ${muni.size}`);

  console.log("extraindo Tabela_Matricula…");
  execFileSync("unzip", ["-o", "-j", ZIP, ENTRY, "-d", os.tmpdir()], { stdio: "ignore" });
  const src = path.join(os.tmpdir(), `Tabela_Matricula_${ANO}.csv`);
  const rl = readline.createInterface({ input: fs.createReadStream(src, { encoding: "latin1" }), crlfDelay: Infinity });
  let head = null, ix = {}; const M = new Map();
  const segKeys = Object.keys(SEG);
  for await (const line of rl) {
    if (!head) { head = line.split(";").map((h) => h.replace(/^"|"$/g, "").trim()); ix.ent = head.indexOf("CO_ENTIDADE"); for (const k of segKeys) ix[k] = head.indexOf(SEG[k]); continue; }
    const c = line.split(";"); if (c.length < head.length) continue;
    const cod = muni.get(String(c[ix.ent]).replace(/^"|"$/g, "").trim()); if (!cod) continue; // só rede municipal SC
    if (!M.has(cod)) { const o = {}; for (const k of segKeys) o[k] = 0; M.set(cod, o); }
    const m = M.get(cod); for (const k of segKeys) if (ix[k] >= 0) m[k] += nn(c[ix[k]]);
  }
  fs.unlinkSync(src);

  await db.query(`CREATE TABLE IF NOT EXISTS fundeb_matriculas_sc (
    cod_ibge TEXT, ano INTEGER, creche INTEGER, creche_int INTEGER, pre INTEGER, pre_int INTEGER,
    fund_ai INTEGER, fund_ai_int INTEGER, fund_af INTEGER, fund_af_int INTEGER, medio INTEGER, medio_int INTEGER,
    prof INTEGER, eja INTEGER, especial INTEGER, total INTEGER, total_int INTEGER, segmentos_ativos INTEGER,
    atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  // "segmentos ativos" das 8 grandes categorias FUNDEB da rede municipal
  const GRANDES = ["creche", "pre", "fund_ai", "fund_af", "medio", "prof", "eja", "especial"];
  let n = 0;
  for (const [cod, m] of M) {
    const ativos = GRANDES.filter((k) => m[k] > 0).length;
    await db.query(`INSERT INTO fundeb_matriculas_sc (cod_ibge,ano,creche,creche_int,pre,pre_int,fund_ai,fund_ai_int,fund_af,fund_af_int,medio,medio_int,prof,eja,especial,total,total_int,segmentos_ativos,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET creche=EXCLUDED.creche,creche_int=EXCLUDED.creche_int,pre=EXCLUDED.pre,pre_int=EXCLUDED.pre_int,fund_ai=EXCLUDED.fund_ai,fund_ai_int=EXCLUDED.fund_ai_int,fund_af=EXCLUDED.fund_af,fund_af_int=EXCLUDED.fund_af_int,medio=EXCLUDED.medio,medio_int=EXCLUDED.medio_int,prof=EXCLUDED.prof,eja=EXCLUDED.eja,especial=EXCLUDED.especial,total=EXCLUDED.total,total_int=EXCLUDED.total_int,segmentos_ativos=EXCLUDED.segmentos_ativos,atualizado=now()`,
      [cod, Number(ANO), m.creche, m.creche_int, m.pre, m.pre_int, m.fund_ai, m.fund_ai_int, m.fund_af, m.fund_af_int, m.medio, m.medio_int, m.prof, m.eja, m.especial, m.total, m.total_int, ativos]);
    n++;
  }
  const chk = (await db.query(`SELECT count(*) munis, sum(total) tot, round(100.0*sum(total_int)/nullif(sum(total),0),1) pct_int, round(avg(segmentos_ativos),1) seg FROM fundeb_matriculas_sc WHERE ano=$1`, [Number(ANO)])).rows[0];
  console.log(`✔ fundeb_matriculas_sc ${ANO}: ${n} munis · ${chk.tot} matrículas municipais · ${chk.pct_int}% integral · média ${chk.seg} segmentos ativos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
