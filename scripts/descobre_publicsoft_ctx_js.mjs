// descobre_publicsoft_ctx_js.mjs — 2ª passada (RENDER JS) do ctx ELMAR do PublicSoft.
// Abre o site + /portal-da-transparencia + segue link de quadro-funcional/servidor no navegador, garima
// `elmartecnologia.com.br/FolhaPag?...ctx=(\d+)` na página renderizada. Popula publicsoft_ctx.
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u.replace(/\/$/, ""); };
await q(`alter table publicsoft_ctx add column if not exists situacao text`);
// o ctx está em QUALQUER módulo ELMAR do site (FolhaPag, Frota, Licitacao...) — pega o primeiro
const achaCtx = (html) => { const m = (html || "").match(/elmartecnologia\.com\.br\/[A-Za-z]+[^"'<> ]*ctx=(\d+)/i); return m ? m[1] : null; };

const fila = (await q(`select r.cod_ibge, r.municipio, r.uf, r.url_portal from radar_portal r
  left join publicsoft_ctx c on c.cod_ibge=r.cod_ibge and c.ctx is not null
  where r.erp='publicsoft' and r.unidade_gestora ilike 'Prefeitura%' and r.url_portal is not null and r.url_portal<>'-'
  and c.cod_ibge is null order by r.uf, r.municipio`)).rows;
console.log(`[publicsoft_ctx_js] ${fila.length} sites para render JS`);
const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i]; const base = norm(a.url_portal);
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  const marca = (situacao, c = null) => q(`insert into publicsoft_ctx (cod_ibge,municipio,uf,ctx,situacao,em) values ($1,$2,$3,$4,$5,now()) on conflict (cod_ibge) do update set ctx=coalesce(excluded.ctx,publicsoft_ctx.ctx), situacao=excluded.situacao, em=now()`, [a.cod_ibge, a.municipio, a.uf, c, situacao]);
  try {
    let ctxId = null;
    for (const url of [base + "/portal-da-transparencia", base, base + "/transparencia"]) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); await dorme(1800);
        let h = await page.content(); ctxId = achaCtx(h);
        if (!ctxId) {
          // segue link quadro-funcional/servidor
          const link = await page.locator("a").filter({ hasText: /quadro funcional|servidor|remunera|pessoal/i }).first();
          if (await link.count()) { const href = await link.getAttribute("href").catch(() => null); if (href) { const u = href.startsWith("http") ? href : new URL(href, page.url()).href; await page.goto(u, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {}); await dorme(1800); ctxId = achaCtx(await page.content()); } }
        }
        if (ctxId) break;
      } catch {}
    }
    if (ctxId) { await marca("ok", ctxId); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ctx=${ctxId}`); }
    else { await marca("sem_ctx_js"); sem++; }
  } catch (e) { await marca("erro_js"); }
  finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[publicsoft_ctx_js] ${ok} novos ctx · ${sem} sem`);
await db.end();
