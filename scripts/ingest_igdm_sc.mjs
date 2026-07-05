// ETL — MDS IGD-M (Índice de Gestão Descentralizada Municipal) por município. Fonte: MI Social/SAGI (Solr CSV, sem auth).
// Qualidade da gestão do PBF/CadÚnico: índice + freq. escolar + agenda saúde + atualização cadastral (condicionalidades = risco de perder repasse). node scripts/ingest_igdm_sc.mjs
import fs from "fs"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SOLR = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial/?q=*&fq=igdm_f:*&fl=codigo_ibge,anomes_s,igdm_f,tx_acomp_freq_escol_f,tx_acomp_agenda_saude_f,tx_atual_cad_f&rows=200000&sort=anomes_s%20desc&wt=csv";
const nn = (v) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(3) : null; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const rows0 = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows;
  const by6 = new Map(rows0.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge])); // Solr usa IBGE 6 díg
  const csv = execFileSync("curl", ["-s", "--max-time", "90", SOLR], { encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = csv.split(/\r?\n/); const H = lines[0].split(",");
  const ix = { cod: H.indexOf("codigo_ibge"), am: H.indexOf("anomes_s"), igdm: H.indexOf("igdm_f"), esc: H.indexOf("tx_acomp_freq_escol_f"), sau: H.indexOf("tx_acomp_agenda_saude_f"), cad: H.indexOf("tx_atual_cad_f") };
  const M = new Map(); // cod -> {mais recente} (linhas já vêm anomes desc)
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(","); const c6 = (c[ix.cod] || "").trim().slice(0,6); const cod = by6.get(c6);
    if (!cod || M.has(cod)) continue;
    M.set(cod, { anomes: c[ix.am], igdm: nn(c[ix.igdm]), esc: nn(c[ix.esc]), sau: nn(c[ix.sau]), cad: nn(c[ix.cad]) });
  }
  await db.query(`CREATE TABLE IF NOT EXISTS igdm_sc (cod_ibge TEXT PRIMARY KEY, anomes TEXT, igdm NUMERIC, freq_escolar NUMERIC, agenda_saude NUMERIC, atual_cadastral NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE igdm_sc`);
  for (const [cod, d] of M) await db.query(`INSERT INTO igdm_sc (cod_ibge,anomes,igdm,freq_escolar,agenda_saude,atual_cadastral,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now())`, [cod, d.anomes, d.igdm, d.esc, d.sau, d.cad]);
  const chk = (await db.query(`SELECT count(*) m, round(avg(igdm),3) a, max(anomes) am FROM igdm_sc`)).rows[0];
  console.log(`✔ igdm_sc: ${chk.m} municípios · IGD-M médio ${chk.a} · ref ${chk.am}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
