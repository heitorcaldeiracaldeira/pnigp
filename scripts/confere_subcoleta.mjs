// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// confere_subcoleta.mjs — cruza a folha PUBLICADA com a RAIS e lista quem está "coletado" mas SUBCOLETADO.
//
// POR QUÊ: no RS, 22 municípios passavam por prontos e traziam uma fração do quadro — só o denominador
// externo denunciou ([[pnigp-conferidor-rais-denominador-folha]], [[pnigp-competencia-mais-cheia-nao-a-recente]]).
// Riachinho/TO acabou de repetir: 88 servidores para 532 vínculos (16,5%) e entrou como sucesso.
//
// ⚠️ O QUE NÃO É SUBCOLETA (por isso a lista sai anotada, não como culpa do coletor):
//   • a RAIS conta o vínculo em 31/12 e inclui a CÂMARA, que está fora do nosso escopo;
//   • município que publica só a Prefeitura naturalmente fica abaixo se tem fundos/autarquias grandes;
//   • fonte de cadastro sem valor (Contass) ou tabela de vencimentos (Digifred) não é folha de pessoa.
// Por isso o corte é BAIXO (<35%) e o relatório mostra a FONTE — o padrão por fonte é que acusa defeito.
//
// Uso: UFS=52,17 node scripts/confere_subcoleta.mjs   ·  sem UFS, roda o país
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
// ⚠️ NÃO usar a env UF: o _uf.mjs (importado via _cadprev) valida a sigla e derruba o script com "52,17".
const UF = process.env.UFS ? process.env.UFS.split(",") : null;
const CORTE = Number(process.env.CORTE || 0.35);
const MIN_RAIS = Number(process.env.MIN_RAIS || 150);   // abaixo disso a RAIS é ruidosa demais

const filtro = UF ? `and left(v.cod_ibge,2) = any($1)` : "";
const par = UF ? [UF] : [];

// 🚨 PERFORMANCE: a 1ª versão usava subquery CORRELACIONADA por município para achar a competência mais
// cheia — sobre uma view de milhões de linhas isso não termina. Materializar (cod_ibge, fonte, competencia)
// UMA vez e agregar em cima é o mesmo resultado em segundos.
// 🚨 TEMP TABLE NÃO SOBREVIVE AO POOLER do Neon: cada query pode cair noutra conexão e a temp some
// ([[pnigp-temp-table-sobre-pool]]). Tabela REAL de apoio, recriada a cada execução.
await q(`drop table if exists aux_subcoleta`);
await q(`create table aux_subcoleta as
  select v.cod_ibge, max(v.municipio) municipio, v.fonte, v.competencia, count(*)::int n
    from vw_folha_municipal_brasil v
   where v.cod_ibge is not null and v.fonte <> 'rais' and v.competencia is not null ${filtro}
   group by v.cod_ibge, v.fonte, v.competencia`, par);
await q(`create index on aux_subcoleta (cod_ibge)`);

// por MUNICÍPIO: o mês mais cheio somando todas as fontes
const linhas = (await q(`
  with mes as (
    select cod_ibge, competencia, sum(n) n, string_agg(distinct fonte, ',') fontes
      from aux_subcoleta group by cod_ibge, competencia),
  top as (select distinct on (cod_ibge) cod_ibge, competencia, n, fontes
            from mes order by cod_ibge, n desc),
  rais as (select left(cod_ibge6::text,6) c, count(*) v from folha_rais_municipal group by 1)
  select t.cod_ibge, (select max(municipio) from aux_subcoleta s where s.cod_ibge=t.cod_ibge) municipio,
         uf_por_ibge(t.cod_ibge) uf, t.fontes, t.competencia, t.n coletado, rais.v rais,
         round(100.0*t.n/nullif(rais.v,0),1) pct
    from top t join rais on rais.c = left(t.cod_ibge,6)
   where rais.v >= ${MIN_RAIS} and t.n < rais.v * ${CORTE}
   order by (rais.v - t.n) desc`)).rows;


console.log(`\n🚨 ${linhas.length} municípios COLETADOS mas abaixo de ${Math.round(CORTE * 100)}% da RAIS\n`);
console.table(linhas.slice(0, 25));

console.log("\n═══ POR FONTE — é aqui que aparece defeito de coletor, não caso isolado ═══");
console.table((await q(`
  with top as (select distinct on (cod_ibge, fonte) cod_ibge, fonte, n from aux_subcoleta order by cod_ibge, fonte, n desc),
  rais as (select left(cod_ibge6::text,6) c, count(*) v from folha_rais_municipal group by 1)
  select top.fonte, count(*)::int municipios,
         count(*) filter (where top.n < rais.v * ${CORTE})::int subcoletados,
         round(100.0*count(*) filter (where top.n < rais.v * ${CORTE})/count(*),1) pct_suspeito,
         round(avg(100.0*top.n/nullif(rais.v,0))::numeric,1) cobertura_media
    from top join rais on rais.c = left(top.cod_ibge,6)
   where rais.v >= ${MIN_RAIS}
   group by top.fonte having count(*) >= 3
   order by 4 desc nulls last limit 20`)).rows);
await db.end();
