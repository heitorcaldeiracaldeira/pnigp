// ETL — Bancada ESTADUAL (deputados estaduais eleitos, ALESC) + votos por município, do TSE 2022 (cargo 7).
// Roster = candidatos cargo 7 com situação "ELEITO ..." (QP/Média). Votos por município no mesmo passo.
// node scripts/ingest_bancada_estadual_sc.mjs
import fs from "fs"; import pg from "pg"; import readline from "readline"; import { spawn } from "child_process";
import { SG_UF } from "./_uf.mjs";   // NACIONAL-READY: UF=SP roda SP (era 'SC' fixo)
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const DIR = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const ZIP = `${DIR}/tse2022.zip`, MEMBRO = "votacao_candidato_munzona_2022_SC.csv";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS bancada_estadual_sc (id TEXT PRIMARY KEY, nome TEXT, partido TEXT, votos_total INT, situacao TEXT, atualizado timestamptz DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS votos_estadual_sc (bancada_id TEXT, cod_ibge TEXT, votos INT, PRIMARY KEY (bancada_id, cod_ibge))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const munToCod = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  const proc = spawn("unzip", ["-p", ZIP, MEMBRO]); proc.stderr.on("data", () => {}); proc.stdout.setEncoding("latin1");
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let idx = null, linhas = 0;
  const cand = new Map(); // sq -> {nome, partido, situacao, total}
  const vm = new Map();   // `${sq}|${cod}` -> votos
  for await (const line of rl) {
    if (!line) continue; const c = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
    if (idx === null) { const h = c.map((x) => x.trim().toUpperCase()); idx = { cargo: h.indexOf("CD_CARGO"), turno: h.indexOf("NR_TURNO"), uf: h.indexOf("SG_UF"), mun: h.indexOf("NM_MUNICIPIO"), sq: h.indexOf("SQ_CANDIDATO"), urna: h.indexOf("NM_URNA_CANDIDATO"), part: h.indexOf("SG_PARTIDO"), sit: h.indexOf("DS_SIT_TOT_TURNO"), votos: h.indexOf("QT_VOTOS_NOMINAIS") }; continue; }
    linhas++;
    if (idx.uf >= 0 && c[idx.uf] !== SG_UF) continue;
    if (c[idx.cargo] !== "7") continue; // 7 = Deputado Estadual
    if (idx.turno >= 0 && c[idx.turno] !== "1") continue;
    const sit = c[idx.sit] || "";
    if (!/^ELEITO/i.test(sit)) continue; // só eleitos (QP ou Média)
    const sq = c[idx.sq]; const v = parseInt(c[idx.votos], 10) || 0;
    const o = cand.get(sq) || { nome: c[idx.urna], partido: c[idx.part], situacao: sit, total: 0 }; o.total += v; cand.set(sq, o);
    const cod = munToCod.get(norm(c[idx.mun])); if (!cod) continue;
    const k = `${sq}|${cod}`; vm.set(k, (vm.get(k) || 0) + v);
  }
  await new Promise((res) => proc.on("close", res));

  await q(`TRUNCATE bancada_estadual_sc`); await q(`TRUNCATE votos_estadual_sc`);
  for (const [sq, o] of cand) await q(`INSERT INTO bancada_estadual_sc (id,nome,partido,votos_total,situacao) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome,partido=EXCLUDED.partido,votos_total=EXCLUDED.votos_total,situacao=EXCLUDED.situacao`, [`alesc-${sq}`, o.nome, o.partido, o.total, o.situacao]);
  let nv = 0; for (const [k, v] of vm) { const [sq, cod] = k.split("|"); if (v <= 0) continue; await q(`INSERT INTO votos_estadual_sc (bancada_id,cod_ibge,votos) VALUES ($1,$2,$3) ON CONFLICT (bancada_id,cod_ibge) DO UPDATE SET votos=EXCLUDED.votos`, [`alesc-${sq}`, cod, v]); nv++; }
  console.log(`Bancada estadual SC: ${cand.size} deputados eleitos · ${nv} pares (deputado×município) · ${linhas} linhas`);
  const top = (await db.query(`SELECT nome, partido, votos_total FROM bancada_estadual_sc ORDER BY votos_total DESC LIMIT 6`)).rows;
  top.forEach((r) => console.log(`   ${r.nome} (${r.partido}): ${Number(r.votos_total).toLocaleString("pt-BR")} votos`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
