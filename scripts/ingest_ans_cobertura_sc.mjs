// ETL — ANS cobertura de planos de saúde por município. Fonte: dadosabertos.ans.gov.br (taxa_de_cobertura, CSV 21MB, latin1, ;).
// Agrega beneficiários (assistência médica) + população + taxa de cobertura por (município, ano). Indicador de PRESSÃO
// LATENTE sobre o SUS: quem tem plano e pode cair na rede pública. State-agnostic (UF env). node scripts/ingest_ans_cobertura_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CSV_URL = "https://dadosabertos.ans.gov.br/FTP/PDA/taxa_de_cobertura_de_planos_de_saude-047/pda-047-taxa_cobertura.csv";
const cel = (l) => l.split(";").map((x) => x.replace(/^"|"$/g, "").trim());
const int = (s) => { const x = parseInt(String(s || "").replace(/\D/g, ""), 10); return Number.isFinite(x) ? x : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  // ANS usa IBGE 6 dígitos → mapeia p/ o cod_ibge de 7 dígitos (prefixo).
  const ents = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows;
  const by6 = new Map(ents.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  // População do arquivo ANS vem zerada → usar a estimativa IBGE MAIS RECENTE (SIDRA t6579), casando com o ano da ANS.
  const UF_COD = process.env.UF_COD || "42";
  const popResp = await fetch(`https://apisidra.ibge.gov.br/values/t/6579/n6/in%20n3%20${UF_COD}/v/9324/p/last`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) }).then((r) => r.json()).catch(() => null);
  const byPop = new Map(); let popAno = null;
  for (const r of (popResp || []).slice(1)) { const cod = r.D1C, v = Number(r.V); if (cod && cod.length === 7 && Number.isFinite(v)) { byPop.set(cod, v); popAno = int(r.D3N) || popAno; } }
  if (!byPop.size) { console.error("SIDRA população falhou"); process.exit(1); }
  console.log(`população IBGE de referência: estimativa ${popAno}`);

  const csv = process.env.CSV || path.join(os.tmpdir(), "ans_cobertura.csv");
  if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e6) { console.log("baixando ANS (~21MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", csv, CSV_URL], { stdio: "ignore" }); }

  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map();
  for await (const line of rl) {
    const c = cel(line); if (c.length < 13) continue;
    if (!H) { H = c; const at = (n) => H.indexOf(n); ix = { per: at("PERIODO"), cod: at("CD_MUNICIPIO"), uf: at("SG_UF"), bmed: at("BENEF_ASSISTENCIA_MEDICA"), btot: at("BENEF_TOTAL"), pop: at("POPULACAO") }; continue; }
    if ((c[ix.uf] || "") !== UF) continue;
    const cod = by6.get((c[ix.cod] || "").slice(0, 6)); if (!cod) continue;
    const ano = int(c[ix.per]); if (!ano) continue;
    const k = cod + "|" + ano;
    if (!M.has(k)) M.set(k, { cod, ano, bmed: 0, btot: 0, pop: 0 });
    const m = M.get(k); m.bmed += int(c[ix.bmed]); m.btot += int(c[ix.btot]); m.pop += int(c[ix.pop]);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS ans_cobertura_sc (cod_ibge TEXT, ano INTEGER, benef_medica INTEGER, benef_total INTEGER, populacao INTEGER, pop_ano INTEGER, taxa_cobertura NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`ALTER TABLE ans_cobertura_sc ADD COLUMN IF NOT EXISTS pop_ano INTEGER`).catch(() => {});
  for (const m of M.values()) {
    const pop = byPop.get(m.cod) || 0; // estimativa IBGE mais recente (a do arquivo ANS vem zerada) — casa com o ano da ANS
    const taxa = pop > 0 ? +((m.bmed / pop) * 100).toFixed(2) : null;
    await db.query(`INSERT INTO ans_cobertura_sc (cod_ibge,ano,benef_medica,benef_total,populacao,pop_ano,taxa_cobertura,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET benef_medica=EXCLUDED.benef_medica,benef_total=EXCLUDED.benef_total,populacao=EXCLUDED.populacao,pop_ano=EXCLUDED.pop_ano,taxa_cobertura=EXCLUDED.taxa_cobertura,atualizado=now()`,
      [m.cod, m.ano, m.bmed, m.btot, pop, popAno, taxa]);
  }
  const chk = (await db.query(`SELECT count(*) l, count(distinct cod_ibge) m, min(ano) mi, max(ano) ma, round(avg(taxa_cobertura),1) tx FROM ans_cobertura_sc`)).rows[0];
  console.log(`✔ ans_cobertura_sc: ${chk.l} linhas · ${chk.m} munis · ${chk.mi}-${chk.ma} · cobertura média ${chk.tx}%`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
