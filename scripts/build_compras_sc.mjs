// DERIVADA (andar 2, Lei 1) — compras_sc reconstruída DO ESPELHO (contratacoes_sc), sem tocar a API do PNCP.
// FULL rebuild. A SQL vive em _derivadas_compras.mjs (mesma usada pela re-derivação por fatia). Roda em segundos.
//   node scripts/build_compras_sc.mjs
// Outlier: processo > R$ 1 bi entra em app.compra_processo_implausivel_sc (excluído do valor, intacto no espelho).
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { deriveCompras, TETO_PROC } from "./_derivadas_compras.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

async function main() {
  const antes = (await db.query(`SELECT ano, count(*) n, round(sum(valor_homologado))::bigint v FROM compras_sc GROUP BY 1 ORDER BY 1`)).rows;
  console.log(`reconstruindo compras_sc do espelho (contratacoes_sc) · teto R$ ${(TETO_PROC/1e9)} bi/processo…`);
  const cx = await db.connect();
  try { await cx.query("BEGIN"); await deriveCompras(cx, null); await cx.query("COMMIT"); }
  catch (e) { await cx.query("ROLLBACK"); throw e; } finally { cx.release(); }

  const depois = (await db.query(`SELECT ano, count(*) n, round(sum(valor_homologado))::bigint v FROM compras_sc GROUP BY 1 ORDER BY 1`)).rows;
  const tot = (await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) ib, round(sum(valor_homologado))::bigint v, sum(n_implausivel)::int impl FROM compras_sc`)).rows[0];
  const nImpl = (await db.query(`SELECT count(*) n, round(sum(greatest(valor_estimado,valor_homologado)))::bigint v FROM app.compra_processo_implausivel_sc`)).rows[0];
  console.log(`\n✔ compras_sc reconstruída · ${tot.n} linhas · ${tot.ib} entes · R$ ${(Number(tot.v)/1e9).toFixed(1)} bi homologado (limpo)`);
  console.log(`  ${nImpl.n} processos implausíveis EXCLUÍDOS do valor (R$ ${(Number(nImpl.v)/1e9).toFixed(1)} bi bruto) — listados em app.compra_processo_implausivel_sc, intactos no espelho`);
  const mapa = {}; for (const r of antes) mapa[r.ano] = r;
  console.log("\nano   linhas(antes→depois)   homologado (antes → LIMPO)");
  for (const d of depois) {
    const a = mapa[d.ano] || { n: 0, v: 0 };
    console.log(`${d.ano}   ${String(a.n).padStart(4)} → ${String(d.n).padStart(4)}         R$ ${(Number(a.v)/1e6).toFixed(0).padStart(8)} mi → ${(Number(d.v)/1e6).toFixed(0).padStart(8)} mi`);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
