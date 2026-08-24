// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// mapa_folha_nacional.mjs — quantos dos 5.570 municípios têm folha nominal HOJE, por UF.
// Régua idêntica à das campanhas estaduais: união de TODAS as tabelas folha_servidores_* (descobertas do
// catálogo, nunca de lista fixa — [[pnigp-view-folha-nao-enxerga-coletores]]), competência mais cheia por
// município, e denominador RAIS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [t])).rows.map((x) => x.c);
  if (!cols.includes("cod_ibge")) continue;
  const has = (c) => cols.includes(c);
  const sal = ["salario_bruto", "bruto", "remuneracao", "provento", "proventos", "vencimentos_totais",
    "total_vencimentos", "vantagens", "valor", "salario_base", "salario", "liquido", "valor_vantagem"].find(has);
  const car = ["cargo", "descricao_cargo", "funcao"].find(has);
  const sec = ["secretaria", "lotacao", "orgao", "unidade", "unidade_gestora", "departamento"].find(has);
  partes.push(`select left(cod_ibge::text,7) c, '${t.replace("folha_servidores_", "")}' fonte,
      ${sal ? `count(*) filter (where ${sal} is not null and ${sal}::numeric>0)` : "0"} v,
      ${car ? `count(*) filter (where ${car} is not null and btrim(${car}::text)<>'')` : "0"} ca,
      ${sec ? `count(*) filter (where ${sec} is not null and btrim(${sec}::text)<>'')` : "0"} se,
      count(*) n from ${t} group by 1,2`);
}
console.log(`${partes.length} tabelas de folha varridas`);

await q(`drop materialized view if exists mv_folha_nacional`);
await q(`create materialized view mv_folha_nacional as
  with un as (${partes.join(" union all ")}),
  porMun as (
    select c cod_ibge, sum(n) linhas, sum(v) com_valor, sum(ca) com_cargo, sum(se) com_sec,
           count(distinct fonte) fontes
      from un group by 1)
  select m.cod_ibge, m.uf, m.nome, p.linhas, p.com_valor, p.com_cargo, p.com_sec, p.fontes
    from municipios_br m left join porMun p on p.cod_ibge = m.cod_ibge`);

const raisAno = (await q(`select max(ano) a from folha_rais_municipal`)).rows[0].a;
console.log(`\n═══ COBERTURA NACIONAL DE FOLHA NOMINAL (RAIS ${raisAno}) ═══`);
console.table((await q(`
  with rais as (select lpad(cod_ibge6,6,'0') i6, count(*)::int n from folha_rais_municipal
    where ano=$1 and esfera_grupo='municipal' and ativo_3112 group by 1)
  select f.uf,
         count(*) municipios,
         count(*) filter (where f.linhas > 0) com_folha,
         round(100.0*count(*) filter (where f.linhas > 0)/count(*),1) pct,
         count(*) filter (where f.com_valor > 0) com_valor,
         count(*) filter (where f.com_valor > 0 and f.com_cargo > 0 and f.com_sec > 0) completos
    from mv_folha_nacional f left join rais r on r.i6 = left(f.cod_ibge,6)
   group by 1 order by 4 desc, 1`, [raisAno])).rows);

const t = (await q(`select count(*) municipios, count(*) filter (where linhas>0) com_folha,
   count(*) filter (where com_valor>0) com_valor,
   count(*) filter (where com_valor>0 and com_cargo>0 and com_sec>0) completos,
   sum(linhas) linhas from mv_folha_nacional`)).rows[0];
console.log(`\n🇧🇷 BRASIL: ${t.com_folha} de ${t.municipios} municípios (${(100 * t.com_folha / t.municipios).toFixed(1)}%)`);
console.log(`   com valor: ${t.com_valor} · completos (cargo+salário+secretaria): ${t.completos}`);
console.log(`   linhas de folha no banco: ${Number(t.linhas).toLocaleString("pt-BR")}`);
await db.end();
