// Pré-aquece o cache de compras (PNCP) das maiores cidades de SC + Estado,
// chamando a API de produção sequencialmente (usa o IP do Vercel). node scripts/warm_compras.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://pnigp.vercel.app/api/compras-sc";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

const db = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const rows = (await db.query(
  `SELECT cod_ibge, nome, populacao FROM entes_sc WHERE tipo='E'
   UNION ALL
   SELECT cod_ibge, nome, populacao FROM entes_sc WHERE tipo='M' ORDER BY populacao DESC NULLS LAST`,
)).rows;
await db.end();
// estado + 30 maiores municípios
const alvos = [rows.find((r) => r.cod_ibge === "42"), ...rows.filter((r) => r.cod_ibge !== "42").slice(0, 30)].filter(Boolean);
console.log(`Pré-aquecendo ${alvos.length} entes (Estado + 30 maiores)...`);
let ok = 0, vazio = 0, falha = 0;
for (const a of alvos) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/${a.cod_ibge}`, { signal: AbortSignal.timeout(130000) });
    const d = await r.json();
    const s = (Date.now() - t0) / 1000;
    if (d && d.n_contratos > 0) { ok++; console.log(`✓ ${a.nome.padEnd(22)} n=${String(d.n_contratos).padStart(4)} R$${(d.valor_homologado / 1e6).toFixed(0)}mi (${s.toFixed(0)}s)`); }
    else { vazio++; console.log(`· ${a.nome.padEnd(22)} sem dados (${s.toFixed(0)}s)`); }
  } catch (e) { falha++; console.log(`✗ ${a.nome.padEnd(22)} ${e.message}`); }
  await sleep(1500);
}
console.log(`\nConcluído: ok=${ok} | sem dados=${vazio} | falhas=${falha}`);
