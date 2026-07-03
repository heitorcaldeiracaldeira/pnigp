// VALIDAÇÃO pós-reingestão — confirma que o despesa_subfuncao_sc GRAVADO (anos fechados) bate com o RREO oficial ao vivo.
// node scripts/validate_subfuncao_db.mjs   (N combos município×ano)
import fs from "fs"; import pg from "pg";
const url = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
db.on("error", () => {});
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const N = Number(process.env.N || 60);
const ANOS = (process.env.ANOS || "2019,2021,2022,2023,2024,2025").split(",").map(Number);

async function rreoTotal(ano, id) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&co_esfera=M&id_ente=${id}`, { signal: AbortSignal.timeout(40000) });
      if (r.ok) { const its = (await r.json()).items || []; const x = its.find((i) => /despesas?\s*\(exceto intra/i.test(String(i.conta || "").trim()) && i.coluna === "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)"); return x ? Number(x.valor) : null; }
    } catch {} await sleep(1500 * (t + 1));
  }
  return null;
}
async function main() {
  // amostra município×ano que JÁ tem dado gravado
  const combos = (await db.query(`SELECT cod_ibge, ano FROM (SELECT DISTINCT d.cod_ibge, d.ano FROM despesa_subfuncao_sc d JOIN entes_sc e ON e.cod_ibge=d.cod_ibge WHERE e.tipo='M' AND d.ano = ANY($1) AND d.dotacao IS NOT NULL) q ORDER BY md5(q.cod_ibge||q.ano) LIMIT $2`, [ANOS, N])).rows;
  console.log(`VALIDAÇÃO DB × SICONFI — ${combos.length} combos município×ano (anos fechados):`);
  let ok = 0, difs = [], piores = [];
  for (const c of combos) {
    const nosso = Number((await db.query(`SELECT sum(empenhado) e FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND ano=$2`, [c.cod_ibge, c.ano])).rows[0]?.e || 0);
    const oficial = await rreoTotal(c.ano, c.cod_ibge);
    if (!oficial || !nosso) continue;
    const dif = Math.abs((nosso - oficial) / oficial) * 100;
    if (dif < 0.5) ok++; difs.push(dif);
    if (dif >= 0.5) piores.push(`${c.cod_ibge}/${c.ano}: ${dif.toFixed(2)}%`);
    await sleep(100);
  }
  const n = difs.length, avg = difs.reduce((s, d) => s + d, 0) / n, mx = Math.max(...difs);
  console.log(`  reconcilia (<0,5%): ${ok}/${n} · dif média ${avg.toFixed(3)}% · máx ${mx.toFixed(2)}%`);
  if (piores.length) { console.log("  desvios:"); piores.slice(0, 10).forEach((p) => console.log("    " + p)); }
  else console.log("  ✓ todos fecham com o oficial");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
