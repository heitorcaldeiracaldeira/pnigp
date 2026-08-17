import { pool, withRetry } from "./scripts/_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const t0 = Date.now();
while (Date.now() - t0 < 900000) {
  const n = (await q("select count(*) n from folha_servidores_agape where cod_ibge='3204203'")).rows[0].n;
  process.stdout.write(`\r[${Math.round((Date.now()-t0)/1000)}s] Piúma=${n}   `);
  if (+n > 0) break;
  await new Promise(s => setTimeout(s, 30000));
}
console.log("");
await db.end();
