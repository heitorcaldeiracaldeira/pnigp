// ETL combinado: indicadores Previne + ISF (SISAB indicadorPainel) — 10 quadrimestres + ingest série.
import { spawn } from "child_process";
const run = (args) => new Promise((res, rej) => { const c = spawn(process.execPath, args, { cwd: "C:/Users/PC/pnigp", stdio: "inherit" }); c.on("exit", (code) => code === 0 ? res() : rej(new Error("exit " + code))); c.on("error", rej); });
for (const q of ["202204","202208","202212","202304","202308","202312","202404","202408","202412","202504"]) await run(["scripts/scrape_sisab_indicadores_todos.mjs", "SC", q]);
await run(["scripts/ingest_indicadores_serie.mjs"]);
