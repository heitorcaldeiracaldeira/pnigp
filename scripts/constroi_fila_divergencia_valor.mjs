// FILA DE AVERIGUAÇÃO — contratos em que o valor do PNCP e o do TCE/SC não fecham.
//
// Pedido do Heitor (04/ago/2026): "coloca os contratos que aparecerem com divergência para averiguação da
// equipe da prefeitura". A fila é para o SERVIDOR conferir, não é acusação e não é conclusão nossa:
// divergir pode ser recorte diferente (ata contratada em parte), aditivo, remessa incompleta ao Tribunal —
// ou erro de digitação de qualquer um dos dois lados. Quem sabe é a equipe que tem o processo na mão.
//
// REGRAS DE HONESTIDADE (ver [feedback-tom-neutro-metodologia] e [feedback-relatorio-municipio-puro]):
//   · só entra par cujo VÍNCULO já está confirmado — divergência sobre casamento frágil é ruído, não achado;
//     os de vínculo frágil ficam na tabela marcados, para não sumirem em silêncio;
//   · o valor DECLARADO pelo TCE fica ao lado do saneado: se a linha existe por causa da releitura
//     (total lançado no campo do unitário), isso é dito na própria linha;
//   · a causa é "provável", derivada de evidência, nunca afirmada.
//   node scripts/constroi_fila_divergencia_valor.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const GAP = Number(process.env.GAP || 0.01);   // divergência a partir de 1% — abaixo disso é arredondamento
const t0 = Date.now();

// ASSINATURA ARITMÉTICA da multiplicação indevida: a razão entre o valor do TCE e o nosso É a quantidade do
// item. Não é divergência de contrato — é o total lançado no campo do preço unitário na remessa, em contrato
// que ficou abaixo dos gatilhos do saneamento (sem teto disponível, ou item com quantidade 1).
// Escrito uma vez e usado nos dois lugares (causa e balde) para os dois nunca discordarem.
const MULT = `q.qmax > 1 and v.valor > m.valor_global
              and v.valor / nullif(m.valor_global,0) between q.qmax*0.9 and q.qmax*1.1`;

for (const t of ["app.contrato_tce_pncp", "app.tce_contrato_valor"]) {
  if (!(await db.query(`select to_regclass($1) r`, [t])).rows[0].r) {
    console.error(`ERRO: ${t} não existe — rode antes sanea_valor_item_tcesc.mjs e casa_contrato_tcesc.mjs`); process.exit(1);
  }
}

console.log("1) valor homologado do processo (serve de árbitro entre os dois lados)…");
await db.query(`drop table if exists _homol`);
await db.query(`
  create temp table _homol as
  select i.cnpj, i.ano, i.seq, sum(i.unit_homologado * i.quantidade) valor_homologado
  from itens_sc i
  where i.unit_homologado > 0 and i.quantidade > 0
    and exists (select 1 from app.contrato_tce_pncp m where m.cnpj=i.cnpj and m.ano=i.ano and m.seq=i.seq)
  group by 1,2,3`);
await db.query(`create index on _homol(cnpj,ano,seq)`);

console.log("2) montando a fila…");
await db.query(`drop table if exists app.tce_divergencia_valor`);
await db.query(`
  create table app.tce_divergencia_valor as
  select
    m.cod_ibge, m.cnpj, m.ano, m.seq, m.id contrato_id, m.idcontrato,
    n.fornecedor, n.ni_fornecedor, n.objeto, n.assinatura,
    m.valor_global valor_pncp, v.valor valor_tce, v.valor_bruto valor_tce_declarado,
    v.itens_reinterpretados, h.valor_homologado,
    (m.valor_global - v.valor) diferenca,
    round((abs(m.valor_global - v.valor) / greatest(m.valor_global, v.valor))::numeric, 4) gap,
    (m.valor_global > v.valor) pncp_maior,
    m.confianca vinculo, m.metodo metodo_vinculo, m.sinais,
    -- CAUSA PROVÁVEL: sempre derivada de evidência que está na própria linha
    case
      when ${MULT} then
        'O valor do TCE equivale ao do PNCP multiplicado pela quantidade do item — indício de que o total foi lançado no campo do preço unitário na remessa ao Tribunal. Confira a remessa, não o contrato.'
      when v.itens_reinterpretados > 0 then
        'O valor do TCE precisou ser reconstruído: o e-Sfinge trouxe o total do item no campo do preço unitário. Confira a remessa do contrato ao Tribunal.'
      when h.valor_homologado > 0 and abs(h.valor_homologado - v.valor) <= 0.01*greatest(h.valor_homologado, v.valor)
           and v.valor > m.valor_global then
        'O TCE registra o valor total homologado na licitação e este contrato cobre parte dele. Verifique se há outros contratos ou adesões do mesmo processo.'
      when h.valor_homologado > 0 and abs(h.valor_homologado - m.valor_global) <= 0.01*greatest(h.valor_homologado, m.valor_global)
           and m.valor_global > v.valor then
        'O contrato no PNCP bate com o valor homologado; o TCE registra menos. Verifique se todos os itens do contrato foram informados ao Tribunal.'
      when m.valor_global > v.valor then
        'O contrato no PNCP é maior que o registrado no TCE. Verifique aditivo, item não informado ou remessa parcial.'
      else
        'O TCE registra valor maior que o contrato no PNCP. Verifique aditivo registrado só no Tribunal, ou se o registro do TCE abrange mais de um contrato.'
    end causa_provavel,
    -- prioridade pelo DINHEIRO em jogo, não pelo percentual: 30% de R$ 5 mil não ocupa a equipe
    case when abs(m.valor_global - v.valor) >= 1e6 then 1
         when abs(m.valor_global - v.valor) >= 1e5 then 2 else 3 end prioridade,
    -- Dois baldes, e eles NÃO se misturam na tela:
    --   a_averiguar        = o valor dos dois lados é confiável e mesmo assim não fecha → trabalho de contrato
    --   remessa_a_corrigir = o número do TCE é o nosso multiplicado pela quantidade → trabalho de REGISTRO,
    --                        e mostrar essa diferença como se fosse do contrato é mentira aritmética
    case when ${MULT} then 'remessa_a_corrigir' else 'a_averiguar' end::text situacao, now() atualizado
  from app.contrato_tce_pncp m
  join app.tce_contrato_valor v on v.idcontrato = m.idcontrato
  join app.pncp_contrato_norm n on n.id = m.id
  left join _homol h on h.cnpj=m.cnpj and h.ano=m.ano and h.seq=m.seq
  left join (select idcontrato, max(quantidade) qmax from app.tce_item_valor group by 1) q
         on q.idcontrato = m.idcontrato
  where m.valor_global > 0 and v.valor > 0
    and abs(m.valor_global - v.valor) > ${GAP} * greatest(m.valor_global, v.valor)`);
await db.query(`create index ix_tdv_cod on app.tce_divergencia_valor(cod_ibge, prioridade)`);
await db.query(`create index ix_tdv_proc on app.tce_divergencia_valor(cnpj, ano, seq)`);

console.log("\n=== a fila ===");
console.table((await db.query(`select
  count(*) contratos, count(*) filter (where vinculo='confirmado') vinculo_confirmado,
  count(*) filter (where vinculo <> 'confirmado') vinculo_a_verificar,
  count(distinct cod_ibge) municipios,
  sum(abs(diferenca))::numeric(18,2) diferenca_absoluta_total from app.tce_divergencia_valor`)).rows);

console.log("=== por prioridade (só vínculo confirmado — é o que vai para a equipe) ===");
console.table((await db.query(`select prioridade,
  case prioridade when 1 then 'diferença >= R$ 1 mi' when 2 then 'R$ 100 mil a 1 mi' else 'abaixo de R$ 100 mil' end faixa,
  count(*) contratos, count(distinct cod_ibge) municipios,
  sum(abs(diferenca))::numeric(18,2) soma_diferencas
  from app.tce_divergencia_valor where vinculo='confirmado' group by 1,2 order by 1`)).rows);

console.log("=== os dois baldes (vínculo confirmado) ===");
console.table((await db.query(`select situacao, count(*) contratos, count(distinct cod_ibge) municipios,
  sum(abs(diferenca))::numeric(18,2) soma_diferencas
  from app.tce_divergencia_valor where vinculo='confirmado' group by 1 order by 2 desc`)).rows);

console.log("=== por causa provável ===");
console.table((await db.query(`select left(causa_provavel, 74) causa, count(*) contratos
  from app.tce_divergencia_valor where vinculo='confirmado' group by 1 order by 2 desc`)).rows);

console.log("=== os 10 municípios com mais contratos na fila ===");
console.table((await db.query(`select d.cod_ibge, e.nome municipio, count(*) contratos,
  count(*) filter (where d.prioridade=1) acima_de_1_mi, sum(abs(d.diferenca))::numeric(18,2) soma
  from app.tce_divergencia_valor d left join entes_sc e on e.cod_ibge = d.cod_ibge
  where d.vinculo='confirmado' group by 1,2 order by 3 desc limit 10`)).rows);

console.log(`\nfila construída em ${((Date.now()-t0)/1000).toFixed(0)}s`);
await db.end();
