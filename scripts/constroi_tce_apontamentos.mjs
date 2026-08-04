// QUADRO DE APONTAMENTOS DO TCE/SC por município — derivada (Lei 1).
//
// Desenho escolhido pelo Heitor (04/ago/2026), opção B: ESPELHO + INTENSIDADE PRÓPRIA.
// Mostra o que o TCE marcou, e compara o município COM ELE MESMO ao longo do tempo (apontamentos por 100
// processos). NÃO ranqueia municípios entre si — [[feedback-nao-abrir-disputa-municipios]],
// [[feedback-relatorio-municipio-puro]]. Apontamento é TRILHA DE AUDITORIA, não irregularidade comprovada.
//
// Três origens, três caminhos até o município (a trilha é a que exige ponte):
//   trilha            idparticipante → tcesc_link_participante → nome_ente        (ano via processo)
//   tipologia_contrato nome_ente_tipologia_contrato (direto)                      (ano via data_assinatura)
//   ocorrencia         identificador_sfi → tcesc_processo_licitatorio → nome_ente (ano via data_ocorrencia)
//   node scripts/constroi_tce_apontamentos.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 890000 });
const t0 = Date.now();
// normalizador: o TCE grava 'FLORIANÓPOLIS', o nosso entes_sc grava 'Florianópolis'
const NORM = (c) => `upper(translate(btrim(${c}), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
const ANO = (c) => `nullif(substring(${c} from '(\\d{4})'),'')::int`;

console.log("1) ponte nome_ente → cod_ibge…");
await db.query(`drop table if exists app.tce_ente_ibge`);
await db.query(`create table app.tce_ente_ibge as
  select distinct on (${NORM("e.nome")}) ${NORM("e.nome")} ente_norm, e.cod_ibge, e.nome nome_ibge
  from entes_sc e where e.tipo='M'`);
await db.query(`create index ix_teib on app.tce_ente_ibge(ente_norm)`);

console.log("2) apontamentos por município × origem × tipologia × ano…");
await db.query(`drop table if exists app.tce_apontamento_municipio`);
await db.query(`
  create table app.tce_apontamento_municipio as
  with tri as (   -- TRILHA: participante → ponte → ente; ano pela homologação do processo
    select ${NORM("l.nome_ente")} ente_norm, 'participante' origem, t.tipologia,
           ${ANO("p.data_homologacao")} ano, count(*) apontamentos, null::numeric valor,
           min(t.observacao) observacao, max(p.data_homologacao) ultimo
    from tcesc_trilha t
    join tcesc_link_participante l on l.idparticipante = t.idparticipante
    left join tcesc_processo_licitatorio p on p.identificador_sfi_processo_licitatorio = l.identificador_sfi_processo_licitatorio
    where t.tipologia is not null group by 1,2,3,4),
  con as (        -- TIPOLOGIA DE CONTRATO: já traz o ente; a DATA vem do contrato (o cubo da tipologia não a tem)
    select ${NORM("c.nome_ente_tipologia_contrato")} ente_norm, 'contrato' origem, c.tipologia_contrato tipologia,
           ${ANO("ct.data_assinatura")} ano, count(*) apontamentos,
           sum(nullif(replace(replace(c.valor_contrato_tipologia,'.',''),',','.'),'')::numeric) valor,
           min(c.observacao_contrato) observacao, max(ct.data_assinatura) ultimo
    from tcesc_tipologia_contrato c
    left join tcesc_contrato ct on ct.idcontrato = c.idcontrato
    where c.tipologia_contrato is not null and c.nome_ente_tipologia_contrato is not null group by 1,2,3,4),
  oco as (        -- OCORRÊNCIA: desfecho do processo (contexto, não apontamento de risco)
    select ${NORM("p.nome_ente")} ente_norm, 'processo' origem, o.descricao_tipo_ocorrencia_licitacao tipologia,
           ${ANO("o.data_ocorrencia_licitacao")} ano, count(*) apontamentos, null::numeric valor,
           min(o.descricao_justificativa_ocorrencia_licitacao) observacao, max(o.data_ocorrencia_licitacao) ultimo
    from tcesc_ocorrencia o
    join tcesc_processo_licitatorio p on p.identificador_sfi_processo_licitatorio = o.identificador_sfi_processo_licitatorio
    where o.descricao_tipo_ocorrencia_licitacao is not null group by 1,2,3,4)
  select b.cod_ibge, b.nome_ibge municipio, u.*
  from (select * from tri union all select * from con union all select * from oco) u
  join app.tce_ente_ibge b on b.ente_norm = u.ente_norm`);
await db.query(`create index ix_tam_ibge on app.tce_apontamento_municipio(cod_ibge)`);
await db.query(`create index ix_tam_ano on app.tce_apontamento_municipio(cod_ibge, ano)`);

console.log("3) intensidade própria: apontamentos por 100 processos, ano a ano…");
await db.query(`drop table if exists app.tce_intensidade_municipio`);
await db.query(`
  create table app.tce_intensidade_municipio as
  with proc as (   -- denominador: processos do MUNICÍPIO no universo do TCE (não o nosso — universos diferentes)
    select b.cod_ibge, ${ANO("p.data_homologacao")} ano, count(*) processos
    from tcesc_processo_licitatorio p
    join app.tce_ente_ibge b on b.ente_norm = ${NORM("p.nome_ente")}
    where p.data_homologacao is not null group by 1,2),
  ap as (
    select cod_ibge, ano,
      sum(apontamentos) filter (where origem in ('participante','contrato')) apontamentos_risco,
      sum(apontamentos) filter (where origem='processo') ocorrencias
    from app.tce_apontamento_municipio where ano is not null group by 1,2)
  select p.cod_ibge, p.ano, p.processos,
    coalesce(ap.apontamentos_risco,0) apontamentos, coalesce(ap.ocorrencias,0) ocorrencias,
    round(100.0 * coalesce(ap.apontamentos_risco,0) / nullif(p.processos,0), 1) por_100_processos
  from proc p left join ap on ap.cod_ibge=p.cod_ibge and ap.ano=p.ano
  where p.ano between 2015 and extract(year from now())::int`);
await db.query(`create index ix_tim on app.tce_intensidade_municipio(cod_ibge, ano)`);

console.log(`\nconstruído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select count(*) linhas, count(distinct cod_ibge) municipios,
  count(distinct tipologia) tipologias, sum(apontamentos) apontamentos from app.tce_apontamento_municipio`)).rows);
console.table((await db.query(`select origem, count(distinct tipologia) tipologias, sum(apontamentos) apontamentos,
  count(distinct cod_ibge) municipios from app.tce_apontamento_municipio group by 1 order by 3 desc`)).rows);
console.log("municípios sem vínculo (nome do TCE que não casou com entes_sc):");
console.table((await db.query(`select count(distinct ente_norm) n from (
  select ${NORM("nome_ente")} ente_norm from tcesc_processo_licitatorio) x
  where not exists(select 1 from app.tce_ente_ibge b where b.ente_norm=x.ente_norm)`)).rows);
await db.end();
