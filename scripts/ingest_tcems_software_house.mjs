// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_tcems_software_house.mjs — o CADASTRO OFICIAL do ERP de cada um dos 79 municípios de MS, direto do
// e-Sfinge do TCE-MS (Qlik Sense hub ANÔNIMO: painel.tce.ms.gov.br, app 5c55fe65-…, fluxo "Everyone").
//
// POR QUE isto vale mais que sondar portal: é o próprio tribunal declarando quem processa a contabilidade de
// cada prefeitura. Substitui adivinhação por cadastro — Fiorilli 32, Betha 18, Quality 13 dos 79.
// ⚠️ RESSALVA: é o fornecedor da REMESSA CONTÁBIL (e-Sfinge). O sistema de FOLHA pode ser outro no mesmo
// município — isto é a melhor PISTA oficial, não prova ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// Técnica: WebSocket JSON-RPC no Engine (OpenDoc → CreateSessionObject → GetHyperCubeData), a mesma receita do
// Farol do TCE-SC. 🚨 O hypercube PRECISA de medida: sem ela o Qlik devolve o produto cartesiano
// (79 municípios × 20 empresas cadastradas = 1.580 pares falsos).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const APP = "5c55fe65-6126-4e04-8b1f-6b5d1e0bbab7";

await q(`create table if not exists tc_ms_software_house (
  cod_ibge text primary key, municipio text, municipio_fonte text, razao_social text, cnpj text,
  regiao text, conselheiro text, _coletado_em timestamptz default now()
)`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", viewport: { width: 1600, height: 1000 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
const page = await ctx.newPage();
await page.goto(`https://painel.tce.ms.gov.br/sense/app/${APP}`, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
await page.waitForTimeout(12000);

const linhas = await page.evaluate(async (APP) => {
  const rpc = (() => {
    const ws = new WebSocket(`wss://${location.host}/app/${APP}`);
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const pronto = new Promise((ok, no) => { ws.onopen = () => ok(); ws.onerror = () => no(new Error("ws erro")); });
    return { pronto, call: (handle, method, params) => new Promise((ok, no) => {
      const i = ++id; pend.set(i, (m) => (m.error ? no(new Error(m.error.message)) : ok(m.result)));
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: i, handle, method, params }));
      setTimeout(() => { if (pend.has(i)) { pend.delete(i); no(new Error("timeout " + method)); } }, 45000);
    }) };
  })();
  await rpc.pronto;
  const doc = await rpc.call(-1, "OpenDoc", [APP]);
  const h = doc.qReturn.qHandle;
  const o = await rpc.call(h, "CreateSessionObject", [{ qInfo: { qType: "t" }, qHyperCubeDef: {
    qDimensions: ["municipio", "razao_social", "cnpj", "regiao", "conselheiro"].map((f) => ({ qDef: { qFieldDefs: ["[" + f + "]"] } })),
    qMeasures: [{ qDef: { qDef: "Count([id])" } }], qInitialDataFetch: [] } }]);
  const d = await rpc.call(o.qReturn.qHandle, "GetHyperCubeData", ["/qHyperCubeDef", [{ qTop: 0, qLeft: 0, qWidth: 6, qHeight: 1600 }]]);
  return (d.qDataPages?.[0]?.qMatrix || []).map((r) => r.map((c) => c.qText));
}, APP);
await browser.close();

console.log(`[tce-ms] ${linhas.length} linhas do e-Sfinge`);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, "").trim();
const muns = (await q(`select cod_ibge, nome from municipios_br where uf='MS'`)).rows;
const porNome = new Map(muns.map((m) => [norm(m.nome).replace(/ MS$/, ""), m]));

let ok = 0, semCasar = [];
for (const [municipio, razao, cnpj, regiao, conselheiro, n] of linhas) {
  if (!municipio || municipio === "-" || !razao || razao === "-" || +n <= 0) continue;
  const m = porNome.get(norm(municipio)) || porNome.get(norm(municipio).replace(/U$/, ""));   // MARACAJÚ/MARACAJU
  if (!m) { semCasar.push(municipio); continue; }
  await q(`insert into tc_ms_software_house (cod_ibge, municipio, municipio_fonte, razao_social, cnpj, regiao, conselheiro)
    values ($1,$2,$3,$4,$5,$6,$7) on conflict (cod_ibge) do update set razao_social=excluded.razao_social,
    cnpj=excluded.cnpj, regiao=excluded.regiao, conselheiro=excluded.conselheiro, _coletado_em=now()`,
    [m.cod_ibge, m.nome, municipio, razao, cnpj, regiao, conselheiro]);
  ok++;
}
console.log(`[tce-ms] ${ok} municípios gravados · sem casar: ${semCasar.join(", ") || "nenhum"}`);
console.table((await q(`select razao_social, count(*) municipios from tc_ms_software_house group by 1 order by 2 desc`)).rows);
console.log("\ncruzamento com a folha já coletada:");
console.table((await q(`
  with col as (select distinct left(cod_ibge,7) c from folha_servidores_scpi where left(cod_ibge,2)='50'
               union select distinct left(cod_ibge,7) from folha_servidores_betha where left(cod_ibge,2)='50'
               union select distinct left(cod_ibge,7) from folha_servidores_ipm where left(cod_ibge,2)='50'
               union select distinct left(cod_ibge,7) from folha_servidores_megasoft where left(cod_ibge,2)='50')
  select s.razao_social, count(*) municipios, count(c.c) com_folha, count(*)-count(c.c) faltam
    from tc_ms_software_house s left join col c on c.c = s.cod_ibge group by 1 order by 4 desc`)).rows);
await db.end();
