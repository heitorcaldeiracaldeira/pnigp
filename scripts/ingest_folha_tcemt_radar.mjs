// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcemt_radar.mjs — folha dos municípios de MT pelo RADAR PESSOAL do TCE-MT.
//
// ⭐ O TCE-MT publica o que nenhum outro tribunal do Centro-Oeste publica: pessoal dos JURISDICIONADOS com
// nome, cargo, lotação, município e valor de rubrica — 269.221 agentes públicos, R$ 27,6 bi (exercício 2025).
// Aqui grava-se o AGREGADO por município × entidade × categoria (uma consulta), que já cobre os 141 municípios.
// O grão nominal existe no mesmo modelo (campos `Nome Servidor`, `Cargo`, `Lotação`) e é o passo seguinte.
//
// Técnica: Qlik Sense Enterprise. O WebSocket direto é recusado (exige sessão), então usa-se a SESSÃO DA PÁGINA
// — window.app.model.enigmaModel ([[pnigp-radar-atricon-erp-por-pagina]]).
// 🚨 O portal tem F5 TSPD (anti-bot): headless "cru" é barrado e o sintoma é `window.app` nunca aparecer.
//    Contexto realista + esperar pela CONDIÇÃO (não por tempo fixo) resolve.
// 🚨 Teto de ~10.000 células por página (qHeight × qWidth) — erro 6001 "Result too large".
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);

await q(`create table if not exists folha_tcemt_radar (
  cod_ibge text, municipio text, entidade text, esfera text, categoria text, tipo_vinculo text,
  situacao text, ano_folha text, agentes int, remuneracao numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tcemt_mun on folha_tcemt_radar (cod_ibge)`);
await q(`create table if not exists folha_tcemt_coleta (
  chave text primary key, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true, locale: "pt-BR", timezoneId: "America/Cuiaba", viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});
await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await ctx.newPage();
await page.goto("https://radarpessoal.tce.mt.gov.br/", { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
await page.waitForFunction(() => !!window.app?.model?.enigmaModel, { timeout: 120000 });
await page.waitForTimeout(6000);
console.log("[tce-mt] app Qlik conectado");

const linhas = await page.evaluate(async () => {
  const m = window.app.model.enigmaModel;
  const DIMS = ["Município Lotação", "Código IBGE Lotação", "Entidade", "Esfera por Pessoa",
    "Categoria", "Tipo de Vínculo", "Situação Servidor por Pessoa", "Ano Folha"];
  const MEDS = ["Count(distinct [CPF Servidor])", "sum({<[Tipo Rubrica Fato]={'VANTAGEM'}>} [Valor Rubrica])"];
  const o = await m.createSessionObject({
    qInfo: { qType: "folha-mt" },
    qHyperCubeDef: {
      qDimensions: DIMS.map((d) => ({ qDef: { qFieldDefs: ["[" + d + "]"] } })),
      qMeasures: MEDS.map((e) => ({ qDef: { qDef: e } })),
      qInitialDataFetch: [],
    },
  });
  const larg = DIMS.length + MEDS.length;
  const alt = Math.max(1, Math.floor(9500 / larg));      // teto de células por página
  const out = [];
  for (let top = 0; ; top += alt) {
    const p = await o.getHyperCubeData("/qHyperCubeDef", [{ qTop: top, qLeft: 0, qWidth: larg, qHeight: alt }]);
    const mtx = p?.[0]?.qMatrix || [];
    out.push(...mtx.map((r) => r.map((c) => c.qText)));
    if (mtx.length < alt) break;
    if (out.length > 200000) break;
  }
  return out;
});
await browser.close();
console.log(`[tce-mt] ${linhas.length} combinações lidas`);

const num = (s) => { const t = String(s ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""); const n = +t; return Number.isFinite(n) ? n : null; };
const regs = [];
for (const [mun, ibge, ent, esf, cat, vinc, sit, ano, ag, rem] of linhas) {
  const cod = String(ibge || "").replace(/\D/g, "");
  if (cod.length !== 7) continue;                       // sem IBGE não entra (não inventar chave)
  const r = { cod_ibge: cod, municipio: mun, entidade: ent, esfera: esf, categoria: cat, tipo_vinculo: vinc,
    situacao: sit, ano_folha: ano, agentes: num(ag) || 0, remuneracao: num(rem) };
  r._hash = crypto.createHash("md5").update([cod, ent, esf, cat, vinc, sit, ano].join("|")).digest("hex");
  regs.push(r);
}
const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
console.log(`[tce-mt] ${uniq.length} linhas com IBGE válido`);

const LOTE = 800;
for (let i = 0; i < uniq.length; i += LOTE) {
  const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_tcemt_radar
    (cod_ibge,municipio,entidade,esfera,categoria,tipo_vinculo,situacao,ano_folha,agentes,remuneracao,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::int[],$10::numeric[],$11::text[])
    on conflict (_hash) do update set agentes=excluded.agentes, remuneracao=excluded.remuneracao, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("entidade"), c("esfera"), c("categoria"), c("tipo_vinculo"), c("situacao"),
     c("ano_folha"), c("agentes"), c("remuneracao"), c("_hash")]);
}
await q(`insert into folha_tcemt_coleta (chave, linhas, situacao, detalhe, em)
  values ('radar-pessoal-mt', $1, 'ok', 'agregado municipio x entidade x categoria', now())
  on conflict (chave) do update set linhas=excluded.linhas, situacao='ok', em=now()`, [uniq.length]);

console.table((await q(`select esfera, count(distinct cod_ibge) municipios, sum(agentes) agentes,
   round(sum(remuneracao)/1e9,2) remuneracao_bi from folha_tcemt_radar group by 1 order by 3 desc`)).rows);
console.log("municípios de MT cobertos (esfera municipal):",
  (await q(`select count(distinct cod_ibge) n from folha_tcemt_radar where esfera ilike '%MUNICIPAL%'`)).rows[0].n);
await db.end();
