// ETL — Número de ELEITORES (aptos) por município de SC, p/ o % dos votos de cada parlamentar sobre o eleitorado.
// Fonte: TSE perfil_comparecimento_abstencao 2022 (QT_APTOS por município/zona, turno 1).
// node scripts/ingest_eleitorado_sc.mjs
import fs from "fs"; import pg from "pg"; import readline from "readline"; import { spawn } from "child_process";
import { SG_UF } from "./_uf.mjs";   // NACIONAL-READY: UF=SP roda SP (era 'SC' fixo)
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const DIR = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const ZIP = `${DIR}/comparecimento2022.zip`, MEMBRO = "perfil_comparecimento_abstencao_2022_SC.csv";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS eleitorado_sc (cod_ibge TEXT PRIMARY KEY, eleitores INT, ano INT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const munToCod = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  const proc = spawn("unzip", ["-p", ZIP, MEMBRO]); proc.stderr.on("data", () => {}); proc.stdout.setEncoding("latin1");
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let idx = null, linhas = 0;
  const acc = new Map(); // cod -> aptos
  for await (const line of rl) {
    if (!line) continue; const c = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
    if (idx === null) { const h = c.map((x) => x.trim().toUpperCase()); idx = { turno: h.indexOf("NR_TURNO"), uf: h.indexOf("SG_UF"), mun: h.indexOf("NM_MUNICIPIO"), aptos: h.indexOf("QT_APTOS") }; continue; }
    linhas++;
    if (idx.uf >= 0 && c[idx.uf] !== SG_UF) continue;
    if (idx.turno >= 0 && c[idx.turno] !== "1") continue; // 1º turno = eleitorado total
    const cod = munToCod.get(norm(c[idx.mun])); if (!cod) continue;
    acc.set(cod, (acc.get(cod) || 0) + (parseInt(c[idx.aptos], 10) || 0));
  }
  await new Promise((res) => proc.on("close", res));
  await q(`TRUNCATE eleitorado_sc`);
  let n = 0, tot = 0; for (const [cod, ap] of acc) { if (ap <= 0) continue; await q(`INSERT INTO eleitorado_sc (cod_ibge,eleitores,ano) VALUES ($1,$2,2022) ON CONFLICT (cod_ibge) DO UPDATE SET eleitores=EXCLUDED.eleitores,atualizado=now()`, [cod, ap]); n++; tot += ap; }
  console.log(`Eleitorado SC: ${linhas} linhas · ${n} municípios · ${tot.toLocaleString("pt-BR")} eleitores totais`);
  const fl = (await db.query(`SELECT eleitores FROM eleitorado_sc WHERE cod_ibge='4205407'`)).rows[0];
  const jv = (await db.query(`SELECT eleitores FROM eleitorado_sc WHERE cod_ibge='4209102'`)).rows[0];
  console.log(`  Florianópolis: ${Number(fl?.eleitores || 0).toLocaleString("pt-BR")} · Joinville: ${Number(jv?.eleitores || 0).toLocaleString("pt-BR")}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
