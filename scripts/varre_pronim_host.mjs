// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_pronim_host.mjs — acha o host do PRONIM/GovBR dos municípios que o Radar marca como `govbr` sem url_erp.
//
// O PRONIM aparece em três montagens, e nenhuma se deduz só do nome do município:
//   webapp1-{slug}.cidade360.cloud/pronimtb/       (nuvem da GovBR — o mais comum)
//   {qualquer host do município}/PRONIMTB/          (on-premise; Silveira Martins/RS roda em IP cru)
//   webapp{N}-{slug}.cidade360.cloud                (o número da instância varia)
//
// 🚨 usa `_rede.mjs`: sem `family:4` o fetch do Node dá `fetch failed` em host municipal que só atende IPv4 e a
// varredura inteira devolve zero ([[pnigp-fetch-node-ipv6-econnrefused]]).
//
// A prova é a tela do PRONIM responder — não o host existir ([[pnigp-sonda-soft404-falso-positivo]]).
//
// Uso: UF=MG node scripts/varre_pronim_host.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const F = partes.join(" union ");

const muns = (await q(`select distinct m.cod_ibge, m.nome, m.uf, r.url_portal
  from radar_portal r join municipios_br m on m.cod_ibge = r.cod_ibge
 where r.erp = 'govbr' ${UF ? "and m.uf = $1" : ""}
   and left(m.cod_ibge,6) not in (${F})
   and not exists (select 1 from govbr_portal g where g.cod_ibge = m.cod_ibge and g.host is not null)
 order by m.nome`, UF ? [UF] : [])).rows;
console.log(`[pronim-host] ${muns.length} municípios govbr sem host mapeado`);

// a tela existe? o índice do PRONIM traz o menu de transparência
async function prova(base) {
  for (const c of ["/pronimtb/index.asp", "/PRONIMTB/", "/pronimtb/"]) {
    for (const esq of ["https", "http"]) {
      try {
        const r = await fetch(`${esq}://${base}${c}`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const t = await r.text();
        // 🚨 200 não prova: o host pode devolver a home do município. Exigir marca do PRONIM.
        if (/pronim|cidade360|Gest[ãa]o de Pessoas|Portal da Transpar/i.test(t) && t.length > 3000) {
          return { url: `${esq}://${base}${c}`, titulo: (t.match(/<title[^>]*>([^<]+)</i) || [])[1]?.trim().slice(0, 50) };
        }
      } catch { /* próximo */ }
    }
  }
  return null;
}

let ok = 0, nao = 0;
for (const m of muns) {
  const s = so(m.nome);
  const uf = m.uf.toLowerCase();
  let host = null;
  try { host = m.url_portal ? new URL(m.url_portal.startsWith("http") ? m.url_portal : `https://${m.url_portal}`).hostname : null; } catch { /* ignora */ }
  const bases = [...new Set([
    `webapp1-${s}.cidade360.cloud`, `webapp2-${s}.cidade360.cloud`, `webapp1-pm${s}.cidade360.cloud`,
    host, `www.${s}.${uf}.gov.br`, `${s}.${uf}.gov.br`, `transparencia.${s}.${uf}.gov.br`,
  ].filter(Boolean))];
  let achado = null;
  for (const b of bases) { achado = await prova(b); if (achado) break; }
  if (!achado) { nao++; console.log(`   · ${m.nome}: nenhum host serve PRONIM`); continue; }
  ok++;
  const hostFinal = new URL(achado.url).hostname;
  console.log(`  ⭐ ${m.nome.padEnd(30)} ${hostFinal}  "${achado.titulo || ""}"`);
  await q(`insert into govbr_portal (cod_ibge, municipio, uf, host, situacao, detalhe, em)
    values ($1,$2,$3,$4,'pendente','host achado por varredura de molde',now())
    on conflict (cod_ibge) do update set host=excluded.host, em=now()`,
    [m.cod_ibge, m.nome, m.uf, hostFinal]);
}
console.log(`\n[pronim-host] ${ok} hosts achados · ${nao} sem PRONIM`);
await db.end();
