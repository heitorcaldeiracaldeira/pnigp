// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_catalogo_rnr_cr2.mjs — ⭐ CATÁLOGO NACIONAL DE PORTAS DE FOLHA, de graça, pela própria fonte.
//
// O portal CR2 (portalcr2.com.br) é um app Bubble.io com a **Data API pública**: `/api/1.1/meta` lista 61 tipos e
// um deles é `relacao_nominal_remuneracao`. Cada registro traz `linkRNR` — o link DIRETO da folha nominal daquele
// ente, no produto que ele usa. São 707 links em mais de 20 plataformas diferentes.
//
// 🚨 Não confundir com a página pública do CR2: `/relacao-remuneracao/relacao-nominal-remuneracao-{slug}` é
// SOFT-404 — devolve 200 e o mesmo tamanho para qualquer nome inventado ([[pnigp-sonda-soft404-falso-positivo]]).
// O que vale é a API.
//
// Uso: node scripts/ingest_catalogo_rnr_cr2.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
const B = "https://www.portalcr2.com.br/api/1.1/obj/relacao_nominal_remuneracao";

await q(`create table if not exists folha_catalogo_rnr (
  id text primary key, ano text, descricao text, link text, host text, produto text,
  cod_fonte text, cod_ibge text, municipio text, uf text, em timestamptz default now())`);

// o produto sai do HOST — é o link que manda, não a menção textual ([[pnigp-link-sistema-origem-fonte-do-portal]])
const PRODUTO = [
  [/layoutsistemas/i, "layout"], [/governotransparente/i, "aspec"], [/rpmsolucoes/i, "rpm"],
  [/betha/i, "betha"], [/portaltp/i, "portaltp"], [/atende\.net/i, "ipm"], [/agilicloud/i, "agili"],
  [/drhtransparencia/i, "drh"], [/fenix/i, "fenix"], [/aossoftware/i, "aos"], [/gp\.srv\.br/i, "gp"],
  [/scpi|:8079/i, "scpi"], [/transparenciamunicipalaam/i, "amaam"], [/cdn\.bubble\.io/i, "arquivo-no-cr2"],
  [/drive\.google|datastudio\.google|lookerstudio\.google/i, "google"], [/elotech/i, "elotech"],
  [/cr2transparencia|cr2\.site/i, "cr2"],
  // 🚨 segunda passada: 171 links caíam em "(host novo)" e boa parte era produto que já conhecemos com outro
  // domínio. Host novo de verdade é o que sobra DEPOIS desta lista — e é ali que vale investir coletor.
  [/govbr\.cloud|pronimtb/i, "govbr"], [/cidadesmg/i, "cidadesmg"], [/smarapd/i, "smarapd"],
  [/memory\.com\.br/i, "memory"], [/municipioonline/i, "municipioonline"], [/instarmob|instar/i, "instar"],
  [/realizainformatica/i, "realiza"], [/setorpessoal/i, "setorpessoal"], [/gestaofiscal\.org/i, "gestaofiscal"],
  [/portalpmc/i, "portalpmc"], [/\.leg\.br|\.gov\.br/i, "site-do-proprio-ente"],
];
const todos = [];
for (let cursor = 0; ; cursor += 100) {
  const r = await fetch(`${B}?limit=100&cursor=${cursor}`, { headers: UA, signal: AbortSignal.timeout(45000) });
  const j = await r.json();
  const rs = j.response?.results || [];
  todos.push(...rs);
  if (!j.response?.remaining || !rs.length) break;
}
const linhas = [];
for (const x of todos) {
  if (!x.linkRNR) continue;
  let host = null; try { host = new URL(x.linkRNR).host; } catch { continue; }
  const produto = (PRODUTO.find(([re]) => re.test(host)) || [, null])[1];
  // o código do ente aparece na rota de vários produtos: /150013102/foff/... → IBGE de 7 dígitos + sufixo
  const cod = (x.linkRNR.match(/\/(\d{7})\d{0,2}\//) || [])[1] || null;
  linhas.push({ id: x._id, ano: x.ano || null, descricao: x.descricao || null, link: x.linkRNR, host, produto, cod_fonte: cod });
}
for (let i = 0; i < linhas.length; i += 200) {
  const p = linhas.slice(i, i + 200); const c = (f) => p.map((z) => z[f]);
  await q(`insert into folha_catalogo_rnr (id,ano,descricao,link,host,produto,cod_fonte)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
    on conflict (id) do update set ano=excluded.ano, link=excluded.link, host=excluded.host,
      produto=excluded.produto, cod_fonte=excluded.cod_fonte, em=now()`,
    [c("id"), c("ano"), c("descricao"), c("link"), c("host"), c("produto"), c("cod_fonte")]);
}
// casa o código do ente com o município do IBGE quando o link traz o código
await q(`update folha_catalogo_rnr c set cod_ibge = m.cod_ibge, municipio = m.nome, uf = m.uf
  from municipios_br m where m.cod_ibge = c.cod_fonte and c.cod_ibge is null`);
console.log(`${linhas.length} links de folha nominal gravados`);
console.table((await q(`select coalesce(produto,'(host novo)') produto, count(*) n,
  count(*) filter (where cod_ibge is not null) com_municipio from folha_catalogo_rnr group by 1 order by 2 desc`)).rows);
console.table((await q(`select uf, count(*) n from folha_catalogo_rnr where uf is not null group by 1 order by 2 desc limit 10`)).rows);
await db.end();
