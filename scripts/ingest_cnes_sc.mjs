// ETL — CNES (rede de saúde instalada) por município de SC. Fonte: API dados abertos do Min. Saúde.
// Agrega por município: nº de estabelecimentos, atende SUS, atendimento hospitalar, centros cirúrgico/obstétrico/neonatal,
// e contagem por tipo de unidade. co_municipio = 6 primeiros dígitos do cod_ibge. Idempotente/resumível.
// node scripts/ingest_cnes_sc.mjs [cod_ibge]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const PAG = 20, MAX_PAG = 300;

async function getPag(co6, offset) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${API}?codigo_municipio=${co6}&limit=${PAG}&offset=${offset}`, { signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return null;
      return (await r.json()).estabelecimentos || [];
    } catch { await sleep(600 * (t + 1)); }
  }
  return null;
}
async function coletarMunicipio(co6) {
  const ag = { total: 0, sus_amb: 0, hospitalar: 0, cirurgico: 0, obstetrico: 0, neonatal: 0, por_tipo: {} };
  let atualizado = null;
  for (let pg = 0; pg < MAX_PAG; pg++) {
    const est = await getPag(co6, pg * PAG);
    if (est === null) return null;       // falha de rede → aborta (retoma depois)
    if (!est.length) break;
    for (const e of est) {
      ag.total++;
      if (String(e.estabelecimento_faz_atendimento_ambulatorial_sus) === "SIM") ag.sus_amb++;
      if (Number(e.estabelecimento_possui_atendimento_hospitalar) === 1) ag.hospitalar++;
      if (Number(e.estabelecimento_possui_centro_cirurgico) === 1) ag.cirurgico++;
      if (Number(e.estabelecimento_possui_centro_obstetrico) === 1) ag.obstetrico++;
      if (Number(e.estabelecimento_possui_centro_neonatal) === 1) ag.neonatal++;
      const tp = String(e.codigo_tipo_unidade || "?"); ag.por_tipo[tp] = (ag.por_tipo[tp] || 0) + 1;
      const d = (e.data_atualizacao || "").slice(0, 10); if (d && (!atualizado || d > atualizado)) atualizado = d;
    }
    if (est.length < PAG) break;
    await sleep(100);
  }
  ag.atualizado = atualizado;
  return ag;
}
async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_sc (
    cod_ibge TEXT PRIMARY KEY, total INTEGER, sus_amb INTEGER, hospitalar INTEGER,
    cirurgico INTEGER, obstetrico INTEGER, neonatal INTEGER, por_tipo JSONB, atualizado DATE, coletado_em timestamptz DEFAULT now() )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };

  const arg = process.argv[2];
  if (arg) { console.log(arg, JSON.stringify(await coletarMunicipio(arg.slice(0, 6)))); await db.end(); return; }

  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM cnes_sc`)).rows.map((r) => r.cod_ibge));
  const pend = entes.filter((e) => !feitos.has(e.cod_ibge));
  console.log(`CNES: ${pend.length} municípios pendentes de ${entes.length}...`);
  let ok = 0;
  await pool(pend, 3, async (e) => {
    const ag = await coletarMunicipio(e.cod_ibge.slice(0, 6));
    if (!ag) return;
    await q(`INSERT INTO cnes_sc (cod_ibge,total,sus_amb,hospitalar,cirurgico,obstetrico,neonatal,por_tipo,atualizado,coletado_em)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
             ON CONFLICT (cod_ibge) DO UPDATE SET total=EXCLUDED.total,sus_amb=EXCLUDED.sus_amb,hospitalar=EXCLUDED.hospitalar,cirurgico=EXCLUDED.cirurgico,obstetrico=EXCLUDED.obstetrico,neonatal=EXCLUDED.neonatal,por_tipo=EXCLUDED.por_tipo,atualizado=EXCLUDED.atualizado,coletado_em=now()`,
      [e.cod_ibge, ag.total, ag.sus_amb, ag.hospitalar, ag.cirurgico, ag.obstetrico, ag.neonatal, JSON.stringify(ag.por_tipo), ag.atualizado]);
    if (ag.total) ok++;
  });
  const c = await db.query(`SELECT count(*) e, sum(total) t, sum(hospitalar) h FROM cnes_sc`);
  console.log(`CNES concluído: ${ok} municípios | total estab=${c.rows[0].t} | c/ hospital=${c.rows[0].h} | entes=${c.rows[0].e}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
