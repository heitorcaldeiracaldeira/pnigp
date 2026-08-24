// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// mapa_camara_por_fonte.mjs — onde a CÂMARA está ao alcance e não foi pedida.
//
// POR QUÊ: a busca mais barata de câmara não é fonte nova, é olhar as fontes onde JÁ colhemos a prefeitura e
// perguntar se o portal/catálogo distingue o legislativo ([[pnigp-catalogo-ja-tinha-a-camara]]). Foi assim que a
// BA foi de 2 para 412 num dia e que o IPM devolveu 68 câmaras sem uma requisição
// ([[pnigp-livro-razao-guarda-o-nome-que-o-coletor-jogou-fora]]).
//
// O QUE MEDE, por fonte: municípios com EXECUTIVO colhido × municípios com CÂMARA na camada × o VÃO entre os
// dois, e quantos servidores da RAIS do legislativo estão em jogo nesse vão — que é o que ordena o ataque
// ([[pnigp-medir-ineditismo-antes-de-escrever-coletor]]).
//
// ⚠️ Vão grande NÃO prova que a fonte tem a câmara: pode ser portal que serve só o executivo (o MunicípioOnline
//    tem 216 entidades nomeadas e nenhuma é câmara). O vão diz onde VALE OLHAR, não o que existe.
//
// Uso: node scripts/mapa_camara_por_fonte.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const r = await q(`
 with e as (select fonte, cod_ibge from vw_folha_municipal_brasil
             where cod_ibge is not null and fonte <> 'rais' and nome is not null and nome <> ''
             group by 1, 2),
      c as (select fonte, cod_ibge from vw_folha_camara_brasil
             where cod_ibge is not null group by 1, 2),
      -- a câmara pode vir de OUTRA fonte: o vão real é quem não tem câmara de fonte NENHUMA
      qualquer_camara as (select distinct cod_ibge from vw_folha_camara_brasil where cod_ibge is not null),
      rais as (select lpad(cod_ibge6,6,'0') k, count(*) filter (where ativo_3112)::int leg
                 from folha_rais_municipal
                where ano = (select max(ano) from folha_rais_municipal) and natureza_cod = '1066'
                group by 1)
 select e.fonte,
        count(*)::int munis_executivo,
        count(*) filter (where c.cod_ibge is not null)::int com_camara_mesma_fonte,
        count(*) filter (where qc.cod_ibge is null)::int vao_sem_camara_nenhuma,
        coalesce(sum(rais.leg) filter (where qc.cod_ibge is null), 0)::int rais_em_jogo
   from e
   left join c on c.fonte = e.fonte and c.cod_ibge = e.cod_ibge
   left join qualquer_camara qc on qc.cod_ibge = e.cod_ibge
   left join rais on rais.k = left(e.cod_ibge, 6)
  group by e.fonte
 having count(*) filter (where qc.cod_ibge is null) > 0
  order by rais_em_jogo desc`);

console.log(`${r.rowCount} fontes com município SEM câmara nenhuma\n`);
console.table(r.rows.slice(0, 25));
const tot = r.rows.reduce((a, x) => ({ m: a.m + x.vao_sem_camara_nenhuma, r: a.r + x.rais_em_jogo }), { m: 0, r: 0 });
console.log(`\nSoma dos vãos (municípios contados uma vez por fonte): ${tot.m} · RAIS do legislativo em jogo: ${tot.r.toLocaleString("pt-BR")}`);
await db.end();
