// ETL — Escolas por município (INEP Censo Escolar microdados, arquivo ed_basica). Cada escola: identificação,
// dependência, matrículas e INFRAESTRUTURA (água/energia/esgoto/internet/biblioteca/quadra/lab/refeitório/acessib).
// Filtra SC (CO_UF=42) e em atividade. Idempotente (UPSERT por co_entidade). node scripts/ingest_escolas_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // INEP: cadeia TLS incompleta (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = process.env.ANO || "2025";
const URL = process.env.CENSO_URL || `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ANO}_.zip`;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const um = (v) => String(v).trim() === "1";

// unzip — acha a entrada cujo nome termina em `sufixo` no diretório central e infla
function unzipEntry(buf, sufixo) {
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  let p = buf.readUInt32LE(eo + 16); const n = buf.readUInt16LE(eo + 10);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("latin1", p + 46, p + 46 + nameLen);
    if (name.toLowerCase().endsWith(sufixo.toLowerCase())) {
      const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28), ds = lho + 30 + lN + lE;
      const comp = buf.subarray(ds, ds + compSize);
      return (method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString("latin1");
    }
    p += 46 + nameLen + extraLen + commLen;
  }
  throw new Error("entrada não encontrada: " + sufixo);
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS escolas_sc (
    co_entidade TEXT PRIMARY KEY, cod_ibge TEXT, ano INTEGER, nome TEXT, dependencia SMALLINT, localizacao SMALLINT, matriculas INTEGER,
    tem_agua BOOLEAN, tem_energia BOOLEAN, tem_esgoto BOOLEAN, tem_internet BOOLEAN, tem_biblioteca BOOLEAN, tem_lab_info BOOLEAN, tem_quadra BOOLEAN, tem_refeitorio BOOLEAN, tem_acessibilidade BOOLEAN)`);
  for (const col of ["latitude DOUBLE PRECISION", "longitude DOUBLE PRECISION", "bairro TEXT", "endereco TEXT", "docentes INTEGER", "profissionais INTEGER", "transp_publico INTEGER", "transp_mun INTEGER", "perfil JSONB", "n_turmas INTEGER"]) await db.query(`ALTER TABLE escolas_sc ADD COLUMN IF NOT EXISTS ${col}`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };

  console.log("Baixando microdados…");
  const r = await fetch(URL, { signal: AbortSignal.timeout(180000) });
  const buf = Buffer.from(await r.arrayBuffer());
  console.log(`baixado ${Math.round(buf.length / 1024 / 1024)} MB · extraindo CSV…`);
  // matrículas + transporte por escola — arquivo de matrículas é AGREGADO por escola (QT_MAT_BAS por CO_ENTIDADE)
  let matMap = null, transpMap = null, perfilMap = null;
  try {
    const mcsv = unzipEntry(buf, "Tabela_Matricula_" + ANO + ".csv");
    const mh = mcsv.slice(0, mcsv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
    const ci = mh.indexOf("CO_ENTIDADE"), qi = mh.indexOf("QT_MAT_BAS"), tp = mh.indexOf("QT_TRANSP_PUBLICO"), tm = mh.indexOf("QT_TRANSP_RESP_MUN");
    const DEMO = { fem: "QT_MAT_BAS_FEM", branca: "QT_MAT_BAS_BRANCA", preta: "QT_MAT_BAS_PRETA", parda: "QT_MAT_BAS_PARDA", amarela: "QT_MAT_BAS_AMARELA", indigena: "QT_MAT_BAS_INDIGENA", i0_3: "QT_MAT_BAS_0_3", i4_5: "QT_MAT_BAS_4_5", i6_10: "QT_MAT_BAS_6_10", i11_14: "QT_MAT_BAS_11_14", i15_17: "QT_MAT_BAS_15_17", i18: "QT_MAT_BAS_18_MAIS", especial: "QT_MAT_ESP", integral: "QT_MAT_INTEGRAL" };
    const di = Object.fromEntries(Object.entries(DEMO).map(([k, n]) => [k, mh.indexOf(n)]));
    if (ci >= 0 && qi >= 0) {
      matMap = new Map(); transpMap = new Map(); perfilMap = new Map();
      const ml = mcsv.split(/\r?\n/);
      for (let i = 1; i < ml.length; i++) { if (!ml[i]) continue; const cols = ml[i].split(";"); const co = cols[ci]?.replace(/"/g, ""); if (!co) continue;
        matMap.set(co, parseInt(cols[qi], 10) || 0);
        transpMap.set(co, { pub: tp >= 0 ? (parseInt(cols[tp], 10) || 0) : 0, mun: tm >= 0 ? (parseInt(cols[tm], 10) || 0) : 0 });
        const p = {}; for (const k in di) if (di[k] >= 0) p[k] = parseInt(cols[di[k]], 10) || 0; perfilMap.set(co, p);
      }
      console.log(`  matrículas+transporte+perfil: ${matMap.size} escolas`);
    }
  } catch { /* 2024 traz matrícula no próprio arquivo de escola */ }
  // docentes por escola (arquivo de docentes já vem agregado: QT_DOC_BAS por CO_ENTIDADE)
  let docMap = null;
  try {
    const dcsv = unzipEntry(buf, "Tabela_Docente_" + ANO + ".csv");
    const dh = dcsv.slice(0, dcsv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
    const ci = dh.indexOf("CO_ENTIDADE"), qi = dh.indexOf("QT_DOC_BAS");
    if (ci >= 0 && qi >= 0) {
      docMap = new Map(); const dl = dcsv.split(/\r?\n/);
      for (let i = 1; i < dl.length; i++) { if (!dl[i]) continue; const cols = dl[i].split(";"); const co = cols[ci]?.replace(/"/g, ""); const v = parseInt(cols[qi], 10); if (co && !isNaN(v)) docMap.set(co, v); }
      console.log(`  docentes por escola: ${docMap.size}`);
    }
  } catch { /* sem arquivo de docentes */ }
  // turmas por escola (agregado: QT_TUR_BAS) → tamanho médio de turma
  let turMap = null;
  try {
    const tcsv = unzipEntry(buf, "Tabela_Turma_" + ANO + ".csv");
    const th = tcsv.slice(0, tcsv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
    const ci = th.indexOf("CO_ENTIDADE"), qi = th.indexOf("QT_TUR_BAS");
    if (ci >= 0 && qi >= 0) {
      turMap = new Map(); const tl = tcsv.split(/\r?\n/);
      for (let i = 1; i < tl.length; i++) { if (!tl[i]) continue; const cols = tl[i].split(";"); const co = cols[ci]?.replace(/"/g, ""); const v = parseInt(cols[qi], 10); if (co && !isNaN(v)) turMap.set(co, v); }
      console.log(`  turmas por escola: ${turMap.size}`);
    }
  } catch { /* sem arquivo de turmas */ }
  const csv = unzipEntry(buf, "Tabela_Escola_" + ANO + ".csv");
  const linhas = csv.split(/\r?\n/);
  const head = linhas[0].split(";").map((h) => h.replace(/^"|"$/g, "").trim());
  const ix = (nome) => head.indexOf(nome);
  const C = { uf: ix("CO_UF"), mun: ix("CO_MUNICIPIO"), no: ix("NO_ENTIDADE"), co: ix("CO_ENTIDADE"), dep: ix("TP_DEPENDENCIA"), loc: ix("TP_LOCALIZACAO"), sit: ix("TP_SITUACAO_FUNCIONAMENTO"), mat: ix("QT_MAT_BAS"), agua: ix("IN_AGUA_INEXISTENTE"), ener: ix("IN_ENERGIA_INEXISTENTE"), esg: ix("IN_ESGOTO_INEXISTENTE"), net: ix("IN_INTERNET"), bib: ix("IN_BIBLIOTECA"), lab: ix("IN_LABORATORIO_INFORMATICA"), quad: ix("IN_QUADRA_ESPORTES"), ref: ix("IN_REFEITORIO"), aces: ix("IN_ACESSIBILIDADE_INEXISTENTE"), lat: ix("LATITUDE"), lon: ix("LONGITUDE"), bairro: ix("NO_BAIRRO"), end: ix("DS_ENDERECO") };
  const flt = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return isNaN(n) ? null : n; };
  const profCols = head.map((h, i) => (/^QT_PROF_/.test(h) ? i : -1)).filter((i) => i >= 0); // servidores de apoio
  let n = 0;
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const c = linhas[i].split(";").map((x) => x.replace(/^"|"$/g, ""));
    if (c[C.uf] !== "42") continue; // só SC
    if (c[C.sit] !== "1") continue; // só em atividade
    const cod = c[C.mun]; const matr = matMap ? (matMap.get(c[C.co]) || 0) : parseInt(c[C.mat], 10);
    const prof = profCols.reduce((s, i) => s + (parseInt(c[i], 10) || 0), 0);
    const doc = docMap ? (docMap.get(c[C.co]) ?? null) : null;
    const transp = (transpMap && transpMap.get(c[C.co])) || { pub: 0, mun: 0 };
    const perfil = (perfilMap && perfilMap.get(c[C.co])) || null;
    const nTur = turMap ? (turMap.get(c[C.co]) ?? null) : null;
    await q(`INSERT INTO escolas_sc (co_entidade,cod_ibge,ano,nome,dependencia,localizacao,matriculas,tem_agua,tem_energia,tem_esgoto,tem_internet,tem_biblioteca,tem_lab_info,tem_quadra,tem_refeitorio,tem_acessibilidade,latitude,longitude,bairro,endereco,docentes,profissionais,transp_publico,transp_mun,perfil,n_turmas)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
             ON CONFLICT (co_entidade) DO UPDATE SET nome=EXCLUDED.nome, matriculas=EXCLUDED.matriculas, ano=EXCLUDED.ano, tem_internet=EXCLUDED.tem_internet, tem_biblioteca=EXCLUDED.tem_biblioteca, tem_quadra=EXCLUDED.tem_quadra, tem_acessibilidade=EXCLUDED.tem_acessibilidade, tem_esgoto=EXCLUDED.tem_esgoto, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, bairro=EXCLUDED.bairro, endereco=EXCLUDED.endereco, docentes=EXCLUDED.docentes, profissionais=EXCLUDED.profissionais, transp_publico=EXCLUDED.transp_publico, transp_mun=EXCLUDED.transp_mun, perfil=EXCLUDED.perfil, n_turmas=EXCLUDED.n_turmas`,
      [c[C.co], cod, +ANO, c[C.no], parseInt(c[C.dep], 10) || null, parseInt(c[C.loc], 10) || null, isNaN(matr) ? null : matr,
        !um(c[C.agua]), !um(c[C.ener]), !um(c[C.esg]), um(c[C.net]), um(c[C.bib]), um(c[C.lab]), um(c[C.quad]), um(c[C.ref]), !um(c[C.aces]),
        flt(c[C.lat]), flt(c[C.lon]), c[C.bairro] || null, c[C.end] || null, doc, prof, transp.pub, transp.mun, perfil ? JSON.stringify(perfil) : null, nTur]);
    n++;
    if (n % 500 === 0) console.log(`  ${n} escolas SC…`);
  }
  const res = await db.query(`SELECT count(*) total, count(*) FILTER (WHERE dependencia=3) municipais, count(distinct cod_ibge) entes FROM escolas_sc`);
  console.log(`Escolas concluído: ${n} gravadas · ${JSON.stringify(res.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
