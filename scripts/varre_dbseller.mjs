// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_dbseller.mjs — procura o portal DBSeller (Angular + API PHP) nos municípios ainda sem folha.
//
// Prova de vida barata, sem sessão e sem parâmetro:
//   GET {host}/api/folha_pagamentos/getUltimaAtualizacao  → {"data_atualizacao":"2026-08-15"}
// Quem responde isso tem a tela de folha nominal do DBSeller (ver ingest_folha_dbseller.mjs para o contrato).
//
// Uso: UF=RS node scripts/varre_dbseller.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 10);
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
            "X-Requested-With": "XMLHttpRequest", accept: "application/json" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists dbseller_portal (
  cod_ibge text primary key, municipio text, uf text, base text, atualizado_em text,
  achado_em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[dbseller] ${muns.length} municípios ${UF} sem folha`);

// hosts já conhecidos do município (o portal nem sempre está em transparencia.{slug})
const conhecidos = new Map();
const addHost = (ibge, u) => {
  const m = String(u || "").match(/^(?:https?:\/\/)?([^/?#]+)/);
  if (!m || !/\./.test(m[1])) return;
  if (!conhecidos.has(ibge)) conhecidos.set(ibge, new Set());
  conhecidos.get(ibge).add(m[1].replace(/:\d+$/, ""));
};
for (const r of (await q(`select cod_ibge, url_visitada, url_pessoal from folha_diagnostico_faltante`).catch(() => ({ rows: [] }))).rows)
  { addHost(r.cod_ibge, r.url_visitada); addHost(r.cod_ibge, r.url_pessoal); }

// 🚨 `getUltimaAtualizacao` NÃO serve de prova: é rota das versões NOVAS do portal e devolve 404 nas antigas —
// Capela de Santana tem DBSeller e caiu fora por isso. A prova robusta é `getAnos/{i}`: qualquer JSON (mesmo `[]`)
// significa que a rota existe; HTML significa que o framework não a conhece, logo não é DBSeller.
async function prova(host) {
  let achouRota = false;
  for (const c of ["/getAnos/1", "/getAnos/2", "/getUltimaAtualizacao"]) {
    try {
      const r = await fetch(`https://${host}/api/folha_pagamentos${c}`, { headers: H, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const t = await r.text();
      if (!/^\s*[[{]/.test(t)) continue;
      achouRota = true;
      const j = JSON.parse(t);
      if (j && j.data_atualizacao) return j.data_atualizacao;
      if (Array.isArray(j) ? j.length : Object.keys(j).length) return "(anos publicados)";
    } catch { /* próxima rota */ }
  }
  return achouRota ? "(rota existe, sem anos na instituição testada)" : null;
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome);
    const hosts = new Set([`transparencia.${s}.rs.gov.br`, `transparencia.${s}.gov.br`,
                           ...(conhecidos.get(m.cod_ibge) || [])]);
    for (const h of hosts) {
      const at = await prova(h);
      if (!at) continue;
      achados++;
      console.log(`⭐ ${m.nome.padEnd(28)} → https://${h}/  (atualizado ${at})`);
      await q(`insert into dbseller_portal (cod_ibge, municipio, uf, base, atualizado_em)
        values ($1,$2,$3,$4,$5) on conflict (cod_ibge) do update set base=excluded.base,
        atualizado_em=excluded.atualizado_em, achado_em=now()`,
        [m.cod_ibge, m.nome, m.uf, `https://${h}`, at]);
      return;
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[dbseller] ${achados} portais achados`);
await db.end();
