// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// corrige_portal_camara_ms.mjs — a descoberta mapeou o portal da CÂMARA (`/transparenciacm/`) em 16 municípios
// Fiorilli de MS. A variante `/transparencia/` no MESMO host é a PREFEITURA e responde em 15 deles.
// Grava a URL corrigida como uma linha PRÓPRIA em portal_real_descoberto (chave é cod_ibge+erp_radar, então
// a linha original fica intacta — guarda de [[pnigp-resondagem-sobrescreve-url-boa]]).
// 🚨 Só mexe em município SEM folha coletada: quem já produz dado não entra em re-sondagem.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

const alvos = (await q(`
  with col as (select distinct left(cod_ibge,7) c from folha_servidores_scpi where left(cod_ibge,2)='50')
  select distinct on (s.cod_ibge) s.cod_ibge, s.municipio, coalesce(p.url_portal_real, d.url_visitada) url
    from tc_ms_software_house s
    left join col c on c.c = s.cod_ibge
    left join lateral (select url_portal_real from portal_real_descoberto p2 where p2.cod_ibge=s.cod_ibge
                        and p2.url_portal_real is not null order by em desc limit 1) p on true
    left join folha_diagnostico_faltante d on d.cod_ibge = s.cod_ibge
   where c.c is null and coalesce(p.url_portal_real, d.url_visitada) ~* 'transparenciacm'`)).rows;

console.log(`${alvos.length} municípios de MS sem folha e com portal da câmara mapeado`);
let ok = 0;
for (const a of alvos) {
  // limpa o querystring: `?AcessoIndividual=lnkESIC` leva a tela do e-SIC, não à raiz do portal
  const alt = a.url.replace(/transparenciacm/i, "transparencia").split(/[?#]/)[0].replace(/\/*$/, "") + "/";
  try {
    const r = await fetch(alt, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    if (!r.ok || !/prefeitura/i.test(t)) { console.log(`  ✖ ${a.municipio}: HTTP ${r.status}, sem marca de prefeitura`); continue; }
    await q(`insert into portal_real_descoberto (cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real, fornecedor)
      values ($1,'fiorilli-pref',$2,'Mato Grosso do Sul',$3,$3,$4)
      on conflict (cod_ibge, erp_radar) do update set url_portal_real=excluded.url_portal_real, em=now()`,
      [a.cod_ibge, a.municipio, alt, new URL(alt).host]);
    console.log(`  ✔ ${a.municipio.padEnd(20)} ${alt}`);
    ok++;
  } catch (e) { console.log(`  ✖ ${a.municipio}: ${e.cause?.code || e.message.slice(0, 30)}`); }
}
console.log(`\n${ok} portais de PREFEITURA gravados — o coletor SCPI já lê de portal_real_descoberto`);
await db.end();
