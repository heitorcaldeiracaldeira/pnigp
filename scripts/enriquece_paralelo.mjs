// LANÇADOR — usa TODOS OS NÚCLEOS pro enriquecimento. Abre 1 processo por core, cada um numa FATIA disjunta
// (shard por hash do processo) → sem overlap, sem corrida. Cada processo grava só a descrição (EVID off) em LOTE.
// Espera todos terminarem e relança (a task Windows chama isto). node scripts/enriquece_paralelo.mjs
import os from "os"; import { spawn } from "child_process";
import path from "path"; import { fileURLToPath } from "url"; import fs from "fs"; import pg from "pg";
import { constroiFila } from "./constroi_fila_enriquecimento.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const N = Math.max(1, (Number(process.env.NCORE) || os.cpus().length));  // todos os núcleos
// 1× REFAZ A FILA (varredura única), DEPOIS abre os shards (que só leem fatias leves da fila)
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const _db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
await constroiFila(_db); await _db.end();
console.log(`enriquecimento PARALELO: ${N} processos (1 por núcleo), fatias disjuntas por hash`);

const filhos = [];
for (let i = 0; i < N; i++) {
  const f = spawn(process.execPath, [path.join(__dirname, "enriquece_item_documento.mjs")], {
    env: { ...process.env, NSHARD: String(N), SHARD: String(i), CONC: "2" },  // CONC baixo: cada core é 1 processo
    stdio: ["ignore", "inherit", "inherit"],
  });
  filhos.push(new Promise((res) => f.on("exit", (code) => { console.log(`[shard ${i}] saiu (${code})`); res(code); })));
}
await Promise.all(filhos);
console.log("todos os shards terminaram.");
