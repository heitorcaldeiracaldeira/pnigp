// ETL combinado: produção da APS (SISAB) — scrape série + ingest. Idempotente (TRUNCATE+reload).
import { spawn } from "child_process";
const run = (args) => new Promise((res, rej) => { const c = spawn(process.execPath, args, { cwd: "C:/Users/PC/pnigp", stdio: "inherit" }); c.on("exit", (code) => code === 0 ? res() : rej(new Error("exit " + code))); c.on("error", rej); });
await run(["scripts/scrape_sisab_serie.mjs", "SC", "202101"]);
await run(["scripts/ingest_producao_aps_serie.mjs"]);
