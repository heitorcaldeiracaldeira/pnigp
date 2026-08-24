// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// mapa_folha_camaras.mjs — o placar nacional da folha das CÂMARAS e a FILA do que falta baixar.
//
// Mesma régua da folha das prefeituras:
//   • nominal   = tem NOME (lista sem nome não é folha)
//   • com valor = tem nome E remuneração > 0 ([[pnigp-lista-sem-valor-nao-e-folha]])
//   • denominador = RAIS natureza 1066 "Órgão Público do Poder Legislativo Municipal", vínculos ativos em 31/12
//     ([[pnigp-rais-ativo3112-e-o-denominador-do-mes]], [[pnigp-conferidor-rais-denominador-folha]])
//   • razão < 30% da RAIS = SUBCOLETADO, que é defeito de fonte e não de coletor
//     ([[pnigp-subcoleta-defeito-de-fonte]])
//
// Grava `aux_camara_com_folha` (uma linha por município) e `folha_camara_fila` (o que falta, com o portal de
// câmara que o radar já conhece — ~4.372 URLs mapeadas, o subproduto do achado que virou causa nacional
// [[pnigp-radar-mapeou-a-camara-causa-nacional]]).
//
// Uso: node scripts/mapa_folha_camaras.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { ATIVO_NA_VIEW } from "./_folha_filtros.mjs";

const db = pool();
const q = withRetry(db);

// ── 1. cobertura por município ─────────────────────────────────────────────────────────────────────────────────
await q(`drop table if exists aux_camara_com_folha`);
await q(`create table aux_camara_com_folha as
  with cam as (
    select cod_ibge, uf, max(municipio) municipio,
           count(*)::int linhas,
           -- 22/ago: só ATIVO conta. O tcepe entrega a lista histórica de vínculos e o afastado entrava
           --    como servidor -- 22,8% de inflação na câmara. A régua vive em _folha_filtros.mjs; a linha
           --    continua na view ([[pnigp-tcepe-afastado-conta-como-servidor]]).
           count(distinct nome) filter (where nome is not null and nome <> '' and ${ATIVO_NA_VIEW})::int pessoas,
           -- 22/ago: valor SEM NOME não é folha nominal. O tcema publica valor e não publica nome, e os
           --    126 municípios do MA entravam em "com nome + valor" sem ter nome nenhum -- é a
           --    [[pnigp-lista-sem-valor-nao-e-folha]] com o sinal trocado.
           count(*) filter (where salario_bruto > 0 and nome is not null and nome <> ''
                              and ${ATIVO_NA_VIEW})::int linhas_com_valor,
           max(competencia) competencia,
           string_agg(distinct fonte, ',') fontes,
           (array_agg(distinct camara))[1:2] amostra
      from vw_folha_camara_brasil
     where cod_ibge is not null
     group by 1, 2
  ), rais as (
    select lpad(cod_ibge6, 6, '0') k, count(*) filter (where ativo_3112)::int ativos
      from folha_rais_municipal
     where ano = (select max(ano) from folha_rais_municipal) and natureza_cod = '1066'
     group by 1
  )
  select m.cod_ibge, m.uf, m.nome as municipio,
         coalesce(c.linhas, 0) linhas, coalesce(c.pessoas, 0) pessoas,
         coalesce(c.linhas_com_valor, 0) linhas_com_valor,
         c.competencia, c.fontes, c.amostra,
         coalesce(r.ativos, 0) rais_legislativo,
         case when coalesce(r.ativos, 0) > 0 and coalesce(c.pessoas, 0) > 0
              then round(100.0 * c.pessoas / r.ativos)::int end razao_rais_pct,
         case when coalesce(c.pessoas, 0) = 0 then 'sem folha'
              when coalesce(c.linhas_com_valor, 0) = 0 then 'nominal sem valor'
              when coalesce(r.ativos, 0) > 0 and c.pessoas < 0.3 * r.ativos then 'subcoletado'
              else 'ok' end situacao
    from municipios_br m
    left join cam c on c.cod_ibge = m.cod_ibge
    left join rais r on r.k = m.cod_ibge6`);
await q(`create index on aux_camara_com_folha (uf)`);
await q(`alter table aux_camara_com_folha add primary key (cod_ibge)`);

const g = (await q(`select situacao, count(*)::int n, sum(pessoas)::int pessoas from aux_camara_com_folha group by 1 order by 2 desc`)).rows;
console.log("\n═══ FOLHA DAS CÂMARAS MUNICIPAIS — placar nacional ═══");
console.table(g);
const t = (await q(`select
   count(*) filter (where pessoas > 0)::int nominal,
   count(*) filter (where linhas_com_valor > 0)::int com_valor,
   sum(pessoas)::int pessoas, sum(rais_legislativo)::int rais
  from aux_camara_com_folha`)).rows[0];
console.log(`\n${t.nominal} de 5.570 câmaras com folha NOMINAL (${(t.nominal / 5570 * 100).toFixed(1)}%) · ` +
  `${t.com_valor} com NOME + VALOR (${(t.com_valor / 5570 * 100).toFixed(1)}%)`);
console.log(`${t.pessoas.toLocaleString("pt-BR")} pessoas colhidas para ${t.rais.toLocaleString("pt-BR")} da RAIS ` +
  `(${(t.pessoas / t.rais * 100).toFixed(1)}% do universo declarado)`);

console.log("\n═══ por UF ═══");
console.table((await q(`select uf,
   count(*)::int municipios,
   count(*) filter (where pessoas > 0)::int nominal,
   count(*) filter (where linhas_com_valor > 0)::int com_valor,
   sum(pessoas)::int pessoas, sum(rais_legislativo)::int rais_leg,
   round(100.0 * count(*) filter (where linhas_com_valor > 0) / count(*))::int pct
  from aux_camara_com_folha group by 1 order by pct desc, uf`)).rows);

// ── 2. a FILA: quem falta e por onde entrar ────────────────────────────────────────────────────────────────────
// ⭐⭐ O radar mantém UMA LINHA POR PODER: `unidade_gestora = 'Câmara Municipal de …'` existe para os 5.570
//    municípios. Casar o texto da URL (`camara|leg.br`) achava 3.385 e PERDIA a câmara em host neutro — a
//    unidade gestora declarada é a prova, o host nunca foi ([[pnigp-prefeitura-ao-lado-da-camara]]).
// 🚨 `al.{uf}.leg.br` é ASSEMBLEIA do estado, não câmara municipal (o radar pôs isso em 8 capitais).
// ⚠️ INCREMENTAL de propósito: a identificação de produto (`identifica_erp_camara.mjs`) é cara e vive nesta
//    tabela — recriá-la do zero jogaria fora 1.176 vereditos ([[pnigp-resondagem-sobrescreve-url-boa]]).
await q(`create table if not exists folha_camara_fila (
  cod_ibge text primary key, uf text, municipio text, situacao text, pessoas int, rais_legislativo int,
  url_camara text, erp text, host text, url_camara_2 text, resultado text, processado_em timestamptz)`);
await q(`with cand as (
    select r.cod_ibge, r.municipio, r.uf, r.url_portal, r.erp, r.host,
           row_number() over (partition by r.cod_ibge
             order by (r.unidade_gestora ~* 'c[âa]mara') desc, (r.erp is not null) desc, length(r.url_portal)) rn
      from radar_portal r
     where (r.unidade_gestora ~* 'c[âa]mara'
            or r.url_portal ~* '(^|[./])(camara|cmara|cm[a-z]{2,})|\\.leg\\.br')
       and r.url_portal !~* '^https?://(www\\.)?(al|ale)\\.[a-z]{2}\\.leg\\.br'
       and r.url_portal !~* '^https?://(www\\.)?(camara|senado)\\.leg\\.br'
  )
  insert into folha_camara_fila
    (cod_ibge, uf, municipio, situacao, pessoas, rais_legislativo, url_camara, erp, host, url_camara_2)
  select a.cod_ibge, a.uf, a.municipio, a.situacao, a.pessoas, a.rais_legislativo,
         c.url_portal, c.erp, c.host, p.url_camara
    from aux_camara_com_folha a
    left join cand c on c.cod_ibge = a.cod_ibge and c.rn = 1
    left join prefeitura_de_camara p on p.cod_ibge = a.cod_ibge
   where a.situacao in ('sem folha', 'nominal sem valor', 'subcoletado')
  on conflict (cod_ibge) do update set
     situacao = excluded.situacao, pessoas = excluded.pessoas, rais_legislativo = excluded.rais_legislativo,
     url_camara = coalesce(folha_camara_fila.url_camara, excluded.url_camara),
     url_camara_2 = coalesce(folha_camara_fila.url_camara_2, excluded.url_camara_2),
     host = coalesce(folha_camara_fila.host, excluded.host)`);
// quem já tem a folha da câmara sai da fila (a coleta de hoje resolve municípios da rodada anterior)
await q(`delete from folha_camara_fila f using aux_camara_com_folha a
   where a.cod_ibge = f.cod_ibge and a.situacao = 'ok'`);
const f = (await q(`select
   count(*)::int fila,
   count(*) filter (where url_camara is not null or url_camara_2 is not null)::int com_url,
   count(*) filter (where erp is not null)::int com_erp,
   sum(rais_legislativo)::int rais
  from folha_camara_fila`)).rows[0];
console.log(`\n═══ FILA ═══\n${f.fila} municípios a colher · ${f.com_url} já têm URL de câmara mapeada · ` +
  `${f.com_erp} com ERP identificado · ${f.rais.toLocaleString("pt-BR")} servidores da RAIS em jogo`);
console.log("\nERPs mais frequentes na fila (por onde vale abrir coletor):");
console.table((await q(`select coalesce(erp,'(não identificado)') erp, count(*)::int n
  from folha_camara_fila group by 1 order by 2 desc limit 20`)).rows);
await db.end();
