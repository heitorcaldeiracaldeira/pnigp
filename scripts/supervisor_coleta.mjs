// SUPERVISOR auto-recuperável da coleta PNCP/SC.
// Um único processo é dono do ciclo de vida: roda cada ETL como filho, monitora o PROGRESSO REAL
// no Neon e, se estagnar (sem avanço por STALL_MIN) ou o filho cair, mata e RELIGA a mesma etapa
// (tudo é resumível). Grava heartbeat auditável em coleta_heartbeat p/ a tela /coleta. Sem vigília humana.
// node scripts/supervisor_coleta.mjs
import fs from "fs";
import { spawn, execSync } from "child_process";
import pg from "pg";

const ROOT = process.cwd();
const LOG = "C:/Users/PC/.claude/jobs/2783694f/tmp/chain.log";
const DATABASE_URL = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const STALL_MIN = 30;                 // sem progresso por mais que isso => religa (folga p/ o Estado, que tem muitas páginas)
const STALL_MS = STALL_MIN * 60 * 1000;
const CHECK_MS = 60 * 1000;           // checa progresso a cada 1 min
const MAX_TENTATIVAS = 80;            // backstop contra loop infinito numa etapa patológica

const log = (m) => {
  const line = `[SUP ${new Date().toISOString()}] ${m}\n`;
  try { fs.appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
};

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
db.on("error", () => {});

async function ensureHb() {
  await db.query(`CREATE TABLE IF NOT EXISTS coleta_heartbeat (
    id int PRIMARY KEY, ts timestamptz, progresso bigint, etapa text, reinicios int, msg text )`);
  await db.query(`INSERT INTO coleta_heartbeat (id,ts,progresso,etapa,reinicios,msg)
    VALUES (1, now(), 0, 'iniciando', 0, '') ON CONFLICT (id) DO NOTHING`);
}
async function progresso() {
  // queries SEPARADAS: referenciar itens_sc numa só query falha no parse enquanto a tabela não existe
  const base = await db.query(`SELECT
      (SELECT count(*) FROM compras_sc)
    + (SELECT count(*) FROM compras_sc_vazios)
    + (SELECT count(*) FROM pca_sc_feitos) AS p`);
  let extra = 0;
  try { extra += Number((await db.query(`SELECT count(*) c FROM itens_sc`)).rows[0].c); } catch {}
  try { extra += Number((await db.query(`SELECT count(*) c FROM itens_sc_feitos`)).rows[0].c); } catch {}
  return Number(base.rows[0].p) + extra;
}
async function hb(etapa, prog, reinicios, msg) {
  try { await db.query(`UPDATE coleta_heartbeat SET ts=now(), progresso=$1, etapa=$2, reinicios=$3, msg=$4 WHERE id=1`, [prog, etapa, reinicios, msg]); } catch {}
}
function killTree(pid) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }); } catch {} }

const STEPS = [
  { name: "Compras 2025", file: "scripts/ingest_compras_sc.mjs", env: { ANO: "2025" } },
  { name: "Compras 2024", file: "scripts/ingest_compras_sc.mjs", env: { ANO: "2024" } },
  { name: "Compras 2023", file: "scripts/ingest_compras_sc.mjs", env: { ANO: "2023" } },
  { name: "Compras 2022", file: "scripts/ingest_compras_sc.mjs", env: { ANO: "2022" } },
  { name: "PCA reset", file: "scripts/_reset_pca_feitos.mjs", env: {}, noMonitor: true },
  { name: "PCA 2024-2027", file: "scripts/ingest_pca_sc.mjs", env: { ANOS: "2024,2025,2026,2027" } },
  { name: "Itens", file: "scripts/ingest_itens_sc.mjs", env: {} },
  { name: "Validacao", file: "scripts/validar_consistencia.mjs", env: {}, noMonitor: true },
];

let reinicios = 0;

function runStep(step) {
  return new Promise((resolve) => {
    log(`>>> INICIANDO ${step.name}`);
    const out = fs.createWriteStream(LOG, { flags: "a" });
    const child = spawn(process.execPath, [step.file], { cwd: ROOT, env: { ...process.env, ...step.env }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    let last = -1, lastChange = Date.now(), settled = false, timer = null;
    const finish = (r) => { if (settled) return; settled = true; if (timer) clearInterval(timer); resolve(r); };

    if (!step.noMonitor) {
      timer = setInterval(async () => {
        let p;
        try { p = await progresso(); } catch { return; } // banco indisponível neste tick: não conta como estagnação
        if (p !== last) { last = p; lastChange = Date.now(); }
        const idleS = Math.round((Date.now() - lastChange) / 1000);
        await hb(step.name, p, reinicios, idleS > STALL_MIN * 30 ? `quieto há ${idleS}s` : "ok");
        if (Date.now() - lastChange > STALL_MS) {
          reinicios++;
          log(`!!! ESTAGNADO em ${step.name} (sem progresso há ${idleS}s) — matando PID ${child.pid} e religando (reinício #${reinicios})`);
          await hb(step.name, p, reinicios, `religado por estagnação (${idleS}s)`);
          killTree(child.pid);
          finish("retry");
        }
      }, CHECK_MS);
    }
    child.on("exit", (code) => { log(`<<< ${step.name} terminou (código ${code})`); finish(code === 0 ? "done" : "retry"); });
    child.on("error", (e) => { log(`<<< erro ao iniciar ${step.name}: ${e}`); finish("retry"); });
  });
}

async function main() {
  await ensureHb();
  log(`############ SUPERVISOR INICIADO (stall=${STALL_MIN}min) ############`);
  for (const step of STEPS) {
    let tent = 0;
    while (true) {
      tent++;
      if (tent > MAX_TENTATIVAS) { log(`!! ${step.name} excedeu ${MAX_TENTATIVAS} tentativas — seguindo adiante`); break; }
      const r = await runStep(step);
      if (r === "done") break;
      log(`... religando ${step.name} em 5s (tentativa ${tent})`);
      await new Promise((s) => setTimeout(s, 5000));
    }
  }
  const p = await progresso();
  await hb("concluido", p, reinicios, "CADEIA CONCLUIDA");
  log(`############ CADEIA CONCLUIDA — progresso=${p} | reinícios=${reinicios} ############`);
  await db.end();
}
main().catch((e) => { log("ERRO FATAL supervisor: " + e); process.exit(1); });
