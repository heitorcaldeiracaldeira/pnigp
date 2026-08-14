// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_scpi.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios Fiorilli/SCPI 9.0 (dcfiorilli, NACIONAL).
//
// ⭐ A transparência Fiorilli dcfiorilli vive na PORTA :879: `{slug}.dcfiorilli.com.br:879/transparencia/` = SCPI 9.0.
// Fluxo (Playwright): abrir /transparencia/ → `ProcessaDados('LnkServidores')` (seta contexto, POST RecuperarDados) →
// carrega `Servidores.aspx` no iframe `#frmPaginaAspx` → dentro do iframe clicar `#btnPesquisar` → grid DevExpress
// `gridPessoal` popula → ler+paginar (grid.NextPage) → colunas: Referência·Matrícula·Contrato·Data Admissão·Cargo·
// Unidade(=secretaria)·Vínculo·Proventos·Descontos·Líquido. Dinheiro "5.314,29".
//
// Hosts: `fiorilli_portal` (base_url dcfiorilli) → `{host}:879`. Uso pontual: HOST=colinasp.dcfiorilli.com.br MUN=Colina UF=SP.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_scpi (
  cod_ibge text, municipio text, uf text, host text, referencia text,
  matricula text, contrato text, data_admissao text, cargo text, unidade text, secretaria text, vinculo text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_scpi_mun on folha_servidores_scpi (cod_ibge)`);
await q(`create table if not exists folha_scpi_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => { if (s == null) return null; const t = String(s).replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };

// alvos: fiorilli_portal dcfiorilli → host:879
let alvos;
if (process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, host: process.env.HOST }];
} else {
  alvos = (await q(`select f.cod_ibge, f.municipio nome, f.uf, f.base_url from fiorilli_portal f
    where f.base_url ilike '%dcfiorilli%' ${SO ? "and f.municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows
    .map((a) => ({ ...a, host: (String(a.base_url).match(/([a-z0-9-]+\.dcfiorilli\.com\.br)/i) || [])[1] })).filter((a) => a.host);
}
const feitos = new Set((await q(`select cod_ibge from folha_scpi_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[scpi] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_scpi
      (cod_ibge,municipio,uf,host,referencia,matricula,contrato,data_admissao,cargo,unidade,secretaria,vinculo,proventos,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("referencia"), c("matricula"), c("contrato"),
       c("data_admissao"), c("cargo"), c("unidade"), c("secretaria"), c("vinculo"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_scpi_coleta (cod_ibge,municipio,uf,host,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.host, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    await page.goto(`https://${a.host}:879/transparencia/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(2500);
    // dispara ProcessaDados('LnkServidores') → carrega Servidores.aspx no iframe
    await page.evaluate(() => { try { if (typeof ProcessaDados === "function") ProcessaDados("LnkServidores"); } catch {} });
    await dorme(4000);
    // pega o frame do iframe
    let frame = page.frames().find((f) => /Servidores\.aspx/i.test(f.url()));
    for (let w = 0; w < 10 && !frame; w++) { await dorme(1000); frame = page.frames().find((f) => /Servidores\.aspx/i.test(f.url())); }
    if (!frame) { await marca("erro", "iframe Servidores nao carregou"); falhas++; continue; }
    // clica btnPesquisar dentro do frame
    await frame.evaluate(() => { const b = document.querySelector("#btnPesquisar"); if (b) b.click(); });
    await dorme(4000);
    // lê + pagina o gridPessoal
    const rows = await frame.evaluate(async () => {
      const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
      const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
      const col = (re) => heads.findIndex((h) => re.test(h));
      const ix = { ref: col(/refer/), mat: col(/matr/), contr: col(/contrato/), adm: col(/admiss/), cargo: col(/cargo/), unid: col(/unidade/), vinc: col(/v[íi]nculo/), prov: col(/proventos/), desc: col(/descontos/), liq: col(/l[íi]quido/) };
      // ajuste de offset como PublicSoft: se header tem coluna extra, alinhar por diferença
      const g = [...document.querySelectorAll('[id*="gridPessoal"]')].map((e) => (e.id.match(/gridPessoal/) || [])[0]).filter(Boolean)[0];
      const grid = g ? window[g] || window.gridPessoal : window.gridPessoal;
      const totalPag = grid && grid.GetPageCount ? grid.GetPageCount() : 1;
      const out = []; const vistos = new Set();
      const ler = () => {
        for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
          const c = [...tr.querySelectorAll("td")].map((x) => x.innerText.trim());
          // detecta offset: acha a célula com padrão de data dd/mm/aaaa e retrocede
          const nomeRef = c[ix.ref] || c[0];
          const mat = c[ix.mat]; if (!mat && !nomeRef) continue;
          const key = (c[ix.mat] || "") + "|" + (c[ix.cargo] || "") + "|" + (c[ix.liq] || "");
          if (vistos.has(key)) continue; vistos.add(key);
          out.push({ ref: c[ix.ref], mat: c[ix.mat], contr: c[ix.contr], adm: c[ix.adm], cargo: c[ix.cargo], unid: c[ix.unid], vinc: c[ix.vinc], prov: c[ix.prov], desc: c[ix.desc], liq: c[ix.liq] });
        }
      };
      ler();
      for (let pg = 1; pg < (totalPag || 1); pg++) {
        if (!grid || !grid.NextPage) break;
        const antes = out.length; grid.NextPage();
        for (let w = 0; w < 25; w++) { await dorme(300); if (out.length === antes) { const n0 = document.querySelectorAll("tr[class*=dxgvDataRow]").length; if (n0) break; } }
        await dorme(500); ler();
        if (out.length === antes) { await dorme(800); ler(); if (out.length === antes) break; }
      }
      return out;
    }).catch(() => []);
    if (!rows.length) { await marca("vazio", "grid sem linhas"); vazios++; continue; }
    const regs = rows.filter((r) => r.mat || r.cargo).map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, referencia: s.ref,
      matricula: s.mat, contrato: s.contr, data_admissao: s.adm, cargo: s.cargo, unidade: s.unid, secretaria: s.unid, vinculo: s.vinc,
      proventos: money(s.prov), descontos: money(s.desc), liquido: money(s.liq),
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.ref, s.mat, s.cargo, s.liq].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} servidores`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(600);
}
await browser.close();
console.log(`\n[scpi] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
