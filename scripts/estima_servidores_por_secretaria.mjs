// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// estima_servidores_por_secretaria.mjs — "quantos servidores tem cada secretaria, e quanto ganham?"
//
// Duas situações completamente diferentes, e a página nunca deve misturá-las:
//
//   A) DADO DIRETO — SC e MA publicam o vínculo com lotação e valor. Contar e tirar a mediana é aritmética,
//      não estimativa. Não se estima o que já se sabe.
//
//   B) ESTIMATIVA — RS e PR só publicam o EMPENHO. Sabe-se quanto a secretaria gastou com pessoal, não quantas
//      pessoas são. O headcount sai de  folha_do_mês ÷ custo_médio_por_servidor  — e essa régua só vale se for
//      provada. Aqui ela é provada por VALIDAÇÃO CRUZADA em SC, onde a resposta é conhecida: estima-se cada
//      município com o custo médio dos OUTROS (nunca com o dele mesmo, que seria circular) e mede-se o erro.
//
// A régua não é um número só: o custo médio por servidor muda por ÁREA (professor ≠ auxiliar de serviços) e por
// PORTE de município. O teste abaixo compara três réguas para escolher pela medição, não por gosto
// ([[feedback-varios-metodos-um-por-tipo]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const MES = process.env.MES || "202511";

// ── A) o caso direto: SC entrega contagem e salário por secretaria ────────────────────────────────────────────
console.log(`\n═══ A) DADO DIRETO — servidores por área de governo, SC ${MES} (ativos) ═══`);
const direto = await q(`
  select area, count(distinct nome) servidores,
         round(percentile_cont(0.5) within group (order by bruto)) mediana,
         round(avg(bruto)) media, round(sum(bruto)) folha
    from vw_folha_municipal_sc
   where anomes=$1 and situacao='Ativo' and bruto>0
   group by 1 order by 2 desc`, [MES]);
console.table(direto.rows);

console.log(`\n═══ exemplo de um município: secretaria a secretaria ═══`);
const umMun = await q(`
  select area, count(distinct nome) servidores,
         round(percentile_cont(0.5) within group (order by bruto)) mediana_salario,
         round(sum(bruto)) folha_mes
    from vw_folha_municipal_sc
   where anomes=$1 and situacao='Ativo' and bruto>0 and municipio='JOINVILLE'
   group by 1 order by 2 desc`, [MES]);
console.table(umMun.rows);

// ── B) a régua: quanto custa, em média, um servidor? ──────────────────────────────────────────────────────────
// custo por servidor = folha bruta ÷ pessoas. Calculado por município e por área, com a mediana como resumo
// (a média é puxada por prefeituras grandes).
console.log(`\n═══ B) A RÉGUA — custo médio mensal por servidor, SC ${MES} ═══`);
const regua = await q(`
  with m as (
    select municipio, area, count(distinct nome) pessoas, sum(bruto) folha
      from vw_folha_municipal_sc
     where anomes=$1 and situacao='Ativo' and bruto>0 group by 1,2
  )
  select area, count(*) municipios, sum(pessoas) pessoas,
         round(percentile_cont(0.5) within group (order by folha/pessoas)) custo_mediano,
         round(percentile_cont(0.25) within group (order by folha/pessoas)) p25,
         round(percentile_cont(0.75) within group (order by folha/pessoas)) p75
    from m where pessoas >= 5 group by 1 order by 3 desc`, [MES]);
console.table(regua.rows);

// ── C) validação cruzada: a régua acerta o headcount? ─────────────────────────────────────────────────────────
// Para cada município, estima-se as pessoas dividindo a folha pelo custo mediano dos OUTROS municípios
// (leave-one-out), e compara-se com a contagem real. Três réguas concorrem.
console.log(`\n═══ C) VALIDAÇÃO CRUZADA — erro de cada régua (SC ${MES}) ═══`);
const valid = await q(`
  with base as (
    select municipio, area, count(distinct nome) pessoas, sum(bruto) folha
      from vw_folha_municipal_sc
     where anomes=$1 and situacao='Ativo' and bruto>0 group by 1,2
  ),
  tot as (select municipio, sum(pessoas) pessoas, sum(folha) folha from base group by 1),
  -- régua 1: um custo único para o estado (leave-one-out pelo total)
  g as (select sum(folha) f, sum(pessoas) p from base),
  r1 as (select t.municipio, t.pessoas real_, t.folha / ((g.f - t.folha) / nullif(g.p - t.pessoas,0)) est
           from tot t cross join g),
  -- régua 2: custo por ÁREA (leave-one-out por área)
  ga as (select area, sum(folha) f, sum(pessoas) p from base group by 1),
  r2 as (select b.municipio, sum(b.pessoas) real_,
                sum(b.folha / nullif((ga.f - b.folha) / nullif(ga.p - b.pessoas,0),0)) est
           from base b join ga on ga.area = b.area group by 1),
  -- régua 3: custo por área E por porte do município (3 faixas de tamanho de quadro)
  porte as (select municipio, ntile(3) over (order by pessoas) faixa from tot),
  gp as (select b.area, p.faixa, sum(b.folha) f, sum(b.pessoas) p
           from base b join porte p on p.municipio=b.municipio group by 1,2),
  r3 as (select b.municipio, sum(b.pessoas) real_,
                sum(b.folha / nullif((gp.f - b.folha) / nullif(gp.p - b.pessoas,0),0)) est
           from base b join porte p on p.municipio=b.municipio
                       join gp on gp.area=b.area and gp.faixa=p.faixa group by 1)
  select 'régua 1 — custo único do estado' regua,
         round(percentile_cont(0.5) within group (order by abs(est-real_)/real_*100)::numeric,1) erro_mediano_pct,
         round(avg(abs(est-real_)/real_*100)::numeric,1) erro_medio_pct,
         count(*) filter (where abs(est-real_)/real_ <= 0.10) dentro_de_10pct, count(*) municipios
    from r1 where real_ > 0
  union all
  select 'régua 2 — custo por área',
         round(percentile_cont(0.5) within group (order by abs(est-real_)/real_*100)::numeric,1),
         round(avg(abs(est-real_)/real_*100)::numeric,1),
         count(*) filter (where abs(est-real_)/real_ <= 0.10), count(*)
    from r2 where real_ > 0
  union all
  select 'régua 3 — custo por área × porte',
         round(percentile_cont(0.5) within group (order by abs(est-real_)/real_*100)::numeric,1),
         round(avg(abs(est-real_)/real_*100)::numeric,1),
         count(*) filter (where abs(est-real_)/real_ <= 0.10), count(*)
    from r3 where real_ > 0`, [MES]);
console.table(valid.rows);

await db.end();
