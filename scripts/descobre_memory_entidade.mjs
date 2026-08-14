// descobre_memory_entidade.mjs — acha o código de entidade Memory/iLAI (ex.: 9840MT) de cada município,
// do link `ilai.memory.com.br/#/entidades/login/{CODE}/` ou `/{CODE}/1/share` no site municipal. HTTP crawl.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u.replace(/\/$/, ""); };
await q(`create table if not exists memory_entidade (cod_ibge text primary key, municipio text, uf text, entidade text, situacao text, em timestamptz default now())`);

async function baixa(url) { try { const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.text(); } catch {} return null; }
const achaCode = (html) => { const m = (html || "").match(/ilai\.memory\.com\.br\/#\/(?:entidades\/login\/)?([0-9]{3,6}[A-Z]{2})\b/i); return m ? m[1].toUpperCase() : null; };
function linksAlvo(html, base) {
  const hrefs = [...(html || "").matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const bons = hrefs.filter((h) => /transparencia|acesso-a-informacao|lai|servidor|pessoal/i.test(h));
  const abs = (h) => { try { return h.startsWith("http") ? h : new URL(h, base + "/").href; } catch { return null; } };
  return [...new Set(bons.map(abs).filter(Boolean).filter((u) => { try { return u.includes(new URL(base).hostname); } catch { return false; } }))].slice(0, 10);
}

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp='memory' and unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-' order by uf, municipio`)).rows;
const feitos = new Set((await q(`select cod_ibge from memory_entidade where situacao in ('ok','sem_codigo')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[memory_entidade] ${alvos.length} municípios · ${fila.length} na fila`);

let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i]; const base = norm(a.url_portal);
  const marca = (situacao, code = null) => q(`insert into memory_entidade (cod_ibge,municipio,uf,entidade,situacao,em) values ($1,$2,$3,$4,$5,now()) on conflict (cod_ibge) do update set entidade=excluded.entidade, situacao=excluded.situacao, em=now()`, [a.cod_ibge, a.municipio, a.uf, code, situacao]);
  try {
    let code = null; const home = await baixa(base);
    if (home) code = achaCode(home);
    const paginas = new Set(); if (!code && home) linksAlvo(home, base).forEach((u) => paginas.add(u));
    for (const p of ["/transparencia", "/portal-da-transparencia", "/acesso-a-informacao"]) { const pg = await baixa(base + p); if (pg) { if (!code) code = achaCode(pg); linksAlvo(pg, base).forEach((u) => paginas.add(u)); if (code) break; } }
    if (!code) { for (const u of [...paginas].slice(0, 8)) { const pg = await baixa(u); if (pg) { const c = achaCode(pg); if (c) { code = c; break; } } await dorme(120); } }
    if (code) { await marca("ok", code); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ${code}`); }
    else { await marca("sem_codigo"); sem++; }
  } catch (e) { falhas++; await marca("erro"); }
  if (i % 10 === 9) await dorme(250);
}
console.log(`\n[memory_entidade] ${ok} com código · ${sem} sem · ${falhas} falhas`);
await db.end();
