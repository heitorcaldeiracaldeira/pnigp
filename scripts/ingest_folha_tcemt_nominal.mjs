// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcemt_nominal.mjs — FOLHA NOMINAL dos 141 municípios de MT pelo Radar Pessoal do TCE-MT.
//
// ⭐ POR QUE isto fecha o estado: é a única fonte que entrega os CINCO CAMPOS juntos para MT inteiro —
// município · secretaria (Lotação) · cargo · vínculo · remuneração — com nome e matrícula, direto do tribunal.
// Substitui a caça portal a portal (36 municípios coletados) por uma consulta só (141).
//
// TÉCNICA (Qlik Sense Enterprise, app 08294dc5-…): o WebSocket direto é recusado — extrai-se pela SESSÃO DA
// PÁGINA (window.app.model.enigmaModel), como no Radar ATRICON ([[pnigp-radar-atricon-erp-por-pagina]]).
//
// 🚨 TRÊS ARMADILHAS MEDIDAS NA CALIBRAÇÃO:
// 1. `selectValues` no "Código IBGE Lotação" devolve TRUE e NÃO filtra (o valor é numérico; o qText não casa).
//    Por isso NÃO se itera por município: seleciona-se só a ESFERA (essa funciona) e pagina-se o cubo inteiro,
//    trazendo o município como DIMENSÃO. Iterar por município aqui daria 141 cubos idênticos e completos.
// 2. Teto de ~10.000 CÉLULAS por página (qHeight × qWidth), erro 6001 "Result too large" — a altura sai da largura.
// 3. O portal tem F5 TSPD (anti-bot): headless cru é barrado e o sintoma é `window.app` nunca aparecer.
//
// ⚠️ O QUE O VALOR SIGNIFICA: só há UM período carregado no app (Ano Folha 2025) — a soma das rubricas do tipo
// VANTAGEM é a remuneração ACUMULADA DO EXERCÍCIO, não um salário mensal. Gravado como tal em `bruto`, com
// `competencia` = o ano. Dividir por 12 seria inventar: quem entrou no meio do ano tem acumulado menor.
//
// 🔒 CPF: a fonte expõe o número inteiro. Gravamos MASCARADO (559.***.***-15), como fazem os portais públicos.
// Uso: node scripts/ingest_folha_tcemt_nominal.mjs   ·   REFAZ=1 ignora o ponto de retomada
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const REFAZ = process.env.REFAZ === "1";
const MAX_PAG = Number(process.env.MAX_PAG || 400);          // trava de segurança

await q(`create table if not exists folha_servidores_tcemt (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text,
  vinculo text, regime text, situacao text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tcemt_nom_mun on folha_servidores_tcemt (cod_ibge)`);
await q(`create table if not exists folha_tcemt_nominal_coleta (
  chave text primary key, offset_final int, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const CHAVE = "radar-pessoal-mt-nominal";
const inicio = REFAZ ? 0 : Number((await q(`select offset_final from folha_tcemt_nominal_coleta where chave=$1`, [CHAVE])).rows[0]?.offset_final || 0);
console.log(`[tcemt-nominal] retomando do offset ${inicio}`);

const DIMS = ["Nome Servidor", "CPF Servidor", "Matrícula", "Cargo", "Lotação", "Entidade",
  "Município Lotação", "Código IBGE Lotação", "Tipo de Vínculo", "Regime Jurídico",
  "Situação Servidor por Pessoa", "Ano Folha"];
const MEDS = ["sum({<[Tipo Rubrica Fato]={'VANTAGEM'}>} [Valor Rubrica])",
              "sum({<[Tipo Rubrica Fato]={'DESCONTO'}>} [Valor Rubrica])"];
const LARG = DIMS.length + MEDS.length;
const ALT = Math.floor(9500 / LARG);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true, locale: "pt-BR", timezoneId: "America/Cuiaba", viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});
await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await ctx.newPage();
await page.goto("https://radarpessoal.tce.mt.gov.br/", { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
await page.waitForFunction(() => !!window.app?.model?.enigmaModel, { timeout: 120000 });
await page.waitForTimeout(5000);
console.log("[tcemt-nominal] app Qlik conectado");

// prepara o cubo UMA vez e guarda o handle na página; cada página de dados é uma ida ao servidor
const total = await page.evaluate(async ({ DIMS, MEDS }) => {
  const m = window.app.model.enigmaModel;
  const fe = await m.getField("Esfera por Pessoa");
  await fe.selectValues([{ qText: "MUNICIPAL" }], false, true);   // esta seleção FUNCIONA (a de município não)
  const o = await m.createSessionObject({
    qInfo: { qType: "nominal-mt" },
    qHyperCubeDef: {
      qDimensions: DIMS.map((d) => ({ qDef: { qFieldDefs: ["[" + d + "]"] } })),
      qMeasures: MEDS.map((e) => ({ qDef: { qDef: e } })),
      qSuppressZero: true, qInitialDataFetch: [],
    },
  });
  window.__cubo = o;
  return (await o.getLayout()).qHyperCube?.qSize?.qcy || 0;
}, { DIMS, MEDS });
console.log(`[tcemt-nominal] ${total.toLocaleString("pt-BR")} linhas no cubo · ${ALT} por página · ~${Math.ceil(total / ALT)} páginas`);

const money = (s) => { const t = String(s ?? "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const mascara = (cpf) => { const d = String(cpf || "").replace(/\D/g, "").padStart(11, "0"); return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null; };

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_tcemt
      (cod_ibge,municipio,uf,entidade,competencia,nome,cpf_masc,matricula,cargo,secretaria,vinculo,regime,
       situacao,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cpf_masc"),
       c("matricula"), c("cargo"), c("secretaria"), c("vinculo"), c("regime"), c("situacao"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

let off = inicio, gravadas = 0, paginas = 0, vazias = 0;
while (off < total && paginas < MAX_PAG) {
  let mtx;
  try {
    mtx = await page.evaluate(async ({ top, alt, larg }) => {
      const p = await window.__cubo.getHyperCubeData("/qHyperCubeDef", [{ qTop: top, qLeft: 0, qWidth: larg, qHeight: alt }]);
      return (p?.[0]?.qMatrix || []).map((r) => r.map((c) => c.qText));
    }, { top: off, alt: ALT, larg: LARG });
  } catch (e) {
    console.log(`  ✖ página no offset ${off}: ${String(e.message).slice(0, 90)} — parando para retomar depois`);
    break;
  }
  if (!mtx.length) { vazias++; if (vazias > 1) break; off += ALT; continue; }
  vazias = 0;

  const regs = [];
  for (const [nome, cpf, mat, cargo, lot, ent, mun, ibge, vinc, reg, sit, ano, vant, desc] of mtx) {
    const cod = String(ibge || "").replace(/\D/g, "");
    if (cod.length !== 7) continue;                     // sem IBGE não entra: chave inventada contamina a base
    const bruto = money(vant), descontos = money(desc);
    regs.push({
      cod_ibge: cod, municipio: mun, uf: "MT", entidade: ent, competencia: ano,
      nome, cpf_masc: mascara(cpf), matricula: mat, cargo, secretaria: lot,
      vinculo: vinc, regime: reg, situacao: sit,
      bruto, descontos, liquido: bruto != null && descontos != null ? +(bruto - descontos).toFixed(2) : null,
      _hash: crypto.createHash("md5").update([cod, cpf, mat, cargo, lot, ent, vinc, reg, sit, ano].join("|")).digest("hex"),
    });
  }
  gravadas += await grava(regs);
  off += mtx.length;
  paginas++;
  await q(`insert into folha_tcemt_nominal_coleta (chave, offset_final, linhas, situacao, detalhe, em)
    values ($1,$2,$3,'parcial','paginando',now()) on conflict (chave) do update set
    offset_final=excluded.offset_final, linhas=excluded.linhas, situacao='parcial', em=now()`, [CHAVE, off, gravadas]);
  if (paginas % 10 === 0 || off >= total) {
    const m = (await q(`select count(distinct cod_ibge) n from folha_servidores_tcemt`)).rows[0].n;
    console.log(`  ${off.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")} · ${gravadas.toLocaleString("pt-BR")} gravadas · ${m} municípios`);
  }
}
await browser.close();

const fim = off >= total ? "ok" : "parcial";
await q(`update folha_tcemt_nominal_coleta set situacao=$2, em=now() where chave=$1`, [CHAVE, fim]);
const r = (await q(`select count(*) linhas, count(distinct cod_ibge) municipios, count(distinct cpf_masc) pessoas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_secretaria
  from folha_servidores_tcemt`)).rows[0];
console.log(`\n[tcemt-nominal] ${fim.toUpperCase()} · ${Number(r.linhas).toLocaleString("pt-BR")} linhas · ${r.municipios} municípios · ${Number(r.pessoas).toLocaleString("pt-BR")} pessoas`);
console.log(`   com valor: ${Number(r.com_valor).toLocaleString("pt-BR")} · com secretaria: ${Number(r.com_secretaria).toLocaleString("pt-BR")}`);
await db.end();
