// probe_folha_tcema.mjs — o TCE-MA entrega folha NOMINAL dos 217 municípios com lotação, cargo e salário?
// A API é Spring paginado (?page=&size=, devolve {content,totalElements}). Mede ano disponível e payload.
const BASE = "https://app.tcema.tc.br/tce/api";

async function pega(rota) {
  const u = `${BASE}${rota}${rota.includes("?") ? "&" : "?"}page=0&size=3`;
  try {
    const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) return { rota, http: r.status };
    const j = await r.json();
    const itens = j.content || j.data || (Array.isArray(j) ? j : []);
    return { rota, http: 200, total: j.totalElements ?? j.total ?? itens.length, campos: Object.keys(itens[0] || {}), amostra: itens[0] };
  } catch (e) { return { rota, erro: String(e.message).slice(0, 70) }; }
}

const rotas = [];
for (const ano of ["2025", "2024"]) {
  for (const rec of ["servidor", "cargofuncao", "contracheque", "folhapagamento", "remuneracao", "matriculaservidor"]) {
    rotas.push(`/sincfolha/${ano}/${rec}`);
  }
}
rotas.push("/sincfiscal/2025/unidadegestora", "/sincfiscal/2024/unidadegestora");

for (const rota of rotas) {
  const r = await pega(rota);
  if (r.http !== 200) { console.log(`✖ ${rota} → ${r.http || r.erro}`); continue; }
  console.log(`\n✔ ${rota} → ${Number(r.total).toLocaleString("pt-BR")} registros`);
  console.log("   campos: " + r.campos.join(", "));
  console.log("   " + JSON.stringify(r.amostra).slice(0, 500));
}
