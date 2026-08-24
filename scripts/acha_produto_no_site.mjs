// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// acha_produto_no_site.mjs — o município está sem folha porque o CADASTRO aponta para o lugar errado, não porque
// falte coletor. Carvalhos/MG estava registrado como `www.carvalhos.mg.gov.br/#` e o link real do produto
// (`pm-carvalhos.publicacao.siplanweb.com.br/pessoal`) estava no menu "Folha de Pagamento 2025" do próprio site.
// Nova Aurora/GO idem, com o radar apontando para a CÂMARA.
//
// Este script abre o SITE do município e procura, nos links, os HOSTS dos produtos que já sabemos coletar.
// Quem casar vira candidato em `folha_portal_candidato` com a procedência anotada — o coletor daquele produto
// dá o veredito ([[pnigp-verificacao-publicacao-por-site]], [[pnigp-municipio-inalcancavel-pela-fila]]).
//
// Uso: UFS=MG,SP node scripts/acha_produto_no_site.mjs   ·   APLICAR=1 grava   ·   LIMITE=50
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const UFS = (process.env.UFS || "MG,SP").split(",");
const LIMITE = Number(process.env.LIMITE || 400);
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// host → produto que já tem coletor
const PRODUTOS = [
  [/publicacao\.siplanweb\.com\.br/i, "siplanweb"],
  [/megasofttransparencia\.com\.br/i, "megasoft"],
  [/dcfiorilli\.com\.br|:(8079|5656|879)\//i, "scpi"],
  [/e-gov\.betha\.com\.br|betha\.com\.br\/transparencia/i, "betha"],
  [/atende\.net/i, "ipm"],
  [/elotech\.com\.br|transparencia\.elotech/i, "elotech"],
  [/portaltp\.com\.br/i, "portaltp"],
  [/cidadesmg\.com\.br/i, "cidadesmg"],
  [/asp\.srv\.br|gp\.srv\.br/i, "genexus_srvbr"],
  [/sgpcloud\.net/i, "scpi"],
  [/govbr|portaldatransparencia\.gov\.br/i, null],      // reconhece mas NÃO é alvo: é o portal federal
];

const alvos = (await q(`with com as (select distinct cod_ibge from vw_folha_municipal_brasil where fonte<>'rais' and cod_ibge is not null)
  select distinct on (m.cod_ibge) m.cod_ibge, m.nome municipio, m.uf,
    coalesce(d.url_visitada, r.url_portal, r.url_erp) site
  from municipios_br m
  left join com c on c.cod_ibge = m.cod_ibge
  left join folha_diagnostico_faltante d on d.cod_ibge = m.cod_ibge
  left join radar_portal r on r.cod_ibge = m.cod_ibge
  where m.uf = any($1) and c.cod_ibge is null
    and coalesce(d.url_visitada, r.url_portal, r.url_erp) is not null
    and not exists (select 1 from folha_portal_candidato fc where fc.cod_ibge = m.cod_ibge)
  order by m.cod_ibge, d.em desc nulls last limit $2`, [UFS, LIMITE])).rows;
console.log(`${alvos.length} municípios sem folha para varrer\n`);

let achados = 0;
for (const a of alvos) {
  let html = "";
  try {
    const r = await fetch(a.site, { headers: H, redirect: "follow", signal: AbortSignal.timeout(25000) });
    if (!r.ok) continue;
    html = await r.text();
  } catch { continue; }
  // só links cujo TEXTO fala de pessoal — senão qualquer rodapé de fornecedor vira falso alvo
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,90}?)<\/a>/gi)]
    .map((m) => ({ href: m[1], txt: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }))
    // 🚨 casar no TEXTO ou na ROTA, nunca no HOSTNAME: `servidor.meridiano.sp.gov.br:8079/comprasedital/` entrou
    //    como folha porque a palavra "servidor" estava no HOST — o link era de LICITAÇÃO.
    .filter((x) => {
      const rota = (() => { try { return new URL(x.href, a.site).pathname + new URL(x.href, a.site).search; } catch { return x.href; } })();
      return /servidor|pessoal|folha|remunera|sal[áa]rio|contracheque/i.test(x.txt)
          || /pessoal|folha|servidores|remunera|contracheque/i.test(rota);
    });
  for (const l of links) {
    const url = l.href.startsWith("http") ? l.href : new URL(l.href, a.site).href;
    const hit = PRODUTOS.find(([re]) => re.test(url));
    if (!hit || !hit[1]) continue;
    // 🚨 O HOST DIZ A ENTIDADE nesses produtos: `cm-` é CÂMARA e `pm-` é prefeitura. Dos 5 achados na primeira
    //    passada, TRÊS eram câmara (cm-blonga, cm-pouso, cm-saaventureiro) — gravá-los encheria a fila de alvo
    //    que o próprio coletor descarta depois ([[pnigp-radar-mapeou-a-camara-causa-nacional]]).
    if (/\/\/cm-|\/\/cm\.|camara|c[âa]mara|\.leg\.br/i.test(url)) {
      console.log(`  ·  ${a.uf} ${a.municipio.padEnd(24)} ${hit[1].padEnd(14)} CÂMARA — descartado (${url.slice(0, 46)})`);
      break;
    }
    achados++;
    console.log(`  ✅ ${a.uf} ${a.municipio.padEnd(24)} ${hit[1].padEnd(14)} ${url.slice(0, 62)}   ← "${l.txt.slice(0, 26)}"`);
    if (APLICAR) {
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
        values ($1,$2,$3,$4,$5,'link de pessoal no site oficial (20/ago/2026)', now()) on conflict do nothing`,
        [a.cod_ibge, a.municipio, a.uf, hit[1], url]);
    }
    break;                                                  // um produto por município basta
  }
}
console.log(`\n${achados} municípios com produto conhecido no site${APLICAR ? " — gravados como candidato" : " (DRY — APLICAR=1 grava)"}`);
await db.end();
