// ETL — Nível SÉRIE por escola (SC): matrículas + turmas por série (1º-9º ano, médio, creche/pré, EJA), Censo 2025.
// Permite o drill série a série com turmas. Grava JSONB escolas_sc.series. node scripts/ingest_escolas_series_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = "2025";
const URL = `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ANO}_.zip`;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// série → coluna de matrícula + coluna de turma (no Censo agregado por escola)
const SERIES = [
  { k: "Creche", m: "QT_MAT_INF_CRE", t: "QT_TUR_INF_CRE" },
  { k: "Pré-escola", m: "QT_MAT_INF_PRE", t: "QT_TUR_INF_PRE" },
  { k: "1º ano", m: "QT_MAT_FUND_AI_1", t: "QT_TUR_FUND_AI_1" },
  { k: "2º ano", m: "QT_MAT_FUND_AI_2", t: "QT_TUR_FUND_AI_2" },
  { k: "3º ano", m: "QT_MAT_FUND_AI_3", t: "QT_TUR_FUND_AI_3" },
  { k: "4º ano", m: "QT_MAT_FUND_AI_4", t: "QT_TUR_FUND_AI_4" },
  { k: "5º ano", m: "QT_MAT_FUND_AI_5", t: "QT_TUR_FUND_AI_5" },
  { k: "6º ano", m: "QT_MAT_FUND_AF_6", t: "QT_TUR_FUND_AF_6" },
  { k: "7º ano", m: "QT_MAT_FUND_AF_7", t: "QT_TUR_FUND_AF_7" },
  { k: "8º ano", m: "QT_MAT_FUND_AF_8", t: "QT_TUR_FUND_AF_8" },
  { k: "9º ano", m: "QT_MAT_FUND_AF_9", t: "QT_TUR_FUND_AF_9" },
  { k: "1ª série (Médio)", m: "QT_MAT_MED_PROP_1", t: "QT_TUR_MED_PROP_1" },
  { k: "2ª série (Médio)", m: "QT_MAT_MED_PROP_2", t: "QT_TUR_MED_PROP_2" },
  { k: "3ª série (Médio)", m: "QT_MAT_MED_PROP_3", t: "QT_TUR_MED_PROP_3" },
  { k: "4ª série (Médio)", m: "QT_MAT_MED_PROP_4", t: "QT_TUR_MED_PROP_4" },
  { k: "EJA", m: "QT_MAT_EJA", t: "QT_TUR_EJA" },
];

function unzipEntry(buf, sufixo) {
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  let p = buf.readUInt32LE(eo + 16); const n = buf.readUInt16LE(eo + 10);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("latin1", p + 46, p + 46 + nameLen);
    if (name.toLowerCase().endsWith(sufixo.toLowerCase())) { const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28), ds = lho + 30 + lN + lE; const comp = buf.subarray(ds, ds + compSize); return (method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString("latin1"); }
    p += 46 + nameLen + extraLen + commLen;
  }
  throw new Error("não achou " + sufixo);
}
// mapa CO_ENTIDADE → {coluna: valor} para as colunas pedidas
function porEscola(csv, cols) {
  const head = csv.slice(0, csv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
  const ci = head.indexOf("CO_ENTIDADE"); const idx = cols.map((c) => [c, head.indexOf(c)]).filter(([, i]) => i >= 0);
  const m = new Map(); const linhas = csv.split(/\r?\n/);
  for (let i = 1; i < linhas.length; i++) { if (!linhas[i]) continue; const c = linhas[i].split(";"); const co = c[ci]?.replace(/"/g, ""); if (!co) continue; const o = {}; for (const [name, j] of idx) { const v = parseInt(c[j], 10); if (!isNaN(v)) o[name] = v; } m.set(co, o); }
  return m;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`ALTER TABLE escolas_sc ADD COLUMN IF NOT EXISTS series JSONB`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const escSC = new Set((await db.query(`SELECT co_entidade FROM escolas_sc`)).rows.map((r) => r.co_entidade));
  console.log(`escolas SC alvo: ${escSC.size}`);

  console.log("baixando Censo 2025…");
  const r = await fetch(URL, { signal: AbortSignal.timeout(180000) });
  const buf = Buffer.from(await r.arrayBuffer());
  console.log(`baixado ${Math.round(buf.length / 1024 / 1024)} MB`);
  const matMap = porEscola(unzipEntry(buf, "Tabela_Matricula_" + ANO + ".csv"), SERIES.map((s) => s.m));
  const turMap = porEscola(unzipEntry(buf, "Tabela_Turma_" + ANO + ".csv"), SERIES.map((s) => s.t));
  console.log(`mapas: matrícula ${matMap.size}, turma ${turMap.size}`);

  let n = 0;
  for (const co of escSC) {
    const mm = matMap.get(co) || {}, tt = turMap.get(co) || {};
    const series = [];
    for (const s of SERIES) { const mat = mm[s.m] || 0, tur = tt[s.t] || 0; if (mat > 0 || tur > 0) series.push({ serie: s.k, mat, tur }); }
    if (!series.length) continue;
    await q(`UPDATE escolas_sc SET series=$2 WHERE co_entidade=$1`, [co, JSON.stringify(series)]);
    n++;
    if (n % 1000 === 0) console.log(`  ${n} escolas…`);
  }
  const res = await db.query(`SELECT count(*) FILTER(WHERE series IS NOT NULL) com_series, count(*) tot FROM escolas_sc`);
  console.log(`Séries por escola concluído: ${n} atualizadas · ${JSON.stringify(res.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
