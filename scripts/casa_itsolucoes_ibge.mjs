// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// casa_itsolucoes_ibge.mjs — resolve o município das entidades do portal IT Soluções.
//
// 🚨 O SLUG DO SITE NÃO TEM SEPARADOR: `afogadosdaingazeira.pe.leg.br`. Casar por nome com espaço deixou
// **4.293 de 5.513 linhas sem cod_ibge** — e dado sem município não conta cobertura nenhuma, por mais completo
// que seja ([[pnigp-catalogo-rnr-resolve-o-ente]]: identificar o ENTE é metade do trabalho).
// A regra: comparar as duas pontas COLAPSADAS (sem espaço, sem acento, sem hífen).
// ⚠️ Sigla não casa e não deve casar: `ipsj` fica sem município até alguém provar quem é — inventar município
// é pior do que deixar a lacuna.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

await q(`create or replace function nome_colapsado(t text) returns text language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]', '', 'g') $$`);

const antes = (await q(`select count(*) filter (where cod_ibge is null)::int sem from itsolucoes_entidade`)).rows[0].sem;
await q(`update itsolucoes_entidade e set cod_ibge = m.cod_ibge
  from municipios_br m
 where m.uf = e.uf and nome_colapsado(m.nome) = nome_colapsado(e.municipio_txt) and e.cod_ibge is null`);
const depois = (await q(`select count(*) filter (where cod_ibge is null)::int sem, count(*)::int n from itsolucoes_entidade`)).rows[0];
console.log(`entidades sem município: ${antes} → ${depois.sem} (de ${depois.n})`);

// propaga para as linhas já gravadas (o coletor guardou o p_i justamente para isso)
const r = await q(`update folha_servidores_itsolucoes f set cod_ibge = e.cod_ibge, municipio = m.nome
  from itsolucoes_entidade e join municipios_br m on m.cod_ibge = e.cod_ibge
 where e.p_i = f.p_i and f.cod_ibge is distinct from e.cod_ibge and e.cod_ibge is not null`);
console.log(`linhas de folha reatribuídas ao município: ${r.rowCount}`);

console.table((await q(`select uf, count(*) filter (where cod_ibge is null)::int sem_municipio,
   count(*)::int entidades from itsolucoes_entidade group by 1`)).rows);
console.table((await q(`select municipio_txt, entidade from itsolucoes_entidade where cod_ibge is null limit 12`)).rows);
await db.end();
