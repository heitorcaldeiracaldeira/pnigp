// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_genexus_srvbr.mjs — scraper (Playwright) do portal GeneXus e-transparência hospedado em *.srv.br.
// UNIFICA vários rótulos do Radar: 'fiorilli' (asp.srv.br) e 'instar' (gp.srv.br) usam o MESMO produto GeneXus.
//
// Por que NAVEGADOR e não HTTP: o grid carrega via POST GeneXus (GXState) — o link tokenizado não está no HTML.
// A via rápida é o botão de EXPORT CSV do grid (dump completo, sem paginar de 15 em 15).
//
// v1 (Fiorilli asp) — COMPLETO, tem secretaria:
//   /servlet/wppessoalconsulta → clicar "Relação de Servidores" → setar Folha="TODAS AS FOLHAS" → #EXPORTCSV
//   CSV: Matrícula; Nome; Lotação; Local de Trabalho(=secretaria); Cargo/Função; Folha; Salário Bruto; Base; Líquido
// v2 (gp) — folha só NOME;CARGO;salários (sem secretaria) → tratado num passo futuro (marca 'v2_pendente').
//
// Números: PONTO decimal no CSV (600.19). Encoding latin1. Delimitador ';'.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const LIMITE = Number(process.env.LIMITE || 0); // 0 = todos
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_genexus (
  cod_ibge text, municipio text, uf text, base_url text, versao text, competencia text,
  matricula text, nome text, lotacao text, secretaria text, cargo text, folha_tipo text,
  salario_bruto numeric, salario_base numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_gx_mun on folha_servidores_genexus (cod_ibge)`);
await q(`create table if not exists folha_genexus_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, versao text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (s) => {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  // CSV vem com PONTO decimal (600.19); mas por segurança trata vírgula pt-BR se aparecer
  const n = s.includes(",") && !/\.\d{2}$/.test(s) ? +s.replace(/\./g, "").replace(",", ".") : +s.replace(/,/g, "");
  return Number.isFinite(n) ? n : null;
};

// parser CSV simples (delimitador ';', pode haver aspas)
function parseCSV(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { header: [], rows: [] };
  const split = (l) => l.split(";").map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(linhas[0]).map((h) => h.toLowerCase());
  const rows = linhas.slice(1).map(split);
  return { header, rows };
}

const alvos = (await q(`select cod_ibge, municipio, uf, base_url, home_servlet, versao
  from genexus_srvbr_portal where situacao='ok' and base_url is not null
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by versao, uf, municipio`, SO ? [SO] : [])).rows;
const feitos = new Set((await q(`select cod_ibge from folha_genexus_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
let fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
if (LIMITE) fila = fila.slice(0, LIMITE);
console.log(`[genexus_srvbr] ${alvos.length} portais · ${feitos.size} feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map();
  for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_genexus
      (cod_ibge,municipio,uf,base_url,versao,competencia,matricula,nome,lotacao,secretaria,cargo,folha_tipo,
       salario_bruto,salario_base,salario_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set salario_bruto=excluded.salario_bruto, salario_liquido=excluded.salario_liquido,
        _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("versao"), c("competencia"), c("matricula"),
       c("nome"), c("lotacao"), c("secretaria"), c("cargo"), c("folha_tipo"), c("salario_bruto"),
       c("salario_base"), c("salario_liquido"), c("_hash")]);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxfolha-"));
const browser = await chromium.launch({ headless: true });

// baixa o CSV do grid v1 e devolve o texto (latin1)
async function exportaCSV(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator("#EXPORTCSV").click(),
  ]);
  const dest = path.join(tmpDir, "f_" + Date.now() + ".csv");
  await download.saveAs(dest);
  const buf = fs.readFileSync(dest);
  fs.unlinkSync(dest);
  // latin1 → utf8
  return Buffer.from(buf).toString("latin1");
}

// 🚨 o mês DEFAULT do grid é o corrente, que costuma ter só a folha COMPLEMENTAR parcial (Apiaí ago: 62 linhas).
// O mês fechado ANTERIOR tem a folha inteira (Apiaí jul: 929). Seta vMES para o mês-alvo (default: corrente-1).
const MES_ALVO = process.env.MES ? Number(process.env.MES) : (new Date().getMonth() || 12); // getMonth é 0-based → corrente-1
// fluxo v1: wppessoalconsulta → "Relação de Servidores" → vMES=mês fechado → (Folha já vem TODAS) → export CSV
async function coletaV1(page, base) {
  // 🚨 IR DIRETO NO SERVLET NÃO FUNCIONA em parte dos portais: sem sessão, o GeneXus desvia para a tela de
  // consentimento (`wpcontrolelgpd`) ou responde 404 no servlet. Pela HOME o link "Gestão de Pessoas" existe e
  // leva ao mesmo `wppessoalconsulta` com a sessão montada. 6 municípios morriam em "locator.click: Timeout"
  // clicando num link que nunca chegou a existir na página.
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(2000);
  if (/login/i.test(page.url())) throw new Error("portal exige login (gated)");
  const consentir = page.locator('input[value="Confirmar"]').or(page.getByText("Confirmar", { exact: true })).first();
  if (await consentir.count()) { await consentir.click({ timeout: 8000 }).catch(() => {}); await dorme(2500); }
  const linkPessoal = page.locator('a[href*="wppessoalconsulta"]').first();
  if (await linkPessoal.count()) {
    await linkPessoal.click({ timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await dorme(1500);
  } else {
    await page.goto(`${base}/servlet/wppessoalconsulta`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  if (/login/i.test(page.url())) throw new Error("portal exige login (gated)");
  // 🚨 GATE DE IDENTIFICAÇÃO: alguns portais desviam a consulta de pessoal para `wpcontrolelgpd`, que exige NOME,
  // CPF e E-MAIL do solicitante antes de liberar os dados. Não é falha de coleta e não se contorna por código —
  // preencher identidade de terceiro para passar seria falsidade. Fica registrado como limite da FONTE: o acesso
  // depende de identificação real (ou de pedido por LAI). Antes isso aparecia como "locator.click: Timeout".
  if (/wpcontrolelgpd/i.test(page.url())) {
    const pedeCpf = await page.locator('input[name="vCPF"], input[id="vCPF"]').count().catch(() => 0);
    throw new Error(pedeCpf ? "gated: portal exige nome/CPF/e-mail do solicitante (LGPD)" : "gated: tela de consentimento LGPD");
  }
  await page.locator("text=Relação de Servidores").first().click({ timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await dorme(1500);
  // seta o mês para o último fechado (o grid recarrega no onchange do GeneXus)
  try {
    const mes = page.locator("#vMES");
    if (await mes.count()) {
      const temOpt = await mes.locator(`option[value="${MES_ALVO}"]`).count();
      if (temOpt) { await mes.selectOption(String(MES_ALVO)); await dorme(3000); }
    }
  } catch { /* sem seletor de mês — segue com o default */ }
  const csv = await exportaCSV(page);
  const parsed = parseCSV(csv);
  parsed.competencia = `2026-${String(MES_ALVO).padStart(2, "0")}`;
  return parsed;
}

// mapeia colunas do CSV v1 pelo NOME do cabeçalho (robusto a ordem)
function mapV1(header, row) {
  const idx = (re) => header.findIndex((h) => re.test(h));
  const g = (re) => { const i = idx(re); return i >= 0 ? row[i] : null; };
  return {
    matricula: g(/matr/), nome: g(/nome/), lotacao: g(/lota/),
    secretaria: g(/local de trabalho|local_de|localtrab/), cargo: g(/cargo|fun/),
    folha_tipo: g(/^folha$|folha;|folha /), bruto: g(/bruto/), base: g(/base/), liquido: g(/l[ií]quid/),
  };
}

let total = 0, ok = 0, vazios = 0, falhas = 0, pend = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_genexus_coleta (cod_ibge,municipio,uf,base_url,versao,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.base_url, a.versao, linhas, situacao, detalhe]);
  if (a.versao === "v2") { await marca("v2_pendente", "fluxo v2 ainda nao implementado"); pend++; continue; }
  const page = await browser.newPage({ acceptDownloads: true });
  try {
    const parsed = await coletaV1(page, a.base_url);
    const { header, rows } = parsed;
    const dataRows = rows.filter((r) => r.length >= 5 && /\d/.test(r.join("")));
    if (!dataRows.length) { await marca("vazio", "csv sem linhas"); vazios++; continue; }
    const competencia = parsed.competencia || "atual";
    const regs = dataRows.map((r) => {
      const m = mapV1(header, r);
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: a.base_url, versao: a.versao,
        competencia, matricula: m.matricula, nome: m.nome, lotacao: m.lotacao, secretaria: m.secretaria,
        cargo: m.cargo, folha_tipo: m.folha_tipo, salario_bruto: num(m.bruto), salario_base: num(m.base),
        salario_liquido: num(m.liquido),
        _hash: crypto.createHash("md5").update([a.cod_ibge, m.matricula, m.nome, m.cargo, m.folha_tipo, m.bruto].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} linhas`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 160));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await page.close(); }
  await dorme(500);
}
await browser.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
console.log(`\n[genexus_srvbr] ${total.toLocaleString("pt-BR")} linhas · ${ok} ok · ${vazios} vazios · ${falhas} falhas · ${pend} v2_pendente`);
await db.end();
