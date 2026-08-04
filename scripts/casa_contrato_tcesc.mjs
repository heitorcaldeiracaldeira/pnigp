// CASAMENTO DE CONTRATOS TCE ↔ PNCP — para o apontamento do CONTRATADO cair no CONTRATO, não no processo.
//
// Correção de modelo (Heitor, 04/ago/2026): as três origens do TCE têm grãos diferentes e eu havia achatado
// tudo no processo licitatório:
//   trilha              → idparticipante  → pertence ao PROCESSO (quem disputou)
//   tipologia_contrato  → idcontrato      → pertence ao CONTRATO
//   ocorrencia          → identificador_sfi → pertence ao PROCESSO
// Trazer a tipologia de contrato até o processo via link_contrato produz FAN-OUT: um processo com 20 contratos
// exibia as marcações dos 20 empilhadas (caso real: 263 registros numa licitação de Itajaí). O gestor age no
// CONTRATO — é ele que se fiscaliza, adita ou não se renova.
//
// ÂNCORA: só casa contrato DENTRO de processo já casado (app.processo_tce_pncp). Isso reduz o espaço de busca de
// 2 milhões × 799 mil para poucas dezenas por processo, e herda a confiança do casamento do processo.
// TRAVA: número do contrato · data de assinatura (±3d) · valor. Aceita com 2 dos 3, ou número+1.
//   node scripts/casa_contrato_tcesc.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const TOL = Number(process.env.TOL_DIAS || 3);
const t0 = Date.now();
const DT = (c) => `(case when ${c} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' then to_date(left(${c},10),'DD/MM/YYYY')
                        when ${c} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then to_date(left(${c},10),'YYYY-MM-DD') end)`;
const DN = (c) => `(case when (${c})::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then to_date(left((${c})::text,10),'YYYY-MM-DD') end)`;
const NUM = (c) => `nullif(ltrim(regexp_replace(coalesce(${c},''), '[^0-9]', '', 'g'),'0'),'')::bigint`;

console.log("1) valor por CONTRATO no TCE (item distinto — sem o fan-out do vínculo)…");
await db.query(`drop table if exists app.tce_contrato_valor`);
await db.query(`
  create table app.tce_contrato_valor as
  with iu as (select distinct idcontrato, id_item_contratado,
                nullif(replace(replace(valor_total_contratado,'.',''),',','.'),'')::numeric v
              from tcesc_item_contrato where valor_total_contratado is not null)
  select idcontrato, sum(v) valor, count(*) n_itens from iu group by 1`);
await db.query(`create index ix_tcv on app.tce_contrato_valor(idcontrato)`);
console.table((await db.query(`select count(*) contratos, max(valor)::numeric(20,2) maior,
  percentile_disc(0.5) within group (order by valor)::numeric(18,2) mediana from app.tce_contrato_valor`)).rows);

console.log("2) candidatos: contratos do TCE dentro de processo JÁ casado…");
await db.query(`drop table if exists app.tce_contrato_cand`);
await db.query(`
  create table app.tce_contrato_cand as
  select distinct m.cnpj, m.ano, m.seq, c.idcontrato,
    ${NUM("c.numero_contrato")} num_contrato, ${DT("c.data_assinatura")} assinatura,
    ${DT("c.data_vencimento")} vencimento, v.valor, left(c.descricao_objetivo,300) objetivo
  from app.processo_tce_pncp m
  join tcesc_link_contrato lc on lc.identificador_sfi_processo_licitatorio = m.identificador_sfi
  join tcesc_contrato c on c.idcontrato = lc.idcontrato
  left join app.tce_contrato_valor v on v.idcontrato = c.idcontrato`);
await db.query(`create index ix_tcc on app.tce_contrato_cand(cnpj,ano,seq)`);

console.log("3) nossos contratos do mesmo processo…");
await db.query(`drop table if exists app.pncp_contrato_norm`);
await db.query(`
  create table app.pncp_contrato_norm as
  select c.id, c.cod_ibge, c.cnpj_compra cnpj, c.ano_compra ano, c.seq_compra seq,
    c.fornecedor, c.ni_fornecedor, c.valor_global, ${DN("c.assinatura")} assinatura,
    ${DN("c.vig_fim")} vencimento, left(c.objeto,300) objeto
  from contratos_sc c
  where c.cnpj_compra is not null and c.ano_compra is not null and c.seq_compra is not null`);
await db.query(`create index ix_pcn on app.pncp_contrato_norm(cnpj,ano,seq)`);
console.table((await db.query(`select (select count(*) from app.pncp_contrato_norm) nossos_contratos,
  (select count(*) from app.tce_contrato_cand) candidatos_tce`)).rows);

console.log("4) casando dentro do processo — MÚTUO MELHOR (cada lado só casa com quem também o escolheu)…");
await db.query(`drop table if exists app.contrato_tce_pncp`);
await db.query(`
  create table app.contrato_tce_pncp as
  with quantos as (   -- processo com 1 contrato de cada lado: o próprio processo já é a âncora
    select cnpj, ano, seq, count(*) n_nosso from app.pncp_contrato_norm group by 1,2,3),
  quantos_tce as (select cnpj, ano, seq, count(distinct idcontrato) n_tce from app.tce_contrato_cand group by 1,2,3),
  par as (
    select n.id, n.cod_ibge, n.cnpj, n.ano, n.seq, t.idcontrato,
      (n.assinatura is not null and t.assinatura is not null and abs(n.assinatura - t.assinatura) <= ${TOL})::int b_ass,
      (n.vencimento is not null and t.vencimento is not null and abs(n.vencimento - t.vencimento) <= ${TOL})::int b_ven,
      (n.valor_global > 0 and t.valor > 0 and abs(n.valor_global - t.valor) <= 0.01 * greatest(n.valor_global, t.valor))::int b_val,
      n.valor_global, t.valor valor_tce, qn.n_nosso, qt.n_tce
    from app.pncp_contrato_norm n
    join app.tce_contrato_cand t on t.cnpj=n.cnpj and t.ano=n.ano and t.seq=n.seq
    join quantos qn on qn.cnpj=n.cnpj and qn.ano=n.ano and qn.seq=n.seq
    join quantos_tce qt on qt.cnpj=n.cnpj and qt.ano=n.ano and qt.seq=n.seq),
  elegivel as (
    select *, (b_ass + b_ven + b_val) sinais from par
    where (b_ass + b_ven + b_val) >= 1
       or (n_nosso = 1 and n_tce = 1)),   -- 1×1 no processo: aceita mesmo sem sinal de contrato
  ranqueado as (
    select *,
      row_number() over (partition by id        order by sinais desc, b_val desc, b_ass desc, idcontrato) rn_nosso,
      row_number() over (partition by idcontrato order by sinais desc, b_val desc, b_ass desc, id)         rn_tce
    from elegivel)
  -- ⚠️ MÚTUO MELHOR: distinct só de um lado deixava VÁRIOS contratos nossos casarem com o MESMO do TCE
  -- (fan-out invertido: 3.987 apontamentos para 1.807 reais, inflado 2,2×). Agora cada par é o melhor
  -- para os DOIS lados; quem não é, fica de fora.
  select id, cod_ibge, cnpj, ano, seq, idcontrato, b_ass, b_ven, b_val, sinais, valor_global, valor_tce,
    case when b_val=1 and b_ass=1 then 'assinatura+valor'
         when b_ass=1 and b_ven=1 then 'assinatura+vencimento'
         when b_val=1 then 'valor' when b_ass=1 then 'assinatura'
         when b_ven=1 then 'vencimento' else 'unico_do_processo' end metodo,
    case when sinais >= 2 then 'confirmado'
         when sinais = 0 and n_nosso = 1 and n_tce = 1 then 'confirmado'   -- 1×1: sem ambiguidade possível
         else 'a_verificar' end confianca
  from ranqueado where rn_nosso = 1 and rn_tce = 1`);
await db.query(`create unique index ix_ctp on app.contrato_tce_pncp(id)`);
await db.query(`create unique index ix_ctp_idc on app.contrato_tce_pncp(idcontrato)`);
console.table((await db.query(`select metodo, confianca, count(*) contratos from app.contrato_tce_pncp group by 1,2 order by 3 desc`)).rows);
console.log("   prova da correção — nenhum contrato do TCE pode aparecer duas vezes:");
console.table((await db.query(`select count(*) pares, count(distinct id) nossos_distintos,
  count(distinct idcontrato) tce_distintos from app.contrato_tce_pncp`)).rows);

console.log("5) apontamento do CONTRATADO no contrato certo…");
await db.query(`drop table if exists app.tce_apontamento_contrato`);
await db.query(`
  create table app.tce_apontamento_contrato as
  select m.id contrato_id, m.cod_ibge, m.cnpj, m.ano, m.seq, m.idcontrato, m.metodo metodo_vinculo, m.sinais, m.confianca,
    t.tipologia_contrato tipologia, t.cpf_cnpj_trilha_contratos documento,
    left(t.observacao_contrato,300) observacao, t.valor_contrato_tipologia,
    n.fornecedor, n.ni_fornecedor, n.valor_global, n.objeto
  from app.contrato_tce_pncp m
  join tcesc_tipologia_contrato t on t.idcontrato = m.idcontrato
  join app.pncp_contrato_norm n on n.id = m.id
  where t.tipologia_contrato is not null`);
await db.query(`create index ix_tac on app.tce_apontamento_contrato(cod_ibge)`);
await db.query(`create index ix_tac_proc on app.tce_apontamento_contrato(cnpj,ano,seq)`);
await db.query(`create index ix_tac_ctr on app.tce_apontamento_contrato(contrato_id)`);

console.log(`\nconstruído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select count(*) apontamentos, count(distinct contrato_id) contratos,
  count(distinct (cnpj,ano,seq)) processos, count(distinct tipologia) tipologias,
  count(distinct cod_ibge) municipios from app.tce_apontamento_contrato`)).rows);
console.log("antes × depois: quantos apontamentos de CONTRATO estavam empilhados no processo:");
console.table((await db.query(`select
  (select count(*) from app.tce_apontamento_processo where origem='contrato') no_processo_antes,
  (select count(*) from app.tce_apontamento_contrato) no_contrato_agora`)).rows);
await db.end();
