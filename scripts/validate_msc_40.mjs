// VALIDAÇÃO — 40 municípios aleatórios: compara o total de despesa empenhada do SICONFI (RREO ao vivo)
// com o gerado pelo sistema (MSC ancorada). Também confere se a soma das partes (natureza) = total.
// node scripts/validate_msc_40.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = Number(process.env.ANO || 2024), N = Number(process.env.N || 40);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const RE_DESP = /despesas?\s*\(exceto intra/i;

async function rreoEmpenhado(id) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ANO}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&co_esfera=M&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (r.ok) { const its = (await r.json()).items || []; const x = its.find((i) => RE_DESP.test(String(i.conta || "").trim()) && i.coluna === "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)"); return x ? Number(x.valor) : null; }
    } catch {} await sleep(1500 * (t + 1));
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  // 40 municípios aleatórios COM dados gerados pelo sistema
  const ents = (await db.query(`SELECT q.cod_ibge, q.nome FROM (SELECT DISTINCT m.cod_ibge, e.nome FROM msc_despesa_sc m JOIN entes_sc e ON e.cod_ibge=m.cod_ibge WHERE m.ano=$1) q ORDER BY md5(q.cod_ibge) LIMIT $2`, [ANO, N])).rows;
  console.log(`VALIDAÇÃO ${ANO} — ${ents.length} municípios aleatórios · SICONFI (RREO ao vivo) × Sistema (MSC ancorada)\n`);
  console.log(`${"município".padEnd(26)} ${"SICONFI".padStart(11)} ${"Sistema".padStart(11)} ${"dif%".padStart(7)} ${"Σpartes=tot".padStart(11)}`);
  const difs = [], result = [];
  for (const e of ents) {
    const rows = (await db.query(`SELECT tipo, sum(valor) v FROM msc_despesa_sc WHERE cod_ibge=$1 AND ano=$2 GROUP BY tipo`, [e.cod_ibge, ANO])).rows;
    const sistema = Number(rows.find((r) => r.tipo === "natureza")?.v || 0);
    const somaFonte = Number(rows.find((r) => r.tipo === "fonte")?.v || 0);
    const siconfi = await rreoEmpenhado(e.cod_ibge);
    if (!siconfi || !sistema) { console.log(`${(e.nome || e.cod_ibge).slice(0, 26).padEnd(26)} ${siconfi ? (siconfi / 1e6).toFixed(1) : "—"} sem dado`); continue; }
    const dif = ((sistema - siconfi) / siconfi) * 100;
    const integro = Math.abs(sistema - somaFonte) < sistema * 0.001; // natureza e fonte batem entre si
    difs.push(Math.abs(dif));
    result.push({ nome: e.nome, cod: e.cod_ibge, siconfi, sistema, dif, integro });
    console.log(`${(e.nome || e.cod_ibge).slice(0, 26).padEnd(26)} ${(siconfi / 1e6).toFixed(1).padStart(11)} ${(sistema / 1e6).toFixed(1).padStart(11)} ${dif.toFixed(2).padStart(7)} ${(integro ? "✓" : "✗").padStart(11)}`);
    await sleep(120);
  }
  const ok = difs.filter((d) => d < 0.5).length, mx = Math.max(...difs), avg = difs.reduce((s, d) => s + d, 0) / difs.length;
  console.log(`\n=== RESUMO ===`);
  console.log(`Testados: ${result.length} · dif. média: ${avg.toFixed(3)}% · dif. máx: ${mx.toFixed(3)}% · dentro de 0,5%: ${ok}/${result.length}`);
  console.log(`Resultado JSON:`, JSON.stringify(result.map((r) => ({ nome: r.nome, dif: Number(r.dif.toFixed(3)) }))));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
