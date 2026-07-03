// FASE 1 (validação multi-município) — confirma que MSC conta 6.2.2.1.3.04 (empenhado) reconcilia com o RREO.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MSC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/msc_orcamentaria";
const ANO = process.env.ANO || "2024";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const ENTES = ["4205407", "4209102", "4202404", "4216602", "4204202", "4200051"]; // Floripa, Joinville, Blumenau, S.José, Criciúma, Abdon Batista

async function sumConta(ente, prefixo) {
  let total = 0, offset = 0;
  while (offset < 200000) {
    let j = null;
    for (let t = 0; t < 4; t++) { try { const r = await fetch(`${MSC}?an_referencia=${ANO}&me_referencia=12&id_ente=${ente}&co_tipo_matriz=MSCC&classe_conta=6&id_tv=ending_balance&offset=${offset}&limit=5000`, { signal: AbortSignal.timeout(60000) }); if (r.ok) { j = await r.json(); break; } } catch {} await sleep(2000 * (t + 1)); }
    if (!j) break;
    for (const x of (j.items || [])) {
      if (!String(x.conta_contabil).startsWith(prefixo)) continue;
      if (String(x.natureza_despesa || "").slice(2, 4) === "91") continue; // exclui intra-orçamentária (modalidade 91), como o RREO "exceto intra"
      const sinal = String(x.natureza_conta || "").toUpperCase().startsWith("D") ? 1 : -1; total += sinal * (Number(x.valor) || 0);
    }
    if (!j.hasMore) break;
    offset += 5000;
  }
  return Math.abs(total);
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  console.log(`Validação MSC(6221304) × RREO(empenhado), ${ANO}:`);
  console.log(`  ${"município".padEnd(10)} ${"MSC".padStart(10)} ${"RREO".padStart(10)} ${"dif%".padStart(7)}`);
  let okCount = 0;
  for (const ente of ENTES) {
    const rreo = Number((await db.query(`SELECT sum(empenhado) e FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND ano=$2`, [ente, Number(ANO)])).rows[0]?.e || 0);
    if (!rreo) { console.log(`  ${ente} sem RREO`); continue; }
    const msc = await sumConta(ente, "6221304");
    const dif = ((msc - rreo) / rreo) * 100;
    const ok = Math.abs(dif) < 2; if (ok) okCount++;
    console.log(`  ${ente.padEnd(10)} ${(msc / 1e6).toFixed(1).padStart(10)} ${(rreo / 1e6).toFixed(1).padStart(10)} ${dif.toFixed(2).padStart(7)} ${ok ? "✓" : "✗"}`);
  }
  console.log(`\nReconciliam (<2% dif): ${okCount}/${ENTES.length} → ${okCount === ENTES.length ? "MAPEAMENTO VALIDADO ✓" : "revisar"}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
