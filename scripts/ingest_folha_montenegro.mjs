// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_montenegro.mjs — folha de MONTE NEGRO (RO), o último município do estado sem coleta.
//
// A tela: `servicos.montenegro.ro.gov.br/servidores/tipo/{ativos|inativos|desligados}/` (plataforma Athus /
// DATAFull). Colunas: Matrícula · Nome · Data Admissão · Cargo · Entidade Superior · **Lotação** ·
// Jornada · Qtd Proventos · **Total dos Proventos** — os cinco campos.
//
// 🚨 POR QUE ESTE É O ÚNICO COLETOR DE RO POR NAVEGADOR: os dados vêm de
// `/servidores/resultado/{TOKEN}`, e o TOKEN (56 hex) **não está no HTML** — é montado por JavaScript.
// Chamar a URL do token fora da sessão devolve 200 com `data: []` — 271 KB de nada. ⚠️ Mais um caso de
// "200 não é dado": aqui o servidor até responde bonito, e responde vazio.
// Testei antes: token no HTML (não há), chamada direta (vazia). Só então usei navegador.
//
// Uso: node scripts/ingest_folha_montenegro.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const MUN = "Monte Negro";
// 🚨 NUNCA digitar cod_ibge: eu digitei "1100155" e isso é OURO PRETO DO OESTE — os 165 servidores de Monte
// Negro entraram no município errado. O código sai do banco, pelo nome ([[pnigp-nunca-digitar-codigo-ibge]]).
const IBGE = (await q(`select cod_ibge from municipios_br where uf='RO' and nome=$1`, [MUN])).rows[0]?.cod_ibge;
if (!IBGE) throw new Error(`municipio ${MUN} nao encontrado em municipios_br`);
const BASE = "https://servicos.montenegro.ro.gov.br/servidores/tipo";
const TIPOS = ["ativos", "inativos"];   // desligados não é folha corrente

await q(`create table if not exists folha_servidores_montenegro (
  cod_ibge text, municipio text, uf text default 'RO', entidade text, competencia text,
  nome text, matricula text, cargo text, secretaria text, situacao text,
  data_admissao text, carga_horaria text, qtd_proventos int, bruto numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);

const limpo = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const num = (v) => { const m = String(v ?? "").match(/([\d.]+),(\d{2})/); if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]); return Number.isFinite(n) ? n : null; };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR" });
const regs = [];
for (const tipo of TIPOS) {
  const page = await ctx.newPage();
  const capturado = [];
  page.on("response", async (r) => {
    if (!/\/servidores\/resultado\//.test(r.url())) return;
    try { const j = await r.json(); if (Array.isArray(j?.data)) capturado.push(...j.data); } catch { /* não-json */ }
  });
  await page.goto(`${BASE}/${tipo}/`, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  // se a tabela paginar, peço o maior tamanho de página disponível e espero a nova resposta
  await page.evaluate(() => {
    const s = [...document.querySelectorAll("select")].find((x) => /length/i.test(x.name || x.id || ""));
    if (s) { const max = [...s.options].map((o) => o.value).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a)[0];
      if (max) { s.value = max; s.dispatchEvent(new Event("change", { bubbles: true })); } }
  }).catch(() => {});
  await page.waitForTimeout(9000);
  console.log(`  ${tipo}: ${capturado.length} linhas capturadas`);
  for (const l of capturado) {
    const c = l.map(limpo);
    if (!c[1]) continue;
    regs.push({ cod_ibge: IBGE, municipio: MUN, entidade: c[4] || null, competencia: null,
      matricula: c[0], nome: c[1], data_admissao: c[2], cargo: c[3], secretaria: c[5],
      carga_horaria: c[6], situacao: tipo, qtd_proventos: Number(c[7]) || null, bruto: num(c[8]),
      _hash: crypto.createHash("md5").update([IBGE, tipo, c[0], c[1], c[3]].join("|")).digest("hex") });
  }
  await page.close();
}
await ctx.close(); await browser.close();

if (regs.length) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  const c = (f) => uniq.map((x) => x[f] ?? null);
  await q(`insert into folha_servidores_montenegro
    (cod_ibge,municipio,entidade,competencia,nome,matricula,cargo,secretaria,situacao,
     data_admissao,carga_horaria,qtd_proventos,bruto,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
      $8::text[],$9::text[],$10::text[],$11::text[],$12::int[],$13::numeric[],$14::text[])
    on conflict (_hash) do update set cargo=excluded.cargo, secretaria=excluded.secretaria,
      bruto=excluded.bruto, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("entidade"), c("competencia"), c("nome"), c("matricula"), c("cargo"),
     c("secretaria"), c("situacao"), c("data_admissao"), c("carga_horaria"), c("qtd_proventos"), c("bruto"), c("_hash")]);
  console.log(`[monte-negro] ${uniq.length} servidores gravados`);
}
console.table((await q(`select situacao, count(*) linhas, count(*) filter (where bruto>0) com_valor,
  count(*) filter (where secretaria is not null and secretaria<>'') com_lotacao,
  round(avg(bruto) filter (where bruto>0)::numeric,2) media from folha_servidores_montenegro group by 1`)).rows);
await db.end();
