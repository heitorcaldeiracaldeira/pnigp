// BUSCA DIÁRIA DO PNCP — roda todo dia os coletores do PNCP do ano corrente (compras, contratos, atas), que são
// idempotentes (upsert). Captura as contratações novas publicadas. Sequencial, com supervisão simples e registro no
// etl_catalogo. Agendar via Agendador de Tarefas do Windows (ver coleta_diaria_pncp.bat).
// node scripts/coleta_diaria_pncp.mjs
import fs from "fs"; import path from "path"; import { spawn } from "child_process"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();

// coletores do PNCP a rodar diariamente (ano corrente; idempotentes). processos/itens (todos os anos) ficam no
// orquestrador (pesados demais p/ diário) — aqui é o "acompanhamento" das contratações novas.
const JOBS = [
  { id: "compras", script: "scripts/ingest_compras_sc.mjs", env: { ANO: String(ANO), REFRESH: "1" } },
  { id: "contratos", script: "scripts/ingest_contratos_sc.mjs", env: { ANOS: String(ANO), APPEND: "1", REFRESH: "1" } },
  { id: "atas", script: "scripts/ingest_atas_sc.mjs", env: {} },
];

const run = (job) => new Promise((res) => {
  const t0 = Date.now();
  const c = spawn(process.execPath, [job.script], { cwd: ROOT, env: { ...process.env, ...job.env }, stdio: "ignore" });
  c.on("exit", (code) => res({ id: job.id, ok: code === 0, code, seg: Math.round((Date.now() - t0) / 1000) }));
  c.on("error", () => res({ id: job.id, ok: false, code: "spawn", seg: 0 }));
});

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  console.log(`[${new Date().toISOString().slice(0, 16)}] busca diária do PNCP — ano ${ANO}`);
  const r = [];
  for (const job of JOBS) { const x = await run(job); r.push(x); console.log(`  ${x.ok ? "✔" : "✖"} ${x.id} (${x.seg}s${x.ok ? "" : ` · exit ${x.code}`})`); }
  const status = r.every((x) => x.ok) ? "ok" : `parcial (${r.filter((x) => !x.ok).map((x) => x.id).join(",")})`;
  await db.query(`INSERT INTO etl_catalogo (id, label, api, ultima_exec, ultimo_status, atualizado_em)
    VALUES ('coleta_diaria_pncp','Busca diária do PNCP (compras/contratos/atas — ano corrente)','pncp',now(),$1,now())
    ON CONFLICT (id) DO UPDATE SET ultima_exec=now(), ultimo_status=$1, atualizado_em=now()`, [status]).catch(() => {});
  console.log(`  status: ${status}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
