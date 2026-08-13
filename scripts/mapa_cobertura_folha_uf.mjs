// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// mapa_cobertura_folha_uf.mjs — quantos municípios, por estado, têm o dado que o Heitor pediu.
//
// O critério é o dele: CARGO + SALÁRIO + SECRETARIA (nome é dispensável). Um município só conta como "completo"
// quando as três coisas existem de verdade nas linhas dele — não basta a fonte prometer.
//   completo   — cargo, salário e secretaria/lotação presentes
//   parcial    — duas das três (ex.: RS/PR dão secretaria+salário e não têm cargo)
//   censitário — só a RAIS: cargo (CBO) e salário, sem órgão e sem nome
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

// base nacional (carregada do cadastro do TCE-PE na primeira execução)
const n = await q(`select count(*) n from municipios_br`);
if (Number(n.rows[0].n) < 5000) { console.log("municipios_br não carregada — rode primeiro a versão anterior"); process.exit(1); }

await q(`create or replace view vw_folha_municipio_qualidade as
with linhas as (
  select fonte, uf, cod_ibge, municipio,
         count(*) linhas,
         count(*) filter (where cargo is not null and cargo <> '' and cargo <> '-')             tem_cargo,
         count(*) filter (where salario_bruto is not null)                                     tem_salario,
         count(*) filter (where secretaria is not null and secretaria <> '' and secretaria <> '-') tem_secretaria
    from vw_folha_municipal_brasil
   group by 1,2,3,4
)
select l.*,
       case when tem_cargo > 0 and tem_salario > 0 and tem_secretaria > 0 then 'completo'
            when (tem_cargo > 0)::int + (tem_salario > 0)::int + (tem_secretaria > 0)::int = 2 then 'parcial'
            else 'minimo' end nivel
  from linhas l`);

// casa cada linha com o município oficial: o Farol usa cod_ibge, as demais usam nome — e RS/MA vêm com o nome
// do ENTE ("PM DE AGUDO", "Câmara Municipal de X"), que precisa ser limpo antes de comparar.
await q(`drop view if exists vw_cobertura_uf`);
await q(`create view vw_cobertura_uf as
with norm as (
  select q.*, coalesce(
      (select m.cod_ibge from municipios_br m where m.cod_ibge = q.cod_ibge),
      (select m.cod_ibge from municipios_br m where m.cod_ibge6 = q.cod_ibge),
      (select m.cod_ibge from municipios_br m
        where (q.uf is null or m.uf = q.uf)
          and upper(unaccent(m.nome)) = upper(unaccent(regexp_replace(q.municipio,
                '^(PM DE |CM DE |PREFEITURA MUNICIPAL DE |C[ÂA]MARA MUNICIPAL DE |MUNIC[ÍI]PIO DE )','','i')))
        limit 1)
  ) ibge
  from vw_folha_municipio_qualidade q
),
melhor as (
  select ibge, max(case nivel when 'completo' then 3 when 'parcial' then 2 else 1 end) grau,
         string_agg(distinct fonte, ', ') fontes
    from norm where ibge is not null group by 1
)
select m.uf,
       count(*) municipios_uf,
       count(*) filter (where b.grau = 3) completo,
       count(*) filter (where b.grau = 2) parcial,
       count(*) filter (where b.grau = 1) minimo,
       count(*) filter (where b.grau is null) sem_dado,
       round(100.0 * count(*) filter (where b.grau = 3) / count(*), 1) pct_completo
  from municipios_br m
  left join melhor b on b.ibge = m.cod_ibge
 group by 1 order by 3 desc, 1`);

console.log("═══ MUNICÍPIOS COM O DADO (cargo + salário + secretaria), POR UF ═══");
console.table((await q(`select * from vw_cobertura_uf where completo+parcial+minimo > 0`)).rows);

console.log("═══ TOTAL NACIONAL ═══");
console.table((await q(`select sum(municipios_uf) municipios_br, sum(completo) completo,
  sum(parcial) parcial, sum(minimo) minimo, sum(sem_dado) sem_dado,
  round(100.0*sum(completo)/sum(municipios_uf),1) pct_completo from vw_cobertura_uf`)).rows);

console.log("═══ quem entrega o quê (por fonte) ═══");
console.table((await q(`select fonte, count(distinct municipio) municipios, count(*) municipios_linha,
    count(*) filter (where nivel='completo') completos
  from vw_folha_municipio_qualidade group by 1 order by 4 desc`)).rows);

await db.end();
