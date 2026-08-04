// VALOR DO ITEM/CONTRATO NO TCE — dono único do saneamento. Quem precisa de valor do TCE lê daqui.
//
// O ERRO NA FONTE (medido em 04/ago/2026, provado contra âncora independente):
//   em parte do e-Sfinge o campo `valor_unitario_contratado` carrega o TOTAL do item, não o preço unitário —
//   e o TCE ainda multiplica esse total pela quantidade. O resultado é um valor elevado ao quadrado:
//   contrato 3822255 → R$ 3.111.600.780.968.498,91 (3,1 quatrilhões) onde o valor real são R$ 88.639.072,44.
//   Prova: `valor_total_contratado = u × q` em 100% das 505.833 linhas (o TCE é internamente coerente;
//   quem está errado é a ENTRADA), e ao reler `u` como total o número bate no CENTAVO com o valor_global do
//   nosso contrato no PNCP — 3822255, 3900293, 3797664, 3738086, 3813088 e outros 461.
//
// É a mesma classe de erro que o PNCP já nos deu e que `build_mislabel_unidade_sc.mjs` nomeia:
// "total lançado como unitário". Mesma doença, outro andar.
//
// A REGRA (três gatilhos, todos ancorados em IMPOSSIBILIDADE, nunca em "parece grande"):
//      A) TETO DO HOMOLOGADO — a soma declarada passa de FATOR_TETO × o que a licitação homologou. É o gatilho
//      forte, e o único que não depende de magnitude: pega o erro de R$ 298 mi e o de R$ 3 mil pelo mesmo
//      critério. 1,25× é o acréscimo máximo do art. 125 da Lei 14.133 (os 50% são só reforma de edifício ou
//      de equipamento, que não distinguimos aqui) — acima disso o contrato não pode ser legítimo. Teto obtido
//      pelo PROCESSO casado, não pelo contrato casado, para não criar dependência circular (o casamento de
//      contrato consome o valor que este script produz).
//   B) o CONTRATO inteiro ficou impossível — soma declarada >= LIMIAR_CONTRATO (R$ 300 mi; o maior contrato
//      real do espelho PNCP é R$ 287 mi). Serve o universo SEM teto: só 14.707 dos 118.106 contratos do TCE
//      estão em processo casado com homologação nossa.
//   C) o ITEM tem unitário impossível — u >= LIMIAR_UNITARIO (R$ 500 mil) por unidade.
//   Em todos exige-se quantidade > 1 (com q=1 o total já é o próprio u: reler não muda nada).
//
// POR QUE ESTES NÚMEROS: medidos contra os contratos casados com o PNCP, varrendo cada desenho.
//   teto 1,25× (+300 mi + 500 mil) → ~3.9 mil consertados, 0 quebrados  ← escolhido (1,2× mediu 3.943/0)
//   só magnitude, contrato >= 300 mi →   891 consertados, 0 quebrados
//   só magnitude, contrato >=   1 mi → 3.043 consertados, 2 QUEBRADOS ← alcance parecido, mas destrói valor certo
// Um sinal quebrado é pior que sinal nenhum: ele carimba de "conferido" um valor que ninguém conferiu.
//
// O QUE ESTE ERRO É, NO FUNDO: uma multiplicação a mais. O TCE faz t = u × q, mas quando `u` já é o total do
// item a quantidade entra DUAS vezes. Por isso a razão entre o valor do TCE e o nosso bate com a quantidade
// do item em 2.867 contratos — é a assinatura aritmética do bug, não coincidência.
//
// NADA É APAGADO: o valor declarado fica em `valor_bruto`/`total_declarado` e cada item diz por qual regra passou.
//   node scripts/sanea_valor_item_tcesc.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const LIMIAR_CONTRATO = Number(process.env.LIMIAR_CONTRATO || 3e8);
const LIMIAR_UNITARIO = Number(process.env.LIMIAR_UNITARIO || 5e5);
// 1,25 = o acréscimo máximo do art. 125 da Lei 14.133 (os 50% valem só para reforma de edifício ou de
// equipamento, que não conseguimos distinguir aqui — então o teto geral é o que vale).
const FATOR_TETO = Number(process.env.FATOR_TETO || 1.25);
const t0 = Date.now();

// o espelho guarda número como TEXTO em formatos que convivem: "1234,56", "1234", "2,5545908864303e+15".
// translate tira espaço; a vírgula vira ponto (serve para decimal E para a mantissa da notação científica).
const P = (c) => `nullif(regexp_replace(replace(translate(${c}, ' ', ''), ',', '.'), '^\\.', '0.'), '')::numeric`;

// O GATILHO, escrito uma vez só: os três caminhos que provam que a multiplicação foi indevida.
// ⚠️ o coalesce não é enfeite: sem teto (left join sem par) `tt.teto > 0` é NULL, o G inteiro vira NULL,
// o `not (G)` deixa de ser verdadeiro e o item cai no ELSE do rótulo — marcando de "relido" 65.704 contratos
// que ninguém releu. Mesmo NULL que já tinha derrubado o b_val no casamento de contrato.
const TETO = `coalesce(b.total_bruto > tt.teto * ${FATOR_TETO}, false)`;
const G = `(${TETO} or b.total_bruto >= ${LIMIAR_CONTRATO} or i.u >= ${LIMIAR_UNITARIO}) and i.q > 1`;

console.log(`gatilhos: teto = ${FATOR_TETO}× o homologado · contrato >= R$ ${(LIMIAR_CONTRATO/1e6).toLocaleString("pt-BR")} mi · unitário >= R$ ${(LIMIAR_UNITARIO/1e3).toLocaleString("pt-BR")} mil`);

console.log("0) teto por contrato do TCE — quanto a licitação de origem homologou…");
await db.query(`drop table if exists _teto`);
if ((await db.query(`select to_regclass('app.processo_tce_pncp') r`)).rows[0].r) {
  await db.query(`
    create temp table _teto as
    with vinc as (select distinct identificador_sfi_processo_licitatorio sfi, idcontrato from tcesc_link_contrato),
    proc as (select distinct p.identificador_sfi, p.cnpj, p.ano, p.seq from app.processo_tce_pncp p),
    -- o teto sai do HOMOLOGADO; onde a licitação ainda não teve resultado publicado no PNCP (situação
    -- "Em andamento", 927.145 itens), cai para o ESTIMADO — que é dado nosso, do próprio PNCP, e não do
    -- contrato que estamos avaliando (usar o contrato seria circular). O estimado costuma ser MAIOR que o
    -- homologado, então como teto ele é generoso: erra para o lado de não mexer.
    hom as (select i.cnpj, i.ano, i.seq,
              coalesce(sum(i.unit_homologado * i.quantidade) filter (where i.unit_homologado > 0),
                       sum(i.unit_estimado    * i.quantidade) filter (where i.unit_estimado    > 0)) v
            from itens_sc i where i.quantidade > 0 group by 1,2,3)
    select v.idcontrato, max(h.v) teto
    from vinc v join proc p on p.identificador_sfi = v.sfi
    join hom h on h.cnpj=p.cnpj and h.ano=p.ano and h.seq=p.seq
    group by 1`);
} else {
  await db.query(`create temp table _teto (idcontrato text, teto numeric)`);
  console.log("   (sem app.processo_tce_pncp — o gatilho do teto fica inativo nesta rodada)");
}
await db.query(`create index on _teto(idcontrato)`);
console.table((await db.query(`select count(*) contratos_com_teto,
  (select count(*) from tcesc_contrato) contratos_no_tce from _teto where teto > 0`)).rows);

console.log("1) lendo o item cru e marcando quem tem leitura impossível…");
await db.query(`drop table if exists app.tce_item_valor`);
await db.query(`
  create table app.tce_item_valor as
  with it as (
    select idcontrato, id_item_contratado, descricao_unidade_medida_contratado unidade,
           ${P("valor_unitario_contratado")} u, ${P("quantidade_item_contratado")} q, ${P("valor_total_contratado")} t
    from tcesc_item_contrato
    where valor_total_contratado is not null),
  bruto as (select idcontrato, sum(t) total_bruto from it group by 1)
  select i.idcontrato, i.id_item_contratado, i.unidade,
    i.u unitario_declarado, i.q quantidade, i.t total_declarado, tt.teto teto_homologado,
    -- releitura: quando o gatilho acende, 'u' é o total do item e o unitário verdadeiro é u/q
    case when ${G} then i.u else i.t end valor_item,
    case when ${G} then i.u / i.q else i.u end unitario_item,
    case when not (${G}) then 'declarado'
         when ${TETO} then 'total_no_unitario (acima do teto homologado)'
         when b.total_bruto >= ${LIMIAR_CONTRATO} then 'total_no_unitario (contrato impossível)'
         else 'total_no_unitario (unitário impossível)' end regra
  from it i join bruto b on b.idcontrato = i.idcontrato
  left join _teto tt on tt.idcontrato = i.idcontrato`);
await db.query(`create index ix_tiv on app.tce_item_valor(idcontrato)`);
console.table((await db.query(`select regra, count(*) itens, count(distinct idcontrato) contratos,
  round(100.0*count(*)/sum(count(*)) over (),2) pct from app.tce_item_valor group by 1 order by 2 desc`)).rows);

console.log("\n2) agregando no CONTRATO (mantendo o valor declarado ao lado, para auditoria)…");
await db.query(`drop table if exists app.tce_contrato_valor`);
await db.query(`
  create table app.tce_contrato_valor as
  select idcontrato, sum(valor_item) valor, sum(total_declarado) valor_bruto, count(*) n_itens,
         count(*) filter (where regra <> 'declarado') itens_reinterpretados
  from app.tce_item_valor group by 1`);
await db.query(`create unique index ix_tcv on app.tce_contrato_valor(idcontrato)`);
console.table((await db.query(`select count(*) contratos,
  count(*) filter (where itens_reinterpretados > 0) com_releitura,
  max(valor_bruto)::numeric(30,2) maior_declarado, max(valor)::numeric(20,2) maior_saneado,
  percentile_disc(0.5) within group (order by valor)::numeric(18,2) mediana from app.tce_contrato_valor`)).rows);

console.log("\n3) PROVA — a releitura aproxima ou afasta do nosso contrato no PNCP?");
try {
  console.table((await db.query(`
    select count(*) pares_com_ancora,
      count(*) filter (where abs(m.valor_global - v.valor_bruto) <= 0.01*greatest(m.valor_global, v.valor_bruto)) batia_antes,
      count(*) filter (where abs(m.valor_global - v.valor)       <= 0.01*greatest(m.valor_global, v.valor))       bate_depois,
      count(*) filter (where abs(m.valor_global - v.valor_bruto) >  0.01*greatest(m.valor_global, v.valor_bruto)
                         and abs(m.valor_global - v.valor)       <= 0.01*greatest(m.valor_global, v.valor)) consertados,
      count(*) filter (where abs(m.valor_global - v.valor_bruto) <= 0.01*greatest(m.valor_global, v.valor_bruto)
                         and abs(m.valor_global - v.valor)       >  0.01*greatest(m.valor_global, v.valor)) quebrados
    from app.contrato_tce_pncp m join app.tce_contrato_valor v on v.idcontrato = m.idcontrato
    where m.valor_global > 0`)).rows);
  console.log("   (quebrados > 0 significa que o limiar está destruindo valor certo — reveja antes de promover)");
} catch (e) { console.log("   sem casamento de contrato ainda para provar contra: " + e.message); }

console.log(`\nsaneado em ${((Date.now() - t0)/1000).toFixed(0)}s`);
await db.end();
