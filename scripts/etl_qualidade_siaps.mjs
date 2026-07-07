// ETL combinado: novo modelo SIAPS (Qualidade 15 indicadores + Vínculo/CVAT) — scrape + 3 ingests.
import { spawn } from "child_process";
const run = (args) => new Promise((res, rej) => { const c = spawn(process.execPath, args, { cwd: "C:/Users/PC/pnigp", stdio: "inherit" }); c.on("exit", (code) => code === 0 ? res() : rej(new Error("exit " + code))); c.on("error", rej); });
await run(["scripts/scrape_siaps_qualidade.mjs", "SC", "2025Q2,2025Q3,2026Q1"]);
await run(["scripts/ingest_qualidade_aps.mjs"]);
await run(["scripts/ingest_qualidade_indicadores.mjs"]);
await run(["scripts/ingest_cvat_aps.mjs"]);
