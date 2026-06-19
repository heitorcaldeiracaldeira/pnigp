// Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored).
// Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump portátil.
// Mantém os últimos 7 backups. node scripts/backup_neon.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, query_timeout: 120000, statement_timeout: 120000 });
const q = (s, p) => db.query(s, p).then((r) => r.rows);
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const LOTE = 10000;

async function dumpTabela(tab, dir) {
  const file = path.join(dir, `${tab}.jsonl.gz`);
  const ws = fs.createWriteStream(file); const gz = zlib.createGzip(); gz.pipe(ws);
  let off = 0, total = 0;
  for (;;) {
    const rows = await q(`SELECT * FROM "${tab}" ORDER BY ctid LIMIT ${LOTE} OFFSET ${off}`);
    if (!rows.length) break;
    for (const r of rows) gz.write(JSON.stringify(r) + "\n");
    total += rows.length; off += rows.length;
    if (rows.length < LOTE) break;
  }
  gz.end(); await new Promise((res) => ws.on("finish", res));
  return total;
}

async function main() {
  const baseDir = path.join(ROOT, "backups");
  const dir = path.join(baseDir, stamp);
  fs.mkdirSync(dir, { recursive: true });
  // schema (colunas de todas as tabelas)
  const schema = await q(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
  fs.writeFileSync(path.join(dir, "_schema.json"), JSON.stringify(schema, null, 0));
  // dados
  const tabs = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`)).map((r) => r.table_name);
  let totalReg = 0; const resumo = {};
  for (const t of tabs) {
    try { const n = await dumpTabela(t, dir); resumo[t] = n; totalReg += n; console.log(`  ${t}: ${n.toLocaleString("pt-BR")}`); }
    catch (e) { console.log(`  ! ${t}: ${String(e).slice(0, 50)}`); resumo[t] = "erro"; }
  }
  fs.writeFileSync(path.join(dir, "_manifest.json"), JSON.stringify({ ts: stamp, total_registros: totalReg, tabelas: resumo }, null, 2));
  // retenção: manter os últimos 7
  const dirs = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  for (const d of dirs.slice(0, Math.max(0, dirs.length - 7))) { fs.rmSync(path.join(baseDir, d), { recursive: true, force: true }); console.log(`  (retenção) removido ${d}`); }
  console.log(`Backup concluído: ${dir} | ${tabs.length} tabelas | ${totalReg.toLocaleString("pt-BR")} registros`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
