// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_fiorilli.mjs — acha a URL do portal Fiorilli de cada município identificado como 'fiorilli' pelo Radar.
//
// O Radar identificou Fiorilli por ASSINATURA na página, mas NÃO guardou a URL do portal (url_erp null). E há
// DOIS padrões de host:
//   A) Assessor Público / GeneXus: `s{N}.asp.srv.br/etransparencia.pm.{slug}.{uf}`  (SP-heavy; grid server-rendered)
//   B) dcfiorilli:                 `{slug}.dcfiorilli.com.br`
//
// Estratégia: baixa o HTML do site oficial (url_portal) e garima o link do portal Fiorilli (os dois padrões).
// Guarda em `fiorilli_portal` (base_url + padrao). Os que não expõem link no HTML cru ficam 'sem_link' para uma
// segunda passada com render JS depois. HTTP puro — rápido; a coleta pesada (Playwright) vem no scraper separado.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists fiorilli_portal (
  cod_ibge text primary key, municipio text, uf text, url_portal text,
  base_url text, padrao text, entidade text, situacao text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp='fiorilli' and unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows;

const feitos = new Set((await q(`select cod_ibge from fiorilli_portal where situacao in ('ok','sem_link')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[descobre_fiorilli] ${alvos.length} municípios · ${fila.length} na fila`);

function normUrl(u) {
  u = (u || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

// garima os dois padrões de host Fiorilli no HTML
function achaFiorilli(html) {
  // A) asp.srv.br/etransparencia.pm.{slug}.{uf}
  let m = html.match(/https?:\/\/s\d+\.asp\.srv\.br\/etransparencia\.pm\.[a-z0-9]+\.[a-z]{2}/i);
  if (m) return { base: m[0], padrao: "asp" };
  // sem protocolo mas com host
  m = html.match(/s\d+\.asp\.srv\.br\/etransparencia\.pm\.[a-z0-9]+\.[a-z]{2}/i);
  if (m) return { base: "https://" + m[0], padrao: "asp" };
  // B) {slug}.dcfiorilli.com.br
  m = html.match(/https?:\/\/[a-z0-9-]+\.dcfiorilli\.com\.br/i);
  if (m) return { base: m[0].replace(/^http:/, "https:"), padrao: "dcfiorilli" };
  m = html.match(/[a-z0-9-]+\.dcfiorilli\.com\.br/i);
  if (m) return { base: "https://" + m[0], padrao: "dcfiorilli" };
  return null;
}

async function baixa(url) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.text();
      return null;
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
}

let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, base = null, padrao = null, detalhe = null) =>
    q(`insert into fiorilli_portal (cod_ibge,municipio,uf,url_portal,base_url,padrao,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       base_url=excluded.base_url, padrao=excluded.padrao, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url_portal, base, padrao, situacao, detalhe]);
  try {
    const html = await baixa(normUrl(a.url_portal));
    if (!html) { await marca("erro_site", null, null, "site fora do ar"); falhas++; continue; }
    const f = achaFiorilli(html);
    if (f) { await marca("ok", f.base, f.padrao); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ${f.padrao}: ${f.base}`); }
    else { await marca("sem_link"); sem++; }
  } catch (e) { falhas++; await marca("erro", null, null, String(e.message).slice(0, 120)); }
  if (i % 20 === 19) await dorme(500);
}
console.log(`\n[descobre_fiorilli] ${ok} com URL · ${sem} sem link no HTML · ${falhas} falhas`);
const resumo = await q(`select padrao, count(*) n from fiorilli_portal where situacao='ok' group by padrao order by n desc`);
console.log("por padrão:", resumo.rows.map((r) => r.padrao + "=" + r.n).join(" "));
await db.end();
