// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_cidadesmg_whitelabel.mjs — o CidadesMG (Síntese Tecnologia) também roda em SUBDOMÍNIO do município.
//
// ⭐ Achado em 18/ago/2026 conferindo à mão por que a varredura de PRONIM deu 0 de 8: o Radar marca Capelinha
// como `govbr`, mas o site linka `pmcapelinha.cidadesmg.com.br/portaltransparencia/` — o mesmo produto do
// `cidadesmg.com.br/portaltransparencia/?Param={slug}`, servido em white-label
// ([[pnigp-portal-proprio-e-white-label]], [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// Moldes testados: `pm{slug}.cidadesmg.com.br` · `{slug}.cidadesmg.com.br` · e o compartilhado com `?Param=`.
// 🚨 usa `_rede.mjs` (family:4) — sem ele o fetch falha em host municipal IPv4-only e a varredura dá zero.
//
// Uso: UF=MG node scripts/varre_cidadesmg_whitelabel.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "MG";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[cidadesmg-wl] ${muns.length} municípios ${UF} sem folha`);

// prova: a página do portal cita o município E tem a marca do produto
async function prova(url, nome) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const t = await r.text();
    if (t.length < 2000) return null;
    if (!/portaltransparencia|S[íi]ntese Tecnologia|cidadesmg/i.test(t)) return null;
    // 🚨 host de white-label serve vários municípios: exigir que a página declare ESTE
    // ([[pnigp-entidade-declarada-e-a-prova]])
    const escapado = nome.replace(/[^\w\s]/g, ".").replace(/\s+/g, "\s*");
    const re = new RegExp(escapado, "i");
    return re.test(t.slice(0, 20000)) ? url : null;
  } catch { return null; }
}

let ok = 0;
for (const m of muns) {
  const s = so(m.nome);
  const urls = [
    `https://pm${s}.cidadesmg.com.br/portaltransparencia/`,
    `https://${s}.cidadesmg.com.br/portaltransparencia/`,
    `http://pm${s}.cidadesmg.com.br/portaltransparencia/`,
  ];
  let achado = null;
  for (const u of urls) { achado = await prova(u, m.nome); if (achado) break; }
  if (!achado) continue;
  ok++;
  console.log(`⭐ ${m.nome.padEnd(28)} ${achado}`);
  await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
    values ($1,$2,$3,'cidadesmg',$4,'white-label cidadesmg em subdomínio',now())
    on conflict (cod_ibge, url) do nothing`, [m.cod_ibge, m.nome, m.uf, achado]);
}
console.log(`\n[cidadesmg-wl] ${ok} portais achados`);
await db.end();
