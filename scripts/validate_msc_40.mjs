// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO MSC × SICONFI — a PROVA de que a despesa que servimos bate com o número OFICIAL do Tesouro.
//
// POR QUÊ esta verificação existe: nós derivamos a despesa empenhada de cada município da MSC (Matriz de Saldos
// Contábeis, o razão contábil bruto). O gestor/auditor só confia se esse total REPRODUZIR o RREO — o demonstrativo
// oficial que o próprio município publica no SICONFI. Então batemos, ao vivo, o nosso total contra o RREO do Tesouro.
// Duas checagens independentes:
//   1. EXTERNA  — Sistema (MSC ancorada) ≈ SICONFI (RREO ao vivo). Prova fidelidade à fonte oficial.
//   2. INTERNA  — Σ(por natureza) = Σ(por fonte). Prova que a nossa agregação não perdeu nem duplicou parte.
//
// NACIONAL-READY: UF via _uf.mjs. `UF=SP node scripts/validate_msc_40.mjs` valida São Paulo. Read-only (não grava).
// node scripts/validate_msc_40.mjs   (ANO=2024 N=40 opcionais)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { COD_ESTADO, NOME_ESTADO } from "./_uf.mjs";   // filtra a UF alvo pelo código IBGE de 2 dígitos
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = Number(process.env.ANO || 2024), N = Number(process.env.N || 40);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
// A linha do RREO que queremos: "Despesas (exceto intra-orçamentárias)". POR QUÊ "exceto intra": a despesa intra-
// orçamentária é gasto de um órgão com OUTRO do mesmo ente (ex.: prefeitura paga o RPPS) — contá-la infla o total com
// dinheiro que não saiu do ente. O RREO oficial separa justamente por isso; comparamos a mesma base.
const RE_DESP = /despesas?\s*\(exceto intra/i;

async function rreoEmpenhado(id) {
  for (let t = 0; t < 4; t++) {
    try {
      // RREO Anexo 02 (despesa por função) · nr_periodo=6 (6º bimestre = ano fechado) · co_esfera=M (municipal) ·
      // id_ente = cod_ibge. Coluna "EMPENHADAS ATÉ O BIMESTRE (b)" = o empenho ACUMULADO no ano — a base comparável.
      const r = await fetch(`${SIC}?an_exercicio=${ANO}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&co_esfera=M&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (r.ok) { const its = (await r.json()).items || []; const x = its.find((i) => RE_DESP.test(String(i.conta || "").trim()) && i.coluna === "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)"); return x ? Number(x.valor) : null; }
    } catch {} await sleep(1500 * (t + 1));
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  // Amostra de N municípios da UF alvo QUE TÊM dado gerado. ORDER BY md5(cod_ibge) = "aleatório" DETERMINÍSTICO:
  // POR QUÊ não random() puro — assim a mesma amostra se repete entre execuções, e dá pra comparar rodada a rodada.
  // left(cod_ibge,2)=COD_ESTADO = só a UF alvo (nacional-safe, mesmo que msc_despesa_sc passe a ter o Brasil todo).
  const ents = (await db.query(`SELECT q.cod_ibge, q.nome FROM (SELECT DISTINCT m.cod_ibge, e.nome FROM msc_despesa_sc m JOIN entes_sc e ON e.cod_ibge=m.cod_ibge WHERE m.ano=$1 AND left(m.cod_ibge,2)=$3) q ORDER BY md5(q.cod_ibge) LIMIT $2`, [ANO, N, COD_ESTADO])).rows;
  console.log(`VALIDAÇÃO ${NOME_ESTADO} ${ANO} — ${ents.length} municípios · SICONFI (RREO ao vivo) × Sistema (MSC ancorada)\n`);
  console.log(`${"município".padEnd(26)} ${"SICONFI".padStart(11)} ${"Sistema".padStart(11)} ${"dif%".padStart(7)} ${"Σpartes=tot".padStart(11)}`);
  const difs = [], result = [];
  for (const e of ents) {
    // Sistema: nosso total, em duas quebras independentes — por 'natureza' e por 'fonte'. Batê-las é a checagem INTERNA.
    const rows = (await db.query(`SELECT tipo, sum(valor) v FROM msc_despesa_sc WHERE cod_ibge=$1 AND ano=$2 GROUP BY tipo`, [e.cod_ibge, ANO])).rows;
    const sistema = Number(rows.find((r) => r.tipo === "natureza")?.v || 0);
    const somaFonte = Number(rows.find((r) => r.tipo === "fonte")?.v || 0);
    const siconfi = await rreoEmpenhado(e.cod_ibge);   // o número OFICIAL, ao vivo
    if (!siconfi || !sistema) { console.log(`${(e.nome || e.cod_ibge).slice(0, 26).padEnd(26)} ${siconfi ? (siconfi / 1e6).toFixed(1) : "—"} sem dado`); continue; }
    const dif = ((sistema - siconfi) / siconfi) * 100;                     // checagem EXTERNA: % de desvio do oficial
    const integro = Math.abs(sistema - somaFonte) < sistema * 0.001;       // checagem INTERNA: natureza e fonte batem (±0,1%)
    difs.push(Math.abs(dif));
    result.push({ nome: e.nome, cod: e.cod_ibge, siconfi, sistema, dif, integro });
    console.log(`${(e.nome || e.cod_ibge).slice(0, 26).padEnd(26)} ${(siconfi / 1e6).toFixed(1).padStart(11)} ${(sistema / 1e6).toFixed(1).padStart(11)} ${dif.toFixed(2).padStart(7)} ${(integro ? "✓" : "✗").padStart(11)}`);
    await sleep(120);   // gentileza com a API do Tesouro (não estourar)
  }
  // Aprovação: dif < 0,5%. POR QUÊ 0,5% e não 0%: o RREO ao vivo pode ter retificação/arredondamento posterior ao
  // nosso snapshot; abaixo de 0,5% é ruído de tempo/arredondamento, acima é discrepância real que merece investigação.
  const ok = difs.filter((d) => d < 0.5).length, mx = Math.max(...difs), avg = difs.reduce((s, d) => s + d, 0) / difs.length;
  console.log(`\n=== RESUMO ===`);
  console.log(`Testados: ${result.length} · dif. média: ${avg.toFixed(3)}% · dif. máx: ${mx.toFixed(3)}% · dentro de 0,5%: ${ok}/${result.length}`);
  console.log(`Resultado JSON:`, JSON.stringify(result.map((r) => ({ nome: r.nome, dif: Number(r.dif.toFixed(3)) }))));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
