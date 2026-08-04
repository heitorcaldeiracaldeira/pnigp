// MODELO DE VERIFICAÇÃO DO CASAMENTO TCE ↔ PNCP — auditar ANTES de deixar chegar à tela.
//
// Motivo (Heitor, 04/ago/2026): "verifique as inconsistências e monte um modelo que podemos verificar antes de
// inserirmos na tela". O gatilho foi real — os 117 pares com data batendo e valor divergindo revelaram que o
// VALOR DO LADO DO TCE estava errado por FAN-OUT: somei valor_total_contratado atravessando tcesc_link_contrato
// (1,76M linhas para 799k contratos), e cada duplicata do vínculo multiplicou o valor. Deu R$ 311 BILHÕES num
// processo municipal. Um sinal de confirmação quebrado é pior que sinal nenhum: ele carimba de "verificado"
// um par que ninguém verificou.
//
// O que este script faz:
//   1) RECALCULA o valor do TCE sem fan-out (item distinto por contrato, contrato distinto por processo);
//   2) monta app.tce_match_auditoria — cada par com TODOS os sinais lado a lado e um veredito;
//   3) NÃO promove nada sozinho. Quem promove é a etapa 4, e só o que passou.
// node scripts/audita_casamento_tce.mjs            # audita e mostra
// PROMOVER=1 node scripts/audita_casamento_tce.mjs # aplica: remove reprovado de processo_tce_pncp
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const PROMOVER = process.env.PROMOVER === "1";
const t0 = Date.now();

// 1) Duas correções empilhadas, e nenhuma delas se calcula aqui:
//    - fan-out do VÍNCULO (o distinct em tcesc_link_contrato): multiplicava o valor por duplicata de vínculo;
//    - total lançado no campo do UNITÁRIO (erro na fonte): ver scripts/sanea_valor_item_tcesc.mjs, dono do valor.
// O valor por contrato vem pronto de app.tce_contrato_valor. Recalcular aqui a partir do cru traria o bug de volta.
console.log("1) valor do TCE por processo — sem fan-out de vínculo e lendo o valor já saneado…");
const temValor = (await db.query(`select to_regclass('app.tce_contrato_valor') r`)).rows[0].r;
if (!temValor) { console.error("ERRO: app.tce_contrato_valor não existe — rode antes: node scripts/sanea_valor_item_tcesc.mjs"); process.exit(1); }
await db.query(`drop table if exists app.tce_proc_valor_v2`);
await db.query(`
  create table app.tce_proc_valor_v2 as
  with vinc as (select distinct identificador_sfi_processo_licitatorio sfi, idcontrato from tcesc_link_contrato)
  select v.sfi, sum(c.valor) valor, count(*) n_contratos
  from vinc v join app.tce_contrato_valor c on c.idcontrato = v.idcontrato
  group by 1`);
await db.query(`create index ix_tpv2 on app.tce_proc_valor_v2(sfi)`);
console.log("   comparação do valor ANTES × DEPOIS (máximos — o absurdo tem que sumir):");
console.table((await db.query(`select 'v1 (com fan-out)' versao, max(valor)::numeric(20,2) maior, count(*) procs from app.tce_proc_valor
  union all select 'v2 (sem fan-out)', max(valor)::numeric(20,2), count(*) from app.tce_proc_valor_v2`)).rows);

console.log("\n2) montando o modelo de auditoria (cada par, todos os sinais, um veredito)…");
await db.query(`drop table if exists app.tce_match_auditoria`);
await db.query(`
  create table app.tce_match_auditoria as
  select m.cnpj, m.ano, m.seq, m.identificador_sfi, m.metodo, m.sim_objeto, m.datas_batem,
    m.b_ab data_abertura_bate, m.b_ho data_homolog_bate,
    m.valor_nosso, v2.valor valor_tce_v2,
    case when m.valor_nosso > 0 and v2.valor > 0
         then round((abs(m.valor_nosso - v2.valor) / greatest(m.valor_nosso, v2.valor))::numeric, 3) end gap_valor,
    -- VEREDITO: quantos sinais INDEPENDENTES sustentam o par
    (case when m.sim_objeto >= 0.90 then 1 else 0 end
     + m.datas_batem
     + case when m.valor_nosso > 0 and v2.valor > 0
                 and abs(m.valor_nosso - v2.valor) <= 0.01 * greatest(m.valor_nosso, v2.valor) then 1 else 0 end) sinais,
    case
      when m.valor_nosso > 0 and v2.valor > 0
           and abs(m.valor_nosso - v2.valor) > 0.5 * greatest(m.valor_nosso, v2.valor)
           and m.sim_objeto < 0.90 then 'REPROVADO: valor destoa e objeto não é idêntico'
      when m.sim_objeto < 0.60 and m.datas_batem < 2 then 'REPROVADO: objeto fraco e menos de 2 datas'
      when m.datas_batem = 0 then 'SUSPEITO: nenhuma data confirma'
      when m.sim_objeto >= 0.90 and m.datas_batem >= 1 then 'APROVADO'
      when m.datas_batem >= 2 then 'APROVADO'
      else 'SUSPEITO: sinal único' end veredito
  from app.tce_match_objeto m
  left join app.tce_proc_valor_v2 v2 on v2.sfi = m.identificador_sfi`);
await db.query(`create index ix_tma on app.tce_match_auditoria(veredito)`);

console.log("\n=== VEREDITO dos pares casados por objeto/data ===");
console.table((await db.query(`select veredito, count(*) pares, round(avg(sim_objeto),3) sim_media,
  round(avg(datas_batem),2) datas_media from app.tce_match_auditoria group by 1 order by 2 desc`)).rows);
console.log("=== distribuição por nº de sinais independentes ===");
console.table((await db.query(`select sinais, count(*) pares from app.tce_match_auditoria group by 1 order by 1 desc`)).rows);
console.log("=== agora que o valor está certo: ele confirma ou nega? ===");
console.table((await db.query(`select count(*) com_os_dois_valores,
  count(*) filter (where gap_valor <= 0.01) batem_1pct,
  count(*) filter (where gap_valor > 0.01 and gap_valor <= 0.5) divergem_ate_50,
  count(*) filter (where gap_valor > 0.5) divergem_muito,
  round(100.0*count(*) filter (where gap_valor <= 0.01)/nullif(count(*),0),1) pct_batem
  from app.tce_match_auditoria where gap_valor is not null`)).rows);
console.log("=== amostra dos REPROVADOS (o que sairia da tela) ===");
console.table((await db.query(`select sim_objeto, datas_batem, valor_nosso, valor_tce_v2, gap_valor, left(veredito,42) veredito
  from app.tce_match_auditoria where veredito like 'REPROVADO%' order by random() limit 6`)).rows);

// GRADUAR ≠ PROMOVER. Graduar é escrever no par o que a auditoria concluiu (é o que faz a tela mostrar o
// selo "verificar" e a nota ao gestor); promover é REMOVER par reprovado do casamento, e isso continua
// dependendo de PROMOVER=1. Sem esta escrita, `confianca` ficava só no ALTER manual de uma sessão e voltava
// a 'confirmado' toda vez que casa_tcesc_pncp reconstruía a tabela — a tela dizia "confirmado" para par que
// a própria auditoria tinha reprovado.
console.log("\n3) graduando os pares auditados (escreve confiança e nota; NÃO remove nada)…");
const grad = await db.query(`
  update app.processo_tce_pncp p
     set confianca = case when a.veredito like 'REPROVADO%' then 'divergente'
                          when a.veredito like 'SUSPEITO%'  then 'a_verificar'
                          else 'confirmado' end,
         nota_verificacao = case when a.veredito like 'APROVADO%' then null else a.veredito end
    from app.tce_match_auditoria a
   where a.cnpj=p.cnpj and a.ano=p.ano and a.seq=p.seq and a.identificador_sfi=p.identificador_sfi`);
console.table((await db.query(`select confianca, count(*) pares from app.processo_tce_pncp group by 1 order by 2 desc`)).rows);
console.log(`   ${grad.rowCount} pares graduados`);

if (PROMOVER) {
  const del = await db.query(`
    delete from app.processo_tce_pncp p
    using app.tce_match_auditoria a
    where a.cnpj=p.cnpj and a.ano=p.ano and a.seq=p.seq and a.identificador_sfi=p.identificador_sfi
      and a.veredito like 'REPROVADO%'`);
  console.log(`\n✔ PROMOÇÃO aplicada: ${del.rowCount} pares reprovados removidos do casamento`);
  console.table((await db.query(`
    with h as (select distinct cnpj,ano,seq from itens_sc where unit_homologado>0)
    select count(*) homologados, count(*) filter (where exists(select 1 from app.processo_tce_pncp x
      where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq)) casados,
      round(100.0*count(*) filter (where exists(select 1 from app.processo_tce_pncp x
      where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq))/count(*),1) pct from h`)).rows);
} else {
  console.log("\n(nada foi alterado — rode com PROMOVER=1 para remover os reprovados do casamento)");
}
console.log(`\nauditoria em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await db.end();
