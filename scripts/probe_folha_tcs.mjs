// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// probe_folha_tcs.mjs — MEDE quais tribunais de contas entregam folha de pagamento dos MUNICÍPIOS jurisdicionados
// (não do próprio tribunal). O catálogo diz "Servidores"; só a resposta HTTP diz de QUEM.
//
// ⚠️ Soft-404: status 200 não prova rota ([[pnigp-sonda-soft404-falso-positivo]]). Aqui a prova é o PAYLOAD —
// precisa ser JSON/CSV com registros e, para valer, conter algum campo de ente/órgão além de nome e cargo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool } from "./_cadprev.mjs";

const ALVOS = [
  // tribunal, url, o que se espera
  ["TCE-MA", "https://app.tcema.tc.br/tce/api/saapfolha/servidor?ano=2021&mes=6&page=0&size=2", "folha jurisdicionados (SAAP, até 2021)"],
  ["TCE-MA", "https://app.tcema.tc.br/tce/api/sincfolha/2024/servidor?page=0&size=2", "folha jurisdicionados 2024 (SINC)"],
  ["TCE-RO", "https://transparencia.tcero.tc.br/api/servidores?page=0&size=2", "servidores"],
  ["TCE-RN", "https://api.tce.rn.gov.br/api/v1/servidores?limit=2", "servidores"],
  ["TCE-PE", "https://sistemas.tcepe.tc.br/DadosAbertos/ListaServidores!json", "ListaServidores"],
  ["TCE-SP", "https://transparencia.tce.sp.gov.br/api/json/municipios", "cadastro (base do resto)"],
  ["TCE-RS", "http://dados.tce.rs.gov.br/api/3/action/package_search?q=servidores&rows=5", "CKAN busca servidores"],
  ["TCE-RS", "http://dados.tce.rs.gov.br/api/3/action/package_search?q=folha&rows=5", "CKAN busca folha"],
  ["TCE-GO", "https://dadosabertos.tce.go.gov.br/api/3/action/package_search?q=servidor&rows=5", "CKAN busca servidor"],
  ["TCE-SE", "https://www.tce.se.gov.br/visualizadorRelatorios/api/Servidores", "servidores"],
  ["TCM-GO", "https://api.tcmgo.tc.br/api/servidores?page=1", "servidores"],
  ["TCE-AL", "https://www.tceal.tc.br/api/servidores", "Remuneração Servidores"],
  ["TCE-TO", "https://www.tceto.tc.br/api/servidores", "folha membros e servidores"],
];

const db = pool();
const linhas = [];

for (const [sigla, url, esperado] of ALVOS) {
  let r;
  try {
    const resp = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(45000) });
    const txt = (await resp.text()).slice(0, 4000);
    let tipo = "texto", n = null, campos = null;
    if (txt.trim().startsWith("{") || txt.trim().startsWith("[")) {
      try {
        const j = JSON.parse(txt.length < 3900 ? txt : txt + (txt.trim().startsWith("[") ? "]" : "}"));
        tipo = "json";
        const itens = j.content || j.data || j.result?.results || j.results || (Array.isArray(j) ? j : null);
        if (Array.isArray(itens)) { n = j.totalElements ?? j.result?.count ?? itens.length; campos = Object.keys(itens[0] || {}).slice(0, 14); }
      } catch { tipo = "json truncado"; }
    } else if (/<html/i.test(txt)) tipo = "html";
    r = { sigla, url, esperado, http: resp.status, tipo, n, campos, amostra: txt.slice(0, 160).replace(/\s+/g, " ") };
  } catch (e) { r = { sigla, url, esperado, erro: String(e.message).slice(0, 80) }; }
  linhas.push(r);
  const marca = r.http === 200 && r.tipo === "json" && r.campos ? "✔" : r.http === 200 ? "~" : "✖";
  console.log(`${marca} [${r.sigla}] ${r.esperado}\n    ${r.http || r.erro} · ${r.tipo || ""} · ${r.n != null ? r.n + " reg" : ""}`);
  if (r.campos) console.log(`    campos: ${r.campos.join(", ")}`);
  else if (r.amostra) console.log(`    ${r.amostra.slice(0, 120)}`);
}

await db.end();
