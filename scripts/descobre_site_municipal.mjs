// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_site_municipal.mjs — acha o SITE do município quando o Radar da ATRICON não cadastrou nenhuma URL,
// e identifica o ERP a partir dele (mesmo dicionário de assinaturas do identifica_erp_por_pagina).
//
// POR QUE existe: no RS, 107 das 497 prefeituras estão no Radar SEM `url_portal` e SEM `site` — o cadastro
// simplesmente não os traz. Para esses, o identificador por página não tem por onde começar e eles saem da
// varredura como "não identificado", indistinguíveis de quem não publica. A lacuna é do CADASTRO, não do
// município ([[pnigp-tc-lacuna-581-municipios]] faz a mesma distinção para os tribunais).
//
// AS DUAS ROTAS, nesta ordem (a primeira é prova, a segunda é palpite verificado):
//   1. OUTRA UG do mesmo município no Radar (câmara, fundo, autarquia) que TENHA url — o domínio do ente costuma
//      ser o mesmo, e isso é dado cadastrado, não inferência.
//   2. Derivação do domínio institucional: {slug}.{uf}.gov.br e variantes com prefixo.
//
// 🚨 O 200 NÃO BASTA — domínio parqueado, página de registrador e catch-all de hospedagem respondem 200 com
// cara de site ([[pnigp-sonda-soft404-falso-positivo]]). Por isso todo candidato passa por CONFIRMAÇÃO de
// conteúdo: o corpo tem de falar de prefeitura/município. Sem isso, a base ganharia domínio errado com
// aparência de acerto.
//
// Uso: UF=RS node scripts/descobre_site_municipal.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF, NOME_ESTADO } from "./_uf.mjs";
import { slugDe } from "./_erp_receitas.mjs";
import { identifica, linkTransparencia, baixa } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 10);
const uf = SG_UF.toLowerCase();

await q(`create table if not exists site_municipal_derivado (
  cod_ibge text primary key, municipio text, uf text,
  url_site text, origem text, erp text, url_erp text, erp_via text, em timestamptz default now()
)`);

// alvos: municípios da UF cuja PREFEITURA no Radar não tem URL nenhuma para começar
const alvos = (await q(`select m.cod_ibge, m.nome, m.uf from municipios_br m
  where m.uf = $1 and exists (
    select 1 from radar_portal r where r.cod_ibge = m.cod_ibge
      and r.unidade_gestora ilike 'Prefeitura%'
      and (r.url_portal is null or r.url_portal = '-') and (r.site is null or r.site = '-'))
  order by m.nome`, [SG_UF])).rows;

// rota 1: outra unidade gestora do mesmo município já traz uma URL cadastrada
const porOutraUg = new Map((await q(`select cod_ibge, min(url_portal) url from radar_portal
  where uf = $1 and url_portal is not null and url_portal <> '-' group by cod_ibge`, [NOME_ESTADO]))
  .rows.map((r) => [r.cod_ibge, r.url]));

console.log(`[site/${SG_UF}] ${alvos.length} municípios sem URL no Radar · ${CONC} em paralelo`);

// rota 2: candidatos derivados. Ordem = do mais provável ao menos.
const candidatos = (slug) => [
  `https://www.${slug}.${uf}.gov.br`,
  `https://${slug}.${uf}.gov.br`,
  `https://www.prefeitura${slug}.${uf}.gov.br`,
  `https://www.pm${slug}.${uf}.gov.br`,
  // municípios pequenos às vezes ficam fora do .gov.br; só entra porque a confirmação de conteúdo filtra o resto
  `https://www.${slug}.com.br`,
];

// 🚨 a confirmação que separa site de prefeitura de domínio parqueado
const ehPrefeitura = (html) => /prefeitura|munic[íi]pio|gov\.br/i.test(html);

async function resolve(mun) {
  // rota 1 — URL de outra UG do mesmo ente (dado cadastrado)
  const daUg = porOutraUg.get(mun.cod_ibge);
  if (daUg) {
    const html = await baixa(daUg.startsWith("http") ? daUg : "https://" + daUg, 25000);
    if (html && ehPrefeitura(html)) return { url: daUg, origem: "outra-ug", html };
  }
  // rota 2 — derivação do domínio
  for (const url of [...new Set(candidatos(slugDe(mun.nome)))]) {
    const html = await baixa(url, 20000);
    if (html && ehPrefeitura(html)) return { url, origem: "derivado", html };
  }
  return null;
}

let achouSite = 0, achouErp = 0, n = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  const bloco = alvos.slice(i, i + CONC);
  const res = await Promise.all(bloco.map(async (m) => {
    const r = await resolve(m);
    if (!r) return { m, site: null };
    let ident = identifica(r.html);
    // 2º salto: o portal de transparência quase nunca está na home
    if (!ident.erp) {
      const alvo = linkTransparencia(r.html, r.url);
      if (alvo && !/\.gov\.br\/?$/i.test(alvo)) {
        const h2 = await baixa(alvo, 25000);
        if (h2) { const i2 = identifica(h2); if (i2.erp) ident = { ...i2, via: i2.via + "-2salto" }; }
      }
    }
    return { m, site: r.url, origem: r.origem, ...ident };
  }));

  for (const r of res) {
    if (!r.site) continue;
    achouSite++;
    if (r.erp) achouErp++;
    await q(`insert into site_municipal_derivado (cod_ibge,municipio,uf,url_site,origem,erp,url_erp,erp_via,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
      url_site=excluded.url_site, origem=excluded.origem, erp=excluded.erp, url_erp=excluded.url_erp,
      erp_via=excluded.erp_via, em=now()`,
      [r.m.cod_ibge, r.m.nome, r.m.uf, r.site, r.origem, r.erp, r.urlErp, r.via]);
    // devolve o achado ao Radar SEM apagar o cadastro original: só as colunas de identificação de ERP.
    if (r.erp) {
      await q(`update radar_portal set erp = coalesce($1, erp), url_erp = coalesce($2, url_erp),
               erp_via = $3, checado_em = now()
               where cod_ibge = $4 and unidade_gestora ilike 'Prefeitura%'`,
        [r.erp, r.urlErp, "site-derivado:" + r.via, r.m.cod_ibge]);
    }
  }
  n += bloco.length;
  process.stdout.write(`   ${n}/${alvos.length} · ${achouSite} sites · ${achouErp} com ERP\r`);
}

console.log(`\n[site/${SG_UF}] ${achouSite}/${alvos.length} sites achados · ${achouErp} com ERP identificado`);
console.table((await q(`select coalesce(erp,'(site achado, ERP não revelado)') erp, origem, count(*) mun
  from site_municipal_derivado where uf=$1 group by 1,2 order by 3 desc`, [SG_UF])).rows);
await db.end();
