// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_gpecloud.mjs — procura o GPE Cloud pelo molde `{pm}{slug}-transparencia.gpecloud.com.br`.
//
// ⭐ O crt.sh NÃO enumera este produto: o certificado é wildcard `*.gpecloud.com.br`, então o log de
// transparência lista 11 hosts quando existem dezenas ([[pnigp-crtsh-host-pelo-certificado]] tem esse limite).
// Onde o certificado é wildcard, volta-se ao molde de nome.
//
// A prova: `GET /exportar/remuneracao?meta=1` devolver `{"ultima":"AAAA-MM-DD HH:MM:SS"}` — a data da última
// carga. Não é HTTP 200: é o conteúdo ([[pnigp-sonda-soft404-falso-positivo]]).
//
// Uso: node scripts/varre_gpecloud.mjs      · UF=MG · TODOS=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const TODOS = process.env.TODOS === "1";
const PARALELO = Number(process.env.PARALELO || 20);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br where 1=1
  ${UF ? `and uf = '${String(UF).replace(/'/g, "")}'` : ""}
  ${TODOS ? "" : `and left(cod_ibge,6) not in (${partes.join(" union ")})`} order by uf, nome`)).rows;
console.log(`[gpecloud] ${muns.length} municípios a sondar${UF ? ` em ${UF}` : " no país"}\n`);

let achados = 0;
const sonda = async (m) => {
  for (const host of [`pm${so(m.nome)}-transparencia`, `${so(m.nome)}-transparencia`, `pm${so(m.nome)}`]) {
    try {
      const r = await fetch(`https://${host}.gpecloud.com.br/exportar/remuneracao?meta=1`,
        { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const t = await r.text();
      const u = (() => { try { return JSON.parse(t).ultima ?? null; } catch { return null; } })();
      if (!u) continue;
      achados++;
      console.log(`  ⭐ ${m.uf} ${m.nome.padEnd(26)} ${host}  · última carga ${u}`);
      await q(`insert into folha_portal_candidato (cod_ibge,municipio,uf,produto,url,achado_via,achado_em)
        values ($1,$2,$3,'gpecloud',$4,'molde {slug}-transparencia.gpecloud.com.br',now())
        on conflict (cod_ibge,url) do nothing`, [m.cod_ibge, m.nome, m.uf, `https://${host}.gpecloud.com.br/`]);
      return;
    } catch { /* próximo molde */ }
  }
};
for (let i = 0; i < muns.length; i += PARALELO) {
  await Promise.all(muns.slice(i, i + PARALELO).map(sonda));
  if (i && i % 400 === 0) console.log(`      … ${i}/${muns.length}, ${achados} achados`);
}
console.log(`\n[gpecloud] ${achados} municípios no produto`);
await db.end();
