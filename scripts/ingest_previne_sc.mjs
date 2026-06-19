// ETL — Previne Brasil (indicadores de desempenho da APS / SISAB) por município de SC.
// Fonte: CSV oficial por quadrimestre (Portal de Dados Abertos do SUS, S3). Agrega numerador/denominador
// por município×indicador e calcula o %. Idempotente por competência. node scripts/ingest_previne_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/sisab/indicador_desempenho/csv/sisab_indicador_desempenho_";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const COMPS = process.env.COMPS ? process.env.COMPS.split(",") : ["2022Q1", "2022Q2", "2022Q3", "2023Q1", "2023Q2", "2023Q3", "2024Q1", "2024Q2", "2024Q3", "2025Q1", "2025Q2", "2025Q3"];
const IND = { "10": "Pré-natal (6+ consultas)", "20": "Pré-natal sífilis/HIV", "30": "Saúde bucal gestante", "40": "Citopatológico", "50": "Vacinação infantil", "60": "Hipertensão (PA aferida)", "70": "Diabetes (HbA1c)" };

// descompacta zip de 1 arquivo (cabeçalho local + inflateRaw)
function unzipUnico(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return null;
  const fn = buf.readUInt16LE(26), ex = buf.readUInt16LE(28), comp = buf.readUInt32LE(18);
  const start = 30 + fn + ex;
  const dados = comp > 0 ? buf.subarray(start, start + comp) : buf.subarray(start, buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
  try { return zlib.inflateRawSync(dados); } catch { return null; }
}
async function baixar(comp) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${BASE}${comp}.csv.zip`, { signal: AbortSignal.timeout(120000) });
      if (r.status === 404 || r.status === 403) return "404";
      if (!r.ok) throw 0;
      const buf = Buffer.from(await r.arrayBuffer());
      const csv = unzipUnico(buf); if (!csv) throw new Error("unzip");
      return csv.toString("latin1");
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 120000, statement_timeout: 120000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS previne_sc (
    cod_ibge TEXT NOT NULL, competencia TEXT NOT NULL, indicador TEXT NOT NULL, ind_nome TEXT,
    numerador BIGINT, denominador BIGINT, pct NUMERIC, PRIMARY KEY (cod_ibge, competencia, indicador) )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };
  const cod6map = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => [r.cod_ibge.slice(0, 6), r.cod_ibge]));
  const feitos = new Set((await db.query(`SELECT DISTINCT competencia FROM previne_sc`)).rows.map((r) => r.competencia));

  for (const comp of COMPS) {
    if (feitos.has(comp)) { console.log(`${comp}: já`); continue; }
    const csv = await baixar(comp);
    if (csv === "404") { console.log(`${comp}: indisponível`); continue; }
    if (!csv) { console.log(`${comp}: falhou`); continue; }
    const lines = csv.split(/\r?\n/);
    // agrega num/den por (ibge, indicador)
    const agg = {};
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i]; if (!/^"?SC"?;/.test(l)) continue;
      const c = l.split(";").map((x) => x.replace(/^"|"$/g, ""));
      const ibge = c[1], ind = c[5], num = Number(c[6]) || 0, den = Number(c[7]) || 0;
      const k = `${ibge}|${ind}`; (agg[k] ??= { ibge, ind, num: 0, den: 0 }); agg[k].num += num; agg[k].den += den;
    }
    let n = 0;
    for (const a of Object.values(agg)) {
      const cod = cod6map.get(a.ibge); if (!cod) continue;
      const pct = a.den > 0 ? Math.round((a.num / a.den) * 1000) / 10 : null;
      await q(`INSERT INTO previne_sc (cod_ibge,competencia,indicador,ind_nome,numerador,denominador,pct) VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (cod_ibge,competencia,indicador) DO UPDATE SET ind_nome=EXCLUDED.ind_nome,numerador=EXCLUDED.numerador,denominador=EXCLUDED.denominador,pct=EXCLUDED.pct`,
        [cod, comp, a.ind, IND[a.ind] || a.ind, a.num, a.den, pct]);
      n++;
    }
    console.log(`${comp}: ${n} linhas (município×indicador)`);
  }
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) e, count(DISTINCT competencia) comps FROM previne_sc`);
  console.log(`Previne concluído: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
