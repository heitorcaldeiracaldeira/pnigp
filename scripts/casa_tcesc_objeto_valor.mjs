// CASADOR 2 — objeto + valor, para os processos que o casador por NÚMERO DE EDITAL não alcança.
//
// Por que existe (medido 04/ago/2026): dos 55.267 homologados sem par, 38.412 entraram no casamento e não
// acharam correspondente. O diagnóstico é preciso — o ENTE existe no TCE em 100% deles e o ANO em 99,9%, mas o
// NÚMERO só coincide em 10,8%. Ou seja: o município usa uma numeração no PNCP (`numeroCompra`, normalmente o
// processo administrativo) e outra no TCE (`numero_edital`). Nada obriga as duas a coincidirem.
//
// TRAVA DUPLA, o mesmo princípio da marca ([[pnigp-conferencia-marca-comprasnet]]): nunca aceito por um sinal só.
//   âncora  = município + ano
//   sinal 1 = similaridade do OBJETO (trigrama)
//   sinal 2 = proximidade do VALOR (≤1%)
// Aceita com objeto ≥0.45 E valor batendo; ou objeto ≥0.72 sozinho quando o TCE não tem valor para o processo.
// Nunca sobrescreve o casamento por número (aquele é mais forte). node scripts/casa_tcesc_objeto_valor.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const SIM_COM_VALOR = Number(process.env.SIM_COM_VALOR || 0.45);
const SIM_SEM_VALOR = Number(process.env.SIM_SEM_VALOR || 0.72);
const t0 = Date.now();
const NORM_TXT = (c) => `lower(translate(${c}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;

await db.query(`create extension if not exists pg_trgm`);

// 1) O valor do processo no TCE NÃO se calcula aqui — ele tem dono: scripts/sanea_valor_item_tcesc.mjs.
// A versão anterior somava `valor_total_contratado` cru atravessando `tcesc_link_contrato`, e carregava os
// DOIS defeitos que já corrigimos nos outros consumidores:
//   · fan-out do vínculo (sem distinct, duplicata de vínculo multiplicava o valor);
//   · o total lançado no campo do preço unitário, que o TCE multiplica pela quantidade outra vez.
// Como este valor é SINAL DE CASAMENTO (aceita par com objeto ≥0.45 quando o valor bate a 1%), valor podre
// aqui não faz só um número feio: faz par errado — apontamento do Tribunal preso ao processo de outro.
console.log("1) valor do processo no lado do TCE (lendo o saneado — este script não recalcula)…");
if (!(await db.query(`select to_regclass('app.tce_contrato_valor') r`)).rows[0].r) {
  console.error("ERRO: app.tce_contrato_valor não existe — rode antes: node scripts/sanea_valor_item_tcesc.mjs");
  process.exit(1);
}
await db.query(`drop table if exists app.tce_proc_valor`);
await db.query(`
  create table app.tce_proc_valor as
  with vinc as (select distinct identificador_sfi_processo_licitatorio sfi, idcontrato from tcesc_link_contrato)
  select v.sfi, sum(c.valor) valor
  from vinc v join app.tce_contrato_valor c on c.idcontrato = v.idcontrato
  group by 1`);
await db.query(`create index ix_tpv on app.tce_proc_valor(sfi)`);

console.log("2) candidatos do TCE (com objeto), por ente e ano…");
await db.query(`drop table if exists app.tce_cand`);
await db.query(`
  create table app.tce_cand as
  select t.id sfi, t.ente_norm, t.ano_edital ano,
         ${NORM_TXT("left(p.descricao_objeto_licitacao, 300)")} objeto, v.valor
  from app.tce_proc_norm t
  join tcesc_processo_licitatorio p on p.identificador_sfi_processo_licitatorio = t.id
  left join app.tce_proc_valor v on v.sfi = t.id
  where p.descricao_objeto_licitacao is not null and t.ano_edital is not null
    and not exists (select 1 from app.processo_tce_pncp x where x.identificador_sfi = t.id)`);
await db.query(`create index ix_tcand on app.tce_cand(ente_norm, ano)`);
await db.query(`create index ix_tcand_trg on app.tce_cand using gin (objeto gin_trgm_ops)`);

console.log("3) nossos processos ainda sem par…");
await db.query(`drop table if exists app.pncp_sem_par`);
await db.query(`
  create table app.pncp_sem_par as
  select p.cnpj, p.ano, p.seq, p.ente_norm,
         ${NORM_TXT("left(c.objeto, 300)")} objeto, c.valor_homologado valor
  from app.pncp_proc_norm p
  join contratacoes_sc c on c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq
  where c.objeto is not null and c.esfera='M'
    and not exists (select 1 from app.processo_tce_pncp x where x.cnpj=p.cnpj and x.ano=p.ano and x.seq=p.seq)`);
await db.query(`create index ix_psp on app.pncp_sem_par(ente_norm, ano)`);
console.table((await db.query(`select (select count(*) from app.pncp_sem_par) nossos_sem_par,
  (select count(*) from app.tce_cand) candidatos_tce`)).rows);

console.log("4) casando por objeto+valor (trava dupla)… pode levar minutos");
await db.query(`drop table if exists app.tce_match_objeto`);
await db.query(`
  create table app.tce_match_objeto as
  select distinct on (n.cnpj, n.ano, n.seq)
    n.cnpj, n.ano, n.seq, c.sfi identificador_sfi,
    round(similarity(n.objeto, c.objeto)::numeric, 3) sim_objeto,
    n.valor valor_nosso, c.valor valor_tce,
    case when n.valor > 0 and c.valor > 0 and abs(n.valor - c.valor) <= 0.01 * greatest(n.valor, c.valor)
         then 'objeto+valor' else 'objeto_forte' end metodo
  from app.pncp_sem_par n
  join app.tce_cand c on c.ente_norm = n.ente_norm and c.ano = n.ano
  where (
      -- sinal 1 + sinal 2: objeto parecido E valor batendo em 1%
      (n.valor > 0 and c.valor > 0 and abs(n.valor - c.valor) <= 0.01 * greatest(n.valor, c.valor)
        and similarity(n.objeto, c.objeto) >= ${SIM_COM_VALOR})
      -- sem valor no TCE: exige objeto MUITO parecido
      or (c.valor is null and similarity(n.objeto, c.objeto) >= ${SIM_SEM_VALOR})
    )
  -- desempate final por c.sfi: sem ele, candidatos empatados na similaridade eram escolhidos ao acaso e o
  -- casamento mudava de uma rodada para outra com a MESMA base.
  order by n.cnpj, n.ano, n.seq, similarity(n.objeto, c.objeto) desc, c.sfi`);

console.log("5) somando ao casamento existente (nunca sobrescreve o casamento por número)…");
const ins = await db.query(`
  -- entra como 'a_verificar', NUNCA como confirmado (mesma razão do casador por datas): objeto+valor é sinal
  -- mais fraco que o número do edital, e a graduação é de audita_casamento_tce.mjs.
  insert into app.processo_tce_pncp (cnpj, ano, seq, identificador_sfi, numero_edital, ente_norm, metodo, confianca)
  select m.cnpj, m.ano, m.seq, m.identificador_sfi, t.numero_edital, t.ente_norm, m.metodo, 'a_verificar'
  from app.tce_match_objeto m
  join app.tce_proc_norm t on t.id = m.identificador_sfi
  where not exists (select 1 from app.processo_tce_pncp x where x.cnpj=m.cnpj and x.ano=m.ano and x.seq=m.seq)`);
console.log(`   +${ins.rowCount} pares novos`);

console.log(`\nconstruído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select metodo, count(*) pares from app.processo_tce_pncp group by 1 order by 2 desc`)).rows);
console.table((await db.query(`
  with h as (select distinct cnpj,ano,seq from itens_sc where unit_homologado>0)
  select count(*) homologados, count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq)) casados,
    round(100.0*count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq))/count(*),1) pct from h`)).rows);
console.log("amostra do que o casador novo aceitou (conferir na mão):");
console.table((await db.query(`select sim_objeto, metodo, valor_nosso, valor_tce from app.tce_match_objeto order by random() limit 6`)).rows);
await db.end();
