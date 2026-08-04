// LIGA O APONTAMENTO DO TCE AO NOSSO PROCESSO — de "13 contratados sem funcionário" para "QUAIS contratos".
//
// Sem isto o quadro é um número que ninguém consegue verificar. Com isto o gestor abre a tipologia e vê o
// processo, o objeto, o valor e o fornecedor — e pode conferir no PNCP e no próprio TCE.
//
// Os três caminhos até o nosso (cnpj,ano,seq), todos passando por app.processo_tce_pncp (casamento por
// município + número do edital + ano, construído em scripts/casa_tcesc_pncp.mjs):
//   participante  trilha → link_participante → identificador_sfi → processo_tce_pncp
//   contrato      tipologia_contrato → link_contrato → identificador_sfi → processo_tce_pncp
//   processo      ocorrencia → identificador_sfi → processo_tce_pncp
//   node scripts/constroi_tce_apontamento_processo.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 890000 });
const t0 = Date.now();

console.log("ligando apontamento → processo do PNCP…");
await db.query(`drop table if exists app.tce_apontamento_processo`);
await db.query(`
  create table app.tce_apontamento_processo as
  with tri as (
    select l.identificador_sfi_processo_licitatorio sfi, 'participante' origem, t.tipologia,
           t.nome_trilha entidade, t.cpf_cnpj_trilha documento, t.observacao
    from tcesc_trilha t
    join tcesc_link_participante l on l.idparticipante = t.idparticipante
    where t.tipologia is not null),
  con as (
    select lc.identificador_sfi_processo_licitatorio sfi, 'contrato' origem, c.tipologia_contrato tipologia,
           null::text entidade, c.cpf_cnpj_trilha_contratos documento, c.observacao_contrato observacao
    from tcesc_tipologia_contrato c
    join tcesc_link_contrato lc on lc.idcontrato = c.idcontrato
    where c.tipologia_contrato is not null),
  oco as (
    select o.identificador_sfi_processo_licitatorio sfi, 'processo' origem,
           o.descricao_tipo_ocorrencia_licitacao tipologia, null::text entidade, null::text documento,
           o.descricao_justificativa_ocorrencia_licitacao observacao
    from tcesc_ocorrencia o
    where o.descricao_tipo_ocorrencia_licitacao is not null),
  u as (select * from tri union all select * from con union all select * from oco)
  select distinct
    m.cnpj, m.ano, m.seq, m.identificador_sfi, m.confianca, m.nota_verificacao,
    u.origem, u.tipologia, u.entidade, u.documento,
    left(u.observacao, 300) observacao,
    c.cod_ibge, c.municipio_nome, c.modalidade, left(c.objeto, 300) objeto,
    c.valor_estimado, c.valor_homologado, c.data_publicacao, c.numero_compra, c.situacao
  from u
  join app.processo_tce_pncp m on m.identificador_sfi = u.sfi
  join contratacoes_sc c on c.cnpj=m.cnpj and c.ano=m.ano and c.seq=m.seq`);
await db.query(`create index ix_tap_ibge on app.tce_apontamento_processo(cod_ibge)`);
await db.query(`create index ix_tap_tip on app.tce_apontamento_processo(cod_ibge, tipologia)`);
await db.query(`create index ix_tap_proc on app.tce_apontamento_processo(cnpj,ano,seq)`);

console.log(`\nconstruído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select count(*) ligacoes, count(distinct (cnpj,ano,seq)) processos_nossos,
  count(distinct cod_ibge) municipios, count(distinct tipologia) tipologias,
  sum(valor_homologado) valor_homologado from app.tce_apontamento_processo`)).rows);
console.log("por origem:");
console.table((await db.query(`select origem, count(*) ligacoes, count(distinct (cnpj,ano,seq)) processos
  from app.tce_apontamento_processo group by 1 order by 2 desc`)).rows);
console.log("TAXA DE LIGAÇÃO — quanto do apontamento chega até um processo NOSSO:");
console.table((await db.query(`
  select (select sum(apontamentos) from app.tce_apontamento_municipio) apontamentos_no_quadro,
         (select count(*) from app.tce_apontamento_processo) ligados_a_processo_nosso`)).rows);
console.log("exemplo — Florianópolis, os processos apontados de maior valor:");
console.table((await db.query(`select tipologia, left(objeto,52) objeto, modalidade, valor_homologado
  from app.tce_apontamento_processo where cod_ibge='4205407' and origem<>'processo'
  order by valor_homologado desc nulls last limit 6`)).rows);
await db.end();
