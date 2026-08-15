// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// roteia_portais_descobertos.mjs — pega o que `descobre_portal_real.mjs` achou e ALIMENTA as tabelas de portal dos
// coletores que já existem. Sem isso, a descoberta fica parada numa tabela e nenhum coletor a enxerga.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

// ⚠️ TRÊS fontes de descoberta, não uma. `portal_real_descoberto` é só a mais antiga; depois vieram o
// identificador por assinatura (grava `radar_portal.url_erp`) e a derivação de domínio
// (`site_municipal_derivado`). Ler só a primeira deixava descoberta parada sem nenhum coletor enxergar —
// exatamente o defeito que este script existe para evitar.
// A `base` acompanha cada linha porque o ERP às vezes aparece como caminho RELATIVO (`/pronimtb/`): o GovBR tem
// duas hospedagens — `webapp1-{slug}.cidade360.cloud` E o PRONIM servido no domínio do próprio município.
const linhas = (await q(`
  select cod_ibge, municipio, uf, url_portal_real url, url_portal_real base from portal_real_descoberto
   where url_portal_real is not null
  union all
  select cod_ibge, municipio, uf, url_erp, coalesce(url_portal, site) from radar_portal
   where url_erp is not null
  union all
  select cod_ibge, municipio, uf, url_erp, url_site from site_municipal_derivado
   where url_erp is not null`)).rows;
console.log(`${linhas.length} portais descobertos (3 fontes)`);

// resolve caminho relativo contra a base; devolve o HOST
function hostDe(url, base) {
  try { return new URL(url).host; } catch { /* sem protocolo: pode ser domínio nu OU caminho relativo */ }
  // 🚨 `webapp1-pmfeliz.cidade360.cloud` é HOST sem protocolo, não caminho: tratá-lo como relativo resolvia
  // contra a base e gravava o domínio do MUNICÍPIO no lugar do host do ERP.
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) {
    try { return new URL("https://" + url).host; } catch { /* segue para a base */ }
  }
  if (!base) return null;
  try { return new URL(url, base.startsWith("http") ? base : "https://" + base).host; } catch { return null; }
}
// o host do FORNECEDOR é mais específico que o do município e deve vencer um já gravado
const hostDeFornecedor = (h) => /cidade360|govbr\.cloud/i.test(h || "");

// 🚨 CONTAMINAÇÃO ENTRE MUNICÍPIOS: a descoberta trouxe `cosmopolis.govbr.cloud` (Cosmópolis/SP) para Fortaleza
// dos Valos/RS. Um host errado não falha — ele COLETA A FOLHA DE OUTRO MUNICÍPIO, que é bem pior que não coletar.
// Exigência: o slug do município tem de aparecer no host. Perde-se algum host abreviado; não se perde a base.
const so = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const hostDoMunicipio = (host, municipio) => {
  const h = so(host), m = so(municipio);
  return !!h && !!m && h.includes(m);
};

let govbr = 0, equi = 0, teno = 0, betha = 0, rejeitados = 0;
for (const x of linhas) {
  const u = x.url;
  if (!u) continue;
  // GovBR/cidade360: o coletor usa govbr_portal(host)
  if (/cidade360|govbr|pronimtb/i.test(u)) {
    const host = hostDe(u, x.base);
    if (host && !hostDoMunicipio(host, x.municipio)) { rejeitados++; continue; }
    if (host) {
      await q(`insert into govbr_portal (cod_ibge,municipio,uf,host,situacao,em) values ($1,$2,$3,$4,'descoberto',now())
        on conflict (cod_ibge) do update set
          host = case when $5 then excluded.host else coalesce(govbr_portal.host, excluded.host) end, em=now()`,
        [x.cod_ibge, x.municipio, x.uf, host, hostDeFornecedor(host)]);
      govbr++;
    }
  }
  // Equiplano: equiplano_portal(base_url)
  if (/equiplano/i.test(u)) {
    const base = u.replace(/\/+$/, "");
    await q(`insert into equiplano_portal (cod_ibge,municipio,uf,base_url,em) values ($1,$2,$3,$4,now())
      on conflict (cod_ibge) do update set base_url=coalesce(equiplano_portal.base_url, excluded.base_url), em=now()`,
      [x.cod_ibge, x.municipio, x.uf, base]);
    equi++;
  }
  // Tenosoft: tenosoft_portal(entidade)
  const ent = (u.match(/entidade=(\d+)/) || [])[1];
  if (ent && /tenosoft/i.test(u)) {
    await q(`insert into tenosoft_portal (cod_ibge,municipio,uf,entidade,em) values ($1,$2,$3,$4,now())
      on conflict (cod_ibge) do update set entidade=coalesce(tenosoft_portal.entidade, excluded.entidade), em=now()`,
      [x.cod_ibge, x.municipio, x.uf, ent]);
    teno++;
  }
  if (/betha/i.test(u)) betha++;
}
console.log(`roteados: govbr=${govbr} · equiplano=${equi} · tenosoft=${teno} · (betha=${betha} já vem do catálogo próprio)`);
console.log(`rejeitados por host de OUTRO município: ${rejeitados}`);

// higiene do que já entrou antes desta regra existir
const limpos = await q(`update govbr_portal g set host = null, situacao = 'host_suspeito'
  from municipios_br m where m.cod_ibge = g.cod_ibge and g.host is not null
    and position(regexp_replace(lower(translate(m.nome,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC')),'[^a-z0-9]','','g')
                 in regexp_replace(lower(g.host),'[^a-z0-9]','','g')) = 0
  returning g.municipio, g.uf`);
console.log(`govbr_portal: ${limpos.rowCount} hosts suspeitos limpos` +
  (limpos.rowCount ? " — " + limpos.rows.slice(0, 8).map((r) => `${r.municipio}/${r.uf}`).join(", ") : ""));
await db.end();
