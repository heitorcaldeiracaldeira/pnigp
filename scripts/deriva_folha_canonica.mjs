// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// deriva_folha_canonica.mjs — a camada CANÔNICA do pessoal municipal: uma linha por vínculo, com os cinco campos
// do pedido (município · secretaria · cargo · função · salário) vindos de quatro fontes distintas.
//
// A regra de honestidade da view: cada fonte declara o que ENTREGA. Onde a fonte não tem o campo, a coluna vem
// NULL — nunca preenchida por estimativa. `fonte` e `cobertura` ficam na própria linha para que qualquer soma
// possa ser lida com o denominador certo ([[pnigp-atas-extracao-estudo]]).
//
// Fontes e o que cada uma tem:
//   farol-tcesc  SC, 295 municípios, mês a mês de 2025 — TEM os cinco, com nome do servidor
//   tcepe        PE, 184 municípios, remessa 2026 — tem tudo menos SALÁRIO
//   tcema        MA, 217 municípios, 2021 (o sistema novo do tribunal está fora do ar) — tudo menos NOME
//   rais         Brasil, 5.570 municípios, 2025 — município, cargo (CBO), vínculo e salário; SEM órgão e SEM nome
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

// Grande grupo da CBO: o primeiro dígito do código já classifica a ocupação, e não depende de baixar o
// dicionário completo da CBO (que o FTP do MTE não serve em rota direta).
await q(`create or replace view vw_cbo_grande_grupo as
  select g.cod, g.nome from (values
    ('0','Militares'),
    ('1','Dirigentes e membros do poder público'),
    ('2','Profissionais das ciências e das artes (nível superior)'),
    ('3','Técnicos de nível médio'),
    ('4','Trabalhadores de serviços administrativos'),
    ('5','Trabalhadores dos serviços, vendedores'),
    ('6','Trabalhadores agropecuários e florestais'),
    ('7','Trabalhadores da produção de bens e serviços industriais'),
    ('8','Trabalhadores da produção de bens e serviços industriais (contínuo)'),
    ('9','Trabalhadores de manutenção e reparação')
  ) as g(cod, nome)`);

await q(`create or replace view vw_folha_municipal_brasil as
  -- SANTA CATARINA — a única fonte com os cinco campos juntos
  select 'farol-tcesc'::text          as fonte,
         'SC'::text                   as uf,
         f.anomes::text               as competencia,
         f.cod_ibge,
         f.municipio,
         f.orgao,
         f.area                       as secretaria,
         f.lotacao_origem             as lotacao_fonte,
         f.cargo,
         f.funcao,
         f.situacao,
         f.nome,
         f.bruto                      as salario_bruto
    from vw_folha_municipal_sc f
  union all
  -- PERNAMBUCO — nominal e com órgão, sem remuneração publicada
  select 'tcepe', 'PE', coalesce(p.ano_remessa,'') || lpad(coalesce(p.mes_remessa,''),2,'0'),
         p.municipio_cod, p.municipio, p.uj_nome, p.uj_nome, p.uj_nome,
         p.cargo, p.tipo_vinculo,
         case when p.data_afastamento is null or p.data_afastamento='' then 'Ativo' else 'Afastado' end,
         p.nome, null::numeric
    from folha_servidores_pe p
  union all
  -- MARANHÃO — com valor e unidade, sem nome (CPF mascarado na origem)
  select 'tcema', 'MA', m.ano::text || lpad(m.mes::text,2,'0'),
         null, m.ente, m.unidade, m.unidade, m.unidade,
         m.cargo, coalesce(m.natureza_cargo, m.regime),
         case when m.data_exclusao is null or m.data_exclusao='null' then 'Ativo' else 'Desligado' end,
         null, m.valor_bruto
    from folha_servidores_ma m
  union all
  -- BETHA — o portal do próprio município: os três campos juntos e a SECRETARIA DECLARADA (não derivada),
  -- na competência corrente. É a fonte mais completa das cinco.
  -- nem todo portal preenche o campo "orgao"; quando falta, o "organograma" é o nível de lotação que sobrou
  select 'betha', b.uf, replace(coalesce(b.competencia,''),'-',''),
         b.cod_ibge, b.municipio, b.entidade,
         coalesce(nullif(b.secretaria,''), nullif(b.organograma,'')), b.organograma,
         b.cargo, b.vinculo, 'Ativo', b.nome, b.bruto
    from folha_servidores_betha b
  union all
  -- RIO GRANDE DO SUL — pelo empenho: secretaria declarada e valor, SEM cargo. 495 das 497 prefeituras
  -- detalham o órgão orçamentário (só Caxias do Sul lança em bloco único), então a leitura por secretaria vale.
  -- Uma linha por mês × secretaria × credor; a coluna "nominal" marca a fatia em que o credor é o servidor.
  select 'tcers', 'RS', r.ano || lpad(r.mes::text,2,'0'),
         null, r.ente, r.secretaria, r.secretaria, r.unidade,
         null, r.rubrica,
         'Ativo', case when r.nominal then r.credor end, r.vl_pagamento
    from folha_empenho_rs r
  union all
  -- BRASIL — censitário e anônimo: sem órgão e sem nome, mas cobre os 5.570 municípios
  select 'rais', null, r.ano::text,
         r.cod_ibge6, null, r.natureza_desc, null, null,
         r.cbo, coalesce(r.tipo_vinculo_desc, r.tipo_vinculo),
         case when r.ativo_3112 then 'Ativo' else 'Desligado no ano' end,
         null, r.rem_media
    from folha_rais_municipal r`);

// cobertura declarada por fonte — é isto que impede somar peras com maçãs
await q(`create or replace view vw_folha_cobertura as
  select fonte, uf, count(*) linhas,
         count(distinct coalesce(cod_ibge, municipio)) municipios,
         count(*) filter (where secretaria is not null) com_secretaria,
         count(*) filter (where nome is not null)       com_nome,
         count(*) filter (where salario_bruto is not null) com_salario,
         min(competencia) competencia_min, max(competencia) competencia_max
    from vw_folha_municipal_brasil group by 1,2`);

console.log("views criadas. cobertura atual:");
const r = await q(`select * from vw_folha_cobertura order by linhas desc`);
console.table(r.rows);
await db.end();
