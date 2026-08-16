// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_govbr_auto.mjs — coletor AUTOMÁTICO da folha GovernançaBrasil (PRONIM/cidade360) via Playwright.
//
// O portal tem reCAPTCHA v3 INVISÍVEL (grecaptcha.execute) no botão "Gerar", MAS ele NÃO bloqueia de fato: o clique
// dispara o `geraxml.asp` e baixa o ZIP mesmo com grecaptcha ausente. Não é captcha humano — o arquivo gera sozinho
// (confirmado pelo Heitor). Então dirigir o navegador real aqui NÃO é resolver/forjar captcha ([[pnigp-govbr-pronim-transparencia]]).
//
// 🚨 `geraxml.asp` é STATEFUL/one-shot: só responde no fluxo do clique "Gerar" (que faz um POST de sessão antes);
// re-fetch da URL TRAVA. Por isso tem de ser o clique + captura do download, não replay de URL.
//
// Fluxo por município: navega `{host}/pronimtb/index.asp?acao=10&item=8` → seta unidade (banco) + período →
// clica "Gerar" → captura o download (ZIP com FolhaPagamento.xml) → parseia → grava em folha_servidores_govbr.
//
// Alvos: tabela `govbr_portal` (host, banco, cod_ibge, municipio, uf). Uso pontual:
//   HOST=webapp1-ijui.cidade360.cloud BANCO=DW_LC131_AP_0 MUN=Ijuí UF=RS DTINI=01/01/2026 DTFIM=01/06/2026 node ...
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const DTINI = process.env.DTINI || "01/01/2026";
const DTFIM = process.env.DTFIM || "01/06/2026";
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_govbr (
  cod_ibge text, municipio text, uf text, competencia text, lotacao text, secretaria text, cargo text, nome text,
  salario_base numeric, proventos numeric, vantagens numeric, vencimentos_totais numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_govbr_mun on folha_servidores_govbr (cod_ibge, competencia)`);
await q(`create table if not exists govbr_portal (
  cod_ibge text primary key, municipio text, uf text, host text, banco text default 'DW_LC131_AP_0',
  situacao text, linhas int, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists govbr_coleta (
  cod_ibge text, periodo text, linhas int, situacao text, detalhe text, em timestamptz default now(),
  primary key (cod_ibge, periodo)
)`);

const money = (s) => { if (s == null) return null; const m = String(s).replace(/R\$|\s| /g, "").trim(); if (!m) return null; const n = +m.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
const txt = (s) => { const v = (s == null ? "" : String(s)).trim(); return v || null; };
const campo = (b, tag) => { const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1] : null; };

function parseXml(raw, mun) {
  const blocos = raw.match(/<FolhaPagamento>[\s\S]*?<\/FolhaPagamento>/g) || [];
  return blocos.map((b) => {
    const lot = txt(campo(b, "Lotacao"));
    return {
      cod_ibge: mun.cod_ibge, municipio: mun.nome, uf: mun.uf,
      competencia: (txt(campo(b, "Competencia")) || "").replace(/(\d{2})\/(\d{4})/, "$2$1"),
      lotacao: lot, secretaria: lot, cargo: txt(campo(b, "Cargo")), nome: txt(campo(b, "NomServidor")),
      salario_base: money(campo(b, "SalarioBase")), proventos: money(campo(b, "Proventos")),
      vantagens: money(campo(b, "Vantagens")), vencimentos_totais: money(campo(b, "VencimentosTotais")),
      descontos: money(campo(b, "Descontos")), liquido: money(campo(b, "Liquido")),
      _hash: crypto.createHash("md5").update([mun.cod_ibge, txt(campo(b, "Competencia")), txt(campo(b, "NomServidor")), txt(campo(b, "Cargo")), lot].join("¦")).digest("hex"),
    };
  });
}
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += 1000) {
    const p = arr.slice(i, i + 1000); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_govbr (cod_ibge,municipio,uf,competencia,lotacao,secretaria,cargo,nome,
      salario_base,proventos,vantagens,vencimentos_totais,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::numeric[],$10::numeric[],$11::numeric[],$12::numeric[],$13::numeric[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("lotacao"), c("secretaria"), c("cargo"), c("nome"),
       c("salario_base"), c("proventos"), c("vantagens"), c("vencimentos_totais"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return arr.length;
}

// dirige o portal e captura o ZIP; devolve o XML (string latin1)
async function baixaFolha(browser, host, banco) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "govbr-"));
  try {
    await page.goto(`https://${host}/pronimtb/index.asp?acao=10&item=8`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(1500);
    await page.evaluate(({ b, di, df }) => {
      const setAll = (n, v) => document.querySelectorAll(`[id="${n}"],[name="${n}"]`).forEach((e) => { e.value = v; ["input", "keyup", "change", "blur"].forEach((ev) => e.dispatchEvent(new Event(ev, { bubbles: true }))); });
      setAll("cmbUnidadeAR", b); setAll("txtDataInicial", di); setAll("txtDataFinal", df);
    }, { b: banco, di: DTINI, df: DTFIM });
    await dorme(500);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      page.locator('input[value="Gerar"]').first().click({ force: true }),
    ]);
    const zip = path.join(tmp, "f.zip");
    await download.saveAs(zip);
    execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zip}' -DestinationPath '${tmp}'"`, { stdio: "ignore" });
    const xml = fs.readdirSync(tmp).find((f) => f.toLowerCase().endsWith(".xml"));
    if (!xml) throw new Error("zip sem xml");
    return fs.readFileSync(path.join(tmp, xml), "latin1");
  } finally { await ctx.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// ⭐ cidades gigantes estouram o timeout mesmo com 1 mês (folha inteira num ZIP só). Quebra por UNIDADE: itera cada
// secretaria do combo cmbUnidadeAR, 1 mês cada, e concatena os XML. UNIDADE_SPLIT=1 liga esse modo.
async function baixaFolhaPorUnidade(browser, host) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "govbru-"));
  const raws = [];
  try {
    await page.goto(`https://${host}/pronimtb/index.asp?acao=10&item=8`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(1500);
    const unidades = await page.evaluate(() => {
      const u = document.querySelector('[id="cmbUnidadeAR"],[name="cmbUnidadeAR"]');
      return u ? [...u.options].filter((o) => o.value && !/^\*/.test(o.text)).map((o) => o.value) : [];
    });
    if (!unidades.length) throw new Error("sem unidades no combo");
    let baixados = 0;
    for (const uv of unidades) {
      try {
        await page.evaluate(({ u, di, df }) => {
          const setAll = (n, v) => document.querySelectorAll(`[id="${n}"],[name="${n}"]`).forEach((e) => { e.value = v; ["input", "keyup", "change", "blur"].forEach((ev) => e.dispatchEvent(new Event(ev, { bubbles: true }))); });
          setAll("cmbUnidadeAR", u); setAll("txtDataInicial", di); setAll("txtDataFinal", df);
        }, { u: uv, di: DTINI, df: DTFIM });
        await dorme(400);
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 30000 }),
          page.locator('input[value="Gerar"]').first().click({ force: true }),
        ]);
        const zip = path.join(tmp, "u.zip");
        await download.saveAs(zip);
        execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zip}' -DestinationPath '${tmp}'"`, { stdio: "ignore" });
        const xml = fs.readdirSync(tmp).find((f) => f.toLowerCase().endsWith(".xml"));
        if (xml) { raws.push(fs.readFileSync(path.join(tmp, xml), "latin1")); fs.rmSync(path.join(tmp, xml), { force: true }); }
        fs.rmSync(zip, { force: true }); baixados++;
      } catch { /* unidade sem folha no mês → pula */ }
    }
    if (!baixados) throw new Error("nenhuma unidade gerou folha");
    return raws.join("\n");
  } finally { await ctx.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// modo pontual (HOST/BANCO/MUN direto) ou lote (govbr_portal)
let alvos;
if (process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, host: process.env.HOST, banco: process.env.BANCO || "DW_LC131_AP_0" }];
} else {
  // SOERRO=<periodo_ref>: só os que deram TIMEOUT de download naquele período (o mês único conserta esses;
  // login-gated/portalacesso e hosts mortos NÃO se resolvem por período, então ficam de fora — host webapp% clássico).
  const soErro = process.env.SOERRO || null;
  const UF_LOTE = process.env.UF || null;   // sigla, para rodar um estado por vez (convenção de _uf.mjs)
  // params posicionais montados em ordem — os índices fixos anteriores quebravam ao combinar filtros
  const par = [], cond = [];
  if (soErro) {
    par.push(soErro);
    cond.push(`p.host like 'webapp%' and p.cod_ibge in (select cod_ibge from govbr_coleta
      where periodo=$${par.length} and situacao='erro' and detalhe like '%waitForEvent%')`);
  }
  if (SO) { par.push(SO); cond.push(`m.nome ilike '%'||$${par.length}||'%'`); }
  if (UF_LOTE) { par.push(UF_LOTE); cond.push(`m.uf = $${par.length}`); }
  // SONOVOS=1: só quem NUNCA foi coletado, em período NENHUM. Necessário para trocar a janela de 6 meses (que
  // estoura o timeout do export) por 1 mês sem re-coletar de graça os que já vieram na janela larga — o `feitos`
  // é por período, então mudar o período sozinho recolocaria 100 municípios prontos na fila.
  if (process.env.SONOVOS === "1") {
    cond.push(`not exists (select 1 from govbr_coleta c where c.cod_ibge = p.cod_ibge and c.situacao='ok')`);
  }
  alvos = (await q(`select p.cod_ibge, m.nome, m.uf, p.host, p.banco from govbr_portal p
    join municipios_br m on m.cod_ibge=p.cod_ibge where p.host is not null
    ${cond.length ? "and " + cond.join(" and ") : ""}`, par)).rows;
}
const periodo = `${DTINI}-${DTFIM}`;
const feitos = new Set((await q(`select cod_ibge from govbr_coleta where periodo=$1 and situacao='ok'`, [periodo])).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[govbr_auto] ${alvos.length} alvos · ${fila.length} na fila · período ${periodo}`);

const browser = await chromium.launch({ headless: true });
let ok = 0, falhas = 0, total = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  try {
    const raw = process.env.UNIDADE_SPLIT === "1"
      ? await baixaFolhaPorUnidade(browser, a.host)
      : await baixaFolha(browser, a.host, a.banco);
    const regs = parseXml(raw, { cod_ibge: a.cod_ibge, nome: a.nome, uf: a.uf });
    if (!regs.length) throw new Error("xml sem registros");
    // 🚨 GUARDA (15/ago/2026): parte dos portais exporta a folha AGRUPADA POR FONTE DE RECURSO, sem NomServidor —
    // Jacarezinho/PR gravou 1.361 linhas com ZERO nomes, que passam por folha nominal e não são. Mesma guarda da
    // Betha: exigir MAIORIA das linhas com nome ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    const comNome = regs.filter((r) => r.nome && String(r.nome).trim()).length;
    if (comNome < regs.length / 2) throw new Error(`export agregado: ${comNome}/${regs.length} linhas com nome`);
    const n = await grava(regs);
    total += n; ok++;
    await q(`insert into govbr_coleta (cod_ibge,periodo,linhas,situacao,em) values ($1,$2,$3,'ok',now())
      on conflict (cod_ibge,periodo) do update set linhas=excluded.linhas, situacao='ok', em=now()`, [a.cod_ibge, periodo, n]);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${n} servidores`);
  } catch (e) {
    falhas++;
    await q(`insert into govbr_coleta (cod_ibge,periodo,linhas,situacao,detalhe,em) values ($1,$2,0,'erro',$3,now())
      on conflict (cod_ibge,periodo) do update set situacao='erro', detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, periodo, String(e.message).slice(0, 150)]);
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(1000);
}
await browser.close();
console.log(`\n[govbr_auto] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
