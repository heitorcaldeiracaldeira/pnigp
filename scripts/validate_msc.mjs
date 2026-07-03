// FASE 1 — validação MSC↔RREO. Baixa a MSC orçamentária completa de um ente/ano e procura a agregação
// que reproduz o empenhado/dotação do RREO. node scripts/validate_msc.mjs
const MSC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/msc_orcamentaria";
const ENTE = process.env.ENTE || "4205407", ANO = process.env.ANO || "2024", MES = process.env.MES || "12";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function fetchAll(tv) {
  let all = [], offset = 0;
  while (offset < 200000) {
    let j = null;
    for (let t = 0; t < 4; t++) { try { const r = await fetch(`${MSC}?an_referencia=${ANO}&me_referencia=${MES}&id_ente=${ENTE}&co_tipo_matriz=MSCC&classe_conta=6&id_tv=${tv}&offset=${offset}&limit=5000`, { signal: AbortSignal.timeout(60000) }); if (r.ok) { j = await r.json(); break; } } catch {} await sleep(2000 * (t + 1)); }
    if (!j) break;
    all = all.concat(j.items || []);
    if (!j.hasMore) break;
    offset += 5000;
  }
  return all;
}

function aggrega(items, label) {
  // soma por conta (9 díg) com sinal pela natureza_conta (D positivo, C negativo)
  const byConta = {};
  for (const x of items) {
    const c = String(x.conta_contabil).slice(0, 9);
    const sinal = String(x.natureza_conta || "").toUpperCase().startsWith("D") ? 1 : -1;
    byConta[c] = (byConta[c] || 0) + sinal * (Number(x.valor) || 0);
  }
  console.log(`\n=== ${label} (${items.length} itens) — saldo por conta (sinal D+/C−), R$ mi ===`);
  Object.entries(byConta).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 14).forEach(([c, v]) => console.log(`  ${c}: ${(v / 1e6).toFixed(1)}`));
  return byConta;
}

async function main() {
  console.log(`MSC ${ENTE}/${ANO}/m${MES} — âncora RREO esperada: empenhado/dotação`);
  const eb = await fetchAll("ending_balance");
  const b = aggrega(eb, "ending_balance");
  // candidatos (PCASP): 6.2.1.x = crédito (dotação); 6.2.2.1.1 = disponível; empenhado ≈ dotação − disponível
  const soma = (pref) => Object.entries(b).filter(([c]) => c.startsWith(pref)).reduce((s, [, v]) => s + v, 0);
  const credito = soma("621"), disponivel = soma("622110"), empenhado622 = soma("6221201") + soma("622130") + soma("622920");
  console.log(`\n--- DERIVAÇÕES (R$ mi) ---`);
  console.log(`  Σ621* (crédito/dotação?): ${(credito / 1e6).toFixed(1)}`);
  console.log(`  Σ622110* (disponível?): ${(disponivel / 1e6).toFixed(1)}`);
  console.log(`  crédito − disponível (≈empenhado?): ${((credito - disponivel) / 1e6).toFixed(1)}`);
  console.log(`  Σ contas de empenho (62212/62213/62292): ${(empenhado622 / 1e6).toFixed(1)}`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
