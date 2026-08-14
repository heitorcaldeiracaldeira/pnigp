// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_govbr.mjs — acha os municípios clientes da GovernançaBrasil e o host do portal `pronimtb`/cidade360,
// varrendo o site oficial de cada prefeitura (radar_portal) atrás da assinatura GovBR.
// Popula `govbr_portal` (host, banco) para o coletor `ingest_folha_govbr_auto.mjs`.
//
// Assinaturas: `{host}.cidade360.cloud`, `.../pronimtb/`, `geraxml.asp`, "Governança Brasil".
// O host que interessa é o do pronimtb (ex.: `webapp1-ijui.cidade360.cloud`). Banco default DW_LC131_AP_0 (prefeitura).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; };

await q(`create table if not exists govbr_portal (
  cod_ibge text primary key, municipio text, uf text, host text, banco text default 'DW_LC131_AP_0',
  situacao text, linhas int, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists govbr_descoberta (
  cod_ibge text primary key, municipio text, uf text, url_portal text, host text, situacao text, em timestamptz default now()
)`);

// extrai o host do pronimtb: prioriza um host com /pronimtb; senão qualquer *.cidade360.cloud
function achaHost(html) {
  let m = html.match(/https?:\/\/([a-z0-9.-]+)\/pronimtb\b/i);
  if (m) return m[1];
  m = html.match(/([a-z0-9-]+\.cidade360\.cloud)/i);
  if (m) return m[1];
  return null;
}

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
  order by uf, municipio`)).rows;
const feitos = new Set((await q(`select cod_ibge from govbr_descoberta where situacao in ('ok','sem_govbr')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[descobre_govbr] ${alvos.length} prefeituras · ${fila.length} na fila`);

async function baixa(url) {
  for (let t = 0; t < 2; t++) {
    try { const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.text(); return null; }
    catch { await dorme(1200); }
  }
  return null;
}

let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, host = null) =>
    q(`insert into govbr_descoberta (cod_ibge,municipio,uf,url_portal,host,situacao,em) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (cod_ibge) do update set host=excluded.host, situacao=excluded.situacao, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url_portal, host, situacao]);
  try {
    const html = await baixa(norm(a.url_portal));
    if (!html) { await marca("erro_site"); falhas++; continue; }
    const host = achaHost(html);
    if (host) {
      await marca("ok", host);
      await q(`insert into govbr_portal (cod_ibge,municipio,uf,host,situacao) values ($1,$2,$3,$4,'descoberto')
        on conflict (cod_ibge) do update set host=excluded.host, em=now()`, [a.cod_ibge, a.municipio, a.uf, host]);
      ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ${host}`);
    } else { await marca("sem_govbr"); sem++; }
  } catch (e) { falhas++; await marca("erro"); }
  if (i % 25 === 24) await dorme(300);
}
console.log(`\n[descobre_govbr] ${ok} clientes GovBR · ${sem} sem assinatura · ${falhas} falhas`);
const r = await q(`select count(*) n from govbr_portal where host is not null`);
console.log("govbr_portal com host:", r.rows[0].n);
await db.end();
