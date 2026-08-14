// descobre_memory_entidade_js.mjs — 2ª passada (RENDER JS) do código de entidade Memory/iLAI.
// O HTTP achou só 1/123 (o código está em link JS-injected). Abre cada site + /transparencia no navegador,
// deixa renderizar, e garima `ilai.memory.com.br/#/.../{CODE}/`. Popula memory_entidade.
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u.replace(/\/$/, ""); };
await q(`create table if not exists memory_entidade (cod_ibge text primary key, municipio text, uf text, entidade text, situacao text, em timestamptz default now())`);
const achaCode = (html) => { const m = (html || "").match(/ilai\.memory\.com\.br\/#\/(?:entidades\/login\/)?([0-9]{3,6}[A-Z]{2})\b/i); return m ? m[1].toUpperCase() : null; };

const fila = (await q(`select r.cod_ibge, r.municipio, r.uf, r.url_portal from radar_portal r
  left join memory_entidade e on e.cod_ibge=r.cod_ibge and e.situacao='ok'
  where r.erp='memory' and r.unidade_gestora ilike 'Prefeitura%' and r.url_portal is not null and r.url_portal<>'-'
  and e.cod_ibge is null order by r.uf, r.municipio`)).rows;
console.log(`[memory_ent_js] ${fila.length} sites para render JS`);
const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i]; const base = norm(a.url_portal);
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  const marca = (situacao, code = null) => q(`insert into memory_entidade (cod_ibge,municipio,uf,entidade,situacao,em) values ($1,$2,$3,$4,$5,now()) on conflict (cod_ibge) do update set entidade=excluded.entidade, situacao=excluded.situacao, em=now()`, [a.cod_ibge, a.municipio, a.uf, code, situacao]);
  try {
    let code = null;
    for (const url of [base, base + "/transparencia", base + "/portal-da-transparencia"]) {
      try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); await dorme(2200); const h = await page.content(); code = achaCode(h); if (code) break; } catch {}
    }
    if (code) { await marca("ok", code); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ${code}`); }
    else { await marca("sem_codigo_js"); sem++; }
  } catch (e) { falhas++; await marca("erro_js"); }
  finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[memory_ent_js] ${ok} novos códigos · ${sem} sem · ${falhas} falhas`);
await db.end();
