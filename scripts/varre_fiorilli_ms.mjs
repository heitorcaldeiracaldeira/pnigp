// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_fiorilli_ms.mjs — os 16 municípios de MS que o cadastro do TCE-MS diz serem FIORILLI e ainda não têm
// folha. O coletor SCPI existe; o que falta é o HOST. Varredura HOST × PORTA
// ([[pnigp-varredura-host-porta-onpremise]]) sobre o domínio institucional do município.
//
// POR QUÊ: o portal mapeado para vários deles é falso — Sidrolândia aponta para o Portal da Transparência
// FEDERAL, Iguatemi/Sete Quedas/Paranhos para a CÂMARA no sistemasbds, Dois Irmãos para o Quality.
// O SCPI on-premise vive em porta alta com caminho /transparencia/ ([[pnigp-fornecedor-e-host-nao-erp]]).
// Grava o que responder em portal_real_descoberto (linha própria, erp_radar='fiorilli-varredura'), de onde o
// ingest_folha_scpi.mjs já lê.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const PORTAS = ["8079", "5656", "879", "8078", "8082"];

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='50'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome, r.url_portal, r.site
    from municipios_br m
    join tc_ms_software_house s on s.cod_ibge = m.cod_ibge and s.razao_social ilike '%FIORILLI%'
    left join col c on c.c = m.cod_ibge
    left join lateral (select url_portal, site from radar_portal r2 where r2.cod_ibge=m.cod_ibge
                        and r2.unidade_gestora ilike 'Prefeitura%' limit 1) r on true
   where c.c is null order by m.nome`)).rows;
console.log(`[fiorilli/ms] ${alvos.length} municípios sem folha`);

const hostsDe = (a) => {
  const bruto = a.url_portal || a.site || "";
  const m = bruto.match(/([a-z0-9.-]+\.(?:ms\.gov\.br|gov\.br|com\.br|org))/i);
  const dom = m ? m[1].replace(/^www\./, "") : null;
  if (!dom) return [];
  const slug = a.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return [...new Set([dom, "transparencia." + dom, "portal." + dom, "pm" + slug + ".rcmsuporte.com.br",
                      slug + "ms.ddns.net", "swb." + dom, "contabilidade." + dom])];
};

let achados = 0;
for (const a of alvos) {
  const hosts = hostsDe(a);
  let ok = null;
  for (const h of hosts) {
    for (const p of PORTAS) {
      for (const esq of ["http", "https"]) {
        const u = `${esq}://${h}:${p}/transparencia/`;
        try {
          const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(9000) });
          if (!r.ok) continue;
          const t = await r.text();
          // a assinatura do SCPI: DevExpress + o link de servidores
          if (!/LnkServidores|dxgv|Transparencia/i.test(t)) continue;
          const camara = /c[âa]mara municipal/i.test(t) && !/prefeitura/i.test(t);
          ok = { url: u, camara, tam: t.length };
          break;
        } catch { /* host/porta fechado */ }
      }
      if (ok) break;
    }
    if (ok) break;
  }
  if (ok && !ok.camara) {
    await q(`insert into portal_real_descoberto (cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real, fornecedor)
      values ($1,'fiorilli-varredura',$2,'Mato Grosso do Sul',$3,$3,$4)
      on conflict (cod_ibge, erp_radar) do update set url_portal_real=excluded.url_portal_real, em=now()`,
      [a.cod_ibge, a.nome, ok.url, new URL(ok.url).host]);
    achados++;
    console.log(`  ✔ ${a.nome.padEnd(24)} ${ok.url}`);
  } else {
    console.log(`  ○ ${a.nome.padEnd(24)} ${ok ? "só CÂMARA" : "nenhuma porta respondeu"} (testados ${hosts.length} hosts)`);
  }
}
console.log(`\n[fiorilli/ms] ${achados} portais novos gravados — rodar: UF=MS node scripts/ingest_folha_scpi.mjs`);
await db.end();
