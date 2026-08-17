// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_bases_scpi.mjs — acha TODAS as bases SCPI de um município, não só a primeira.
//
// POR QUÊ: `portal_produto` tem PK em cod_ibge e guarda UMA base. Picos publica em três (`/prefeitura/`,
// `/educacao/`, `/saude/`) e só a prefeitura estava registrada: 1.321 servidores = 23% da RAIS. Com as três,
// 4.502 = 79%. Educação e Saúde juntas são 2,4× a prefeitura — perder as duas é perder a folha
// ([[pnigp-scpi-subcoleta-78-municipios]]).
//
// Grava em `scpi_base_extra`, que o `ingest_folha_scpi` consome via BASE= (uma execução por base).
//
// 🚨 Exclui CÂMARA por HOST e por PATH: `camarajunqueiropolis.dyndns.org` tinha cargos de ADVOGADO/CONTADOR e
//    passava por qualquer filtro de cargo ([[pnigp-entidade-espelho-infla-folha]]).
//
// Uso: node scripts/descobre_bases_scpi.mjs   · SO=picos · LIMITE=20
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const LIMITE = +(process.env.LIMITE || 40);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "text/html,*/*" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };
const pega = async (u) => {
  const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(30000) }).catch((e) => ({ erro: e.message }));
  if (r.erro) return { erro: r.erro };
  return { st: r.status, t: dec(Buffer.from(await r.arrayBuffer())), url: r.url };
};
// 🚨 câmara: ancorar no INÍCIO DO RÓTULO do host (www.cmibipora não casa com ^cm) e olhar também o PATH
const CAMARA = /(camara|(^|[./])cm[a-z]|-cm[./]|\.leg\.br|legislativ)/i;

await q(`create table if not exists scpi_base_extra (
  cod_ibge text, municipio text, uf text, base text, rotulo text,
  descoberto_em timestamptz default now(), primary key (cod_ibge, base)
)`);

// os subcoletados: coletor 'ok' e menos de 40% da RAIS, câmaras já fora
const alvos = (await q(`
  with c as (select cod_ibge, municipio, uf, count(*)::int n from folha_servidores_scpi group by 1,2,3),
  rais as (select cod_ibge6, count(*)::int v from folha_rais_municipal
           where ano = (select max(ano) from folha_rais_municipal) group by 1)
  select c.cod_ibge, c.municipio, c.uf, c.n, r.v rais, round(100.0*c.n/r.v)::int pct
  from c join rais r on r.cod_ibge6 = left(c.cod_ibge,6)
  where r.v > 300 and (100.0*c.n/r.v) < 40
    and not exists (select 1 from folha_scpi_coleta k where k.cod_ibge = c.cod_ibge and k.situacao like '%camara%')
    ${SO ? "and c.municipio ilike '%'||$1||'%'" : ""}
  order by (r.v - c.n) desc limit ${LIMITE}`, SO ? [SO] : [])).rows;
console.log(`[bases] ${alvos.length} municípios subcoletados\n`);

let achadas = 0;
for (const a of alvos) {
  // de onde partir: o portal do município no Radar, e a base que o coletor já usa
  const partidas = (await q(`select distinct url_portal u from radar_portal
    where cod_ibge = $1 and url_portal is not null and unidade_gestora ilike 'Prefeitura%'
    union select url from portal_produto where cod_ibge = $1`, [a.cod_ibge])).rows.map((r) => r.u).filter(Boolean);
  const bases = new Map();
  for (const p of partidas.slice(0, 3)) {
    const x = await pega(p);
    if (x.erro) continue;
    // 1º salto: a transparência
    const cand = [x.url];
    for (const m of x.t.matchAll(/<a[^>]+href=["']([^"']{3,200})["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
      if (!/transparen/i.test(m[1] + m[2])) continue;
      try { cand.push(new URL(m[1], x.url).href); } catch {}
    }
    for (const u of [...new Set(cand)].slice(0, 4)) {
      const y = u === x.url ? x : await pega(u);
      if (y.erro) continue;
      // ⭐ toda base SCPI se anuncia por `{base}?AcessoIndividual=Lnk...`
      for (const m of y.t.matchAll(/<a[^>]+href=["']([^"']*AcessoIndividual=Lnk[^"']*)["'][^>]*>([\s\S]{0,70}?)<\/a>/gi)) {
        let b; try { b = new URL(m[1], y.url).href.replace(/\?.*$/, ""); } catch { continue; }
        if (CAMARA.test(b)) continue;
        const rot = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
        if (!bases.has(b)) bases.set(b, rot);
      }
      await dorme(250);
    }
  }
  if (bases.size <= 1) { console.log(`   ○ ${a.municipio.padEnd(22)} ${a.pct}% · ${bases.size} base — não é o caso de base múltipla`); continue; }
  console.log(`   ⭐ ${a.municipio.padEnd(22)} ${a.pct}% (${a.n}/${a.rais}) · ${bases.size} BASES:`);
  for (const [b, rot] of bases) {
    console.log(`        ${b.slice(0, 68).padEnd(70)} ${rot}`);
    await q(`insert into scpi_base_extra (cod_ibge, municipio, uf, base, rotulo) values ($1,$2,$3,$4,$5)
             on conflict (cod_ibge, base) do nothing`, [a.cod_ibge, a.municipio, a.uf, b, rot]).catch(() => {});
    achadas++;
  }
}
console.log(`\n[bases] ${achadas} bases registradas em scpi_base_extra`);
await db.end();
