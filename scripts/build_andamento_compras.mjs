// DERIVADA (andar 2, Lei 1) — app.andamento_compras_sc: por município × modalidade × STATUS DO ITEM × valor.
// O andamento vive no ITEM (situacao: Homologado/Em andamento/Deserto/Fracassado), não no processo (98% "Divulgada").
// FULL rebuild. A SQL vive em _derivadas_compras.mjs (mesma da re-derivação por fatia). Reconstruível: DROP + rebuild.
//   node scripts/build_andamento_compras.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { deriveAndamento, TETO_ITEM } from "./_derivadas_compras.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });

async function main() {
  console.log(`agregando itens_sc × contratacoes_sc (teto R$ ${(TETO_ITEM/1e6)} mi/item · pode levar ~1 min)…`);
  const cx = await db.connect();
  try { await cx.query("BEGIN"); await deriveAndamento(cx, null); await cx.query("COMMIT"); }
  catch (e) { await cx.query("ROLLBACK"); throw e; } finally { cx.release(); }

  const r = (await db.query(`SELECT status, sum(n_itens)::bigint n, round(sum(valor))::bigint v FROM app.andamento_compras_sc GROUP BY 1 ORDER BY sum(valor) DESC`)).rows;
  const tot = (await db.query(`SELECT sum(n_itens)::bigint n, round(sum(valor))::bigint v, sum(n_implausivel)::int impl, count(distinct cod_ibge)::int munis FROM app.andamento_compras_sc`)).rows[0];
  console.log(`\n✔ app.andamento_compras_sc criada · ${Number(tot.n).toLocaleString()} itens · ${tot.munis} municípios · R$ ${(Number(tot.v)/1e9).toFixed(1)} bi`);
  console.log(`  (${tot.impl} itens com valor implausível EXCLUÍDOS do valor — contados na quantidade, preservados no espelho)`);
  console.log("\nstatus (SC) — quantidade · valor:");
  for (const x of r) console.log(`  ${String(x.status).padEnd(20)} ${Number(x.n).toLocaleString().padStart(12)} itens  ·  R$ ${(Number(x.v)/1e9).toFixed(2)} bi`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
