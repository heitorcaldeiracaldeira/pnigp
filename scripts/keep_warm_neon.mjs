// KEEP-WARM do Neon — 1 ping leve (SELECT 1) que mantém o compute ACORDADO durante o horário comercial.
// Rodado a cada 4min (< suspend 300s) pela task "PNIGP-KeepWarm-Neon" das 08h às 20h. Impede o cold-start
// de ~22s no 1º acesso do app após ociosidade (o LFC/cache fica retido enquanto o compute está de pé).
// À noite a task não roda → o compute suspende (scale-to-zero, US$0). node scripts/keep_warm_neon.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 20000 });
try { await db.query("SELECT 1"); } catch {} finally { await db.end(); }
