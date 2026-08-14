// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_publicsoft.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios PublicSoft (~48, PB/NE).
//
// ⭐ A folha do PublicSoft é servida por ELMAR Tecnologia: `transparencia.elmartecnologia.com.br/FolhaPag?ctx={N}`
// (o site municipal `/portal-da-transparencia/quadro-funcional-.../` embute esse iframe). O `ctx` identifica a
// entidade (ex.: Mamanguape prefeitura = 201110; fundos/autarquias têm outros ctx no dropdown `ecode`).
//
// Grid DevExpress com EXPORTADOR: clicar "Exportar CSV" baixa a folha inteira num CSV (não paginado). O GET direto
// de `/DevHelper/ExportTo` dá 500 fora da sessão ("visible ungrouped DataColumn required") — precisa do navegador
// inicializar o grid (FolhaPag?ctx) antes. Então: Playwright abre FolhaPag?ctx → clica Exportar CSV → captura download.
//
// CSV (latin1, ';'): Nome; CPF; Cargo; Unidade Trabalho; Secretaria; Regime; Dt. Admissão; Vantagens; Descontos; Líquido.
// Dinheiro "R$ 4.249,67". reCAPTCHA v3 invisível NÃO bloqueia (como GovBR).
//
// Uso pontual: CTX=201110 MUN=Mamanguape UF=PB node scripts/ingest_folha_publicsoft.mjs
// Em lote: tabela `publicsoft_ctx` (cod_ibge, ctx) — descoberta pelo iframe no site municipal.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_publicsoft (
  cod_ibge text, municipio text, uf text, ctx text, competencia text,
  nome text, cpf_masc text, cargo text, unidade text, secretaria text, regime text, data_admissao text,
  vantagens numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ps_mun on folha_servidores_publicsoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_publicsoft_coleta (
  cod_ibge text primary key, municipio text, uf text, ctx text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists publicsoft_ctx (cod_ibge text primary key, municipio text, uf text, ctx text, em timestamptz default now())`);

const money = (s) => { if (s == null) return null; const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const txt = (s) => { const v = (s == null ? "" : String(s)).trim(); return v || null; };

function parseCSV(raw) {
  const linhas = raw.split(/\r?\n/).filter((l) => l.trim() && l.includes(";"));
  if (!linhas.length) return [];
  const head = linhas[0].split(";").map((h) => h.trim().toLowerCase());
  const idx = (re) => head.findIndex((h) => re.test(h));
  const iNome = idx(/nome/), iCpf = idx(/cpf/), iCargo = idx(/cargo/), iUnid = idx(/unidade/), iSec = idx(/secretaria/),
    iReg = idx(/regime/), iAdm = idx(/admiss/), iVant = idx(/vantagens/), iDesc = idx(/descontos/), iLiq = idx(/l[íi]quido/);
  return linhas.slice(1).map((l) => {
    const c = l.split(";");
    return { nome: txt(c[iNome]), cpf: txt(c[iCpf]), cargo: txt(c[iCargo]), unidade: txt(c[iUnid]), secretaria: txt(c[iSec]),
      regime: txt(c[iReg]), adm: txt(c[iAdm]), vant: money(c[iVant]), desc: money(c[iDesc]), liq: money(c[iLiq]) };
  }).filter((r) => r.nome);
}

// alvos
let alvos;
if (process.env.CTX) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, ctx: process.env.CTX }];
} else {
  alvos = (await q(`select c.cod_ibge, m.nome, m.uf, c.ctx from publicsoft_ctx c join municipios_br m on m.cod_ibge=c.cod_ibge
    where c.ctx is not null ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
}
const feitos = new Set((await q(`select cod_ibge from folha_publicsoft_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[publicsoft] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_publicsoft
      (cod_ibge,municipio,uf,ctx,competencia,nome,cpf_masc,cargo,unidade,secretaria,regime,data_admissao,vantagens,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("ctx"), c("competencia"), c("nome"), c("cpf_masc"), c("cargo"),
       c("unidade"), c("secretaria"), c("regime"), c("data_admissao"), c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_publicsoft_coleta (cod_ibge,municipio,uf,ctx,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.ctx, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ acceptDownloads: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ps-"));
  try {
    await page.goto(`https://transparencia.elmartecnologia.com.br/FolhaPag?Tab=1&isModal=false&ctx=${a.ctx}`, { waitUntil: "networkidle", timeout: 60000 });
    await dorme(3500); // deixa o grid DevExpress carregar
    const comp = await page.evaluate(() => { const c = document.querySelector("#FolhaPagForm_competencia_I"); return c ? c.value : null; });
    // 🚨 o EXPORT DevExpress falha em HEADLESS ("visible ungrouped DataColumn required"). Via headless confiável =
    // ler o grid do DOM paginando (clicar "Próximo"). Mapeia por índice de coluna do header.
    // nome do grid (objeto JS global do DevExpress) e total de páginas
    const gridName = await page.evaluate(() => { const m = [...document.querySelectorAll('[id*="FolhadePagamento"]')].map((e) => (e.id.match(/FolhadePagamento\d+/) || [])[0]).filter(Boolean)[0]; return m || null; });
    const rows = await page.evaluate(async (gname) => {
      const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
      const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
      // 🚨 as células de DADOS ficam deslocadas -1 do header (o header tem a coluna "#" a mais). cell = headerIndex-1.
      const col = (re) => { const i = heads.findIndex((h) => re.test(h)); return i > 0 ? i - 1 : i; };
      const ix = { nome: col(/nome/), cpf: col(/cpf/), cargo: col(/cargo/), unidade: col(/unidade/), secretaria: col(/secretaria/), regime: col(/regime/), adm: col(/admiss/), vant: col(/vantagens/), desc: col(/descontos/), liq: col(/l[íi]quido/) };
      const totalItens = +((document.body.innerText.match(/\((\d+)\s*itens\)/) || [])[1] || 0);
      const grid = gname ? window[gname] : null;
      const totalPag = grid && grid.GetPageCount ? grid.GetPageCount() : (+((document.body.innerText.match(/de\s+(\d+)\s*\(/) || [])[1] || 1));
      const out = []; const vistos = new Set();
      const lerPagina = () => {
        for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
          const c = [...tr.querySelectorAll("td")].map((x) => x.innerText.trim());
          const nome = c[ix.nome]; if (!nome) continue;
          const key = nome + "|" + (c[ix.cargo] || "") + "|" + (c[ix.liq] || "");
          if (vistos.has(key)) continue; vistos.add(key);
          out.push({ nome, cpf: c[ix.cpf], cargo: c[ix.cargo], unidade: c[ix.unidade], secretaria: c[ix.secretaria], regime: c[ix.regime], adm: c[ix.adm], vant: c[ix.vant], desc: c[ix.desc], liq: c[ix.liq] });
        }
      };
      lerPagina();
      for (let pg = 1; pg < totalPag; pg++) {
        if (!grid || !grid.NextPage) break;
        const antes = out.length;
        grid.NextPage();
        // espera o callback do DevExpress terminar (linhas mudarem)
        for (let w = 0; w < 30; w++) { await dorme(300); if (document.querySelector("tr[class*=dxgvDataRow]")) { const primeiro = document.querySelector("tr[class*=dxgvDataRow] td:nth-child(" + (ix.nome + 1) + ")")?.innerText?.trim(); if (primeiro && !vistos.has(primeiro + "|" + "")) break; } }
        await dorme(400);
        lerPagina();
        if (out.length === antes) { await dorme(1000); lerPagina(); if (out.length === antes) break; }
        if (out.length >= totalItens && totalItens) break;
      }
      return out;
    }, gridName).catch(() => []);
    if (!rows.length) { await marca("vazio", "grid sem linhas"); vazios++; continue; }
    const money = (s) => { if (s == null) return null; const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
    const competencia = (comp || "").replace("/", "").replace(/(\d{2})(\d{4})/, "$2$1") || "atual";
    rows.forEach((r) => { r.vant = money(r.vant); r.desc = money(r.desc); r.liq = money(r.liq); });
    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, ctx: a.ctx, competencia,
      nome: s.nome, cpf_masc: s.cpf, cargo: s.cargo, unidade: s.unidade, secretaria: s.secretaria, regime: s.regime,
      data_admissao: s.adm, vantagens: s.vant, descontos: s.desc, liquido: s.liq,
      _hash: crypto.createHash("md5").update([a.cod_ibge, competencia, s.nome, s.cargo, s.secretaria, a.ctx].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} servidores (${competencia})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  await dorme(600);
}
await browser.close();
console.log(`\n[publicsoft] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
