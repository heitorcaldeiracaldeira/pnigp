// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_fiorilli_ms2.mjs — 2ª passada nos municípios de MS ainda sem folha. Amplia a v1 com os padrões que
// as coletas bem-sucedidas revelaram, e resolve o caso Chapadão: o host pode servir a CÂMARA mesmo com "pm"
// no nome — por isso cada candidato é classificado PREFEITURA vs CÂMARA antes de ser gravado.
//
// Padrões que já renderam em MS: transparencia.{dom}:8079/transparencia/ · pm{slug}.rcmsuporte.com.br (com e
// sem porta) · contabilidade.{dom}:8079 · swb.{dom}:8079 · {slug}ms.ddns.net:5656 · portal.{dom}:8079
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const PORTAS = ["8079", "5656", "879", "8078", "8082", ""];        // "" = sem porta (rcmsuporte serve assim)
const CAMINHOS = ["/transparencia/", "/Transparencia/", "/transparencia/Default.aspx"];

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
    left join col c on c.c = m.cod_ibge
    left join lateral (select url_portal, site from radar_portal r2 where r2.cod_ibge=m.cod_ibge
                        and r2.unidade_gestora ilike 'Prefeitura%' limit 1) r on true
   where m.uf='MS' and c.c is null order by m.nome`)).rows;
console.log(`[varre2/ms] ${alvos.length} municípios sem folha`);

const slugDe = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+ms$/, "").replace(/[^a-z0-9]/g, "");
const hostsDe = (a) => {
  const slug = slugDe(a.nome);
  const bruto = `${a.url_portal || ""} ${a.site || ""}`;
  const m = bruto.match(/([a-z0-9.-]+\.(?:ms\.gov\.br|gov\.br|com\.br|org\.br))/i);
  const dom = m ? m[1].replace(/^www\./, "") : `${slug}.ms.gov.br`;   // deriva quando o Radar não tem nada
  return [...new Set([
    `transparencia.${dom}`, `portal.${dom}`, `contabilidade.${dom}`, `swb.${dom}`, `intranet.${dom}`, dom,
    `pm${slug}.rcmsuporte.com.br`, `${slug}.rcmsuporte.com.br`, `scpi.${slug}.rcmsuporte.com.br`,
    `${slug}ms.ddns.net`, `${slug}.ddns.net`, `pm${slug}.ddns.net`,
    `${slug}ms.biosnet.com.br`, `${slug}.dcfiorilli.com.br`,
  ])];
};

let achados = 0, camaras = 0;
for (const a of alvos) {
  let melhor = null;
  for (const h of hostsDe(a)) {
    for (const p of PORTAS) {
      for (const cam of CAMINHOS) {
        const porta = p ? ":" + p : "";
        for (const esq of ["http", "https"]) {
          const u = `${esq}://${h}${porta}${cam}`;
          try {
            const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(7000) });
            if (!r.ok) continue;
            const t = await r.text();
            if (!/LnkServidores|dxgv|ProcessaDados/i.test(t)) continue;   // assinatura do SCPI
            // 🚨 CÂMARA vs PREFEITURA: "pm" no host não garante nada (Chapadão do Sul serve a câmara)
            const camara = /c[âa]mara municipal/i.test(t.slice(0, 20000));
            const pref = /prefeitura municipal/i.test(t.slice(0, 20000));
            const cand = { url: u, camara: camara && !pref, tam: t.length };
            if (!melhor || (melhor.camara && !cand.camara)) melhor = cand;
            if (melhor && !melhor.camara) break;
          } catch { /* fechado */ }
        }
        if (melhor && !melhor.camara) break;
      }
      if (melhor && !melhor.camara) break;
    }
    if (melhor && !melhor.camara) break;
  }
  if (melhor && !melhor.camara) {
    await q(`insert into portal_real_descoberto (cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real, fornecedor)
      values ($1,'fiorilli-varredura2',$2,'Mato Grosso do Sul',$3,$3,$4)
      on conflict (cod_ibge, erp_radar) do update set url_portal_real=excluded.url_portal_real, em=now()`,
      [a.cod_ibge, a.nome, melhor.url, new URL(melhor.url).host]);
    achados++;
    console.log(`  ✔ ${a.nome.padEnd(24)} ${melhor.url}`);
  } else if (melhor) {
    camaras++;
    console.log(`  ⚠ ${a.nome.padEnd(24)} só CÂMARA — ${melhor.url}`);
  } else {
    console.log(`  ○ ${a.nome.padEnd(24)} nenhum host respondeu`);
  }
}
console.log(`\n[varre2/ms] ${achados} prefeituras · ${camaras} só câmara — rodar: UF=MS node scripts/ingest_folha_scpi.mjs`);
await db.end();
