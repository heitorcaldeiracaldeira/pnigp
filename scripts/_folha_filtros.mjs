// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _folha_filtros.mjs — os VETOS por coletor da folha, em UM lugar só.
//
// POR QUÊ: o veto vivia dentro de `fix_view_folha_brasil.mjs` e valia só para a view. O contador nacional
// (`_cobertura_folha_nacional.mjs`) lê as tabelas CRUAS e ignorava todos eles — então um município cuja única
// coleta é a da CÂMARA entrava no número do produto como "tem folha". A view dizia uma coisa e a manchete outra.
// Quem descreve o dado tem de descrever igual em todo lugar ([[pnigp-view-folha-nao-enxerga-coletores]]).
//
// Cada entrada é um PREDICADO (sem `where`) sobre a tabela `folha_servidores_<chave>`. Quem usa decide se
// prefixa `where` ou concatena com `and`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const FILTRO_FOLHA = {
  // 🚨 cidadesmg: o radar achou o portal da CÂMARA (`cm{slug}.cidadesmg.com.br`) em 14 municípios e o coletor
  //    gravou a folha dos vereadores como se fosse a da prefeitura — 14 a 62 linhas onde a prefeitura tem de
  //    400 a 2.700. A prefeitura mora no host `pm{slug}`, já recoletado em 11 deles. As linhas da câmara ficam
  //    no banco e fora da contagem; 3 municípios (Salinas, Serro, Virgem da Lapa) voltam a contar como SEM
  //    folha, que é a verdade ([[pnigp-radar-mapeou-a-camara-causa-nacional]], [[pnigp-entidade-espelho-infla-folha]]).
  // 🚨 …e a geração ANTIGA exporta o mês junto com o 13º (Augusto de Lima: 649 pagamentos para 328 pessoas).
  //    Somar os dois infla a folha do mês, como no Ágili Blue. `tipo_folha` nulo = geração nova, que só traz o mês.
  //    ⚠️ `mensal (férias)` e `mensal (rescisão)` ENTRAM: são a remuneração daquele período, não pagamento extra.
  //    Só o 13º sai. Ver a classificação em `ingest_folha_cidadesmg_antigo.mjs`.
  cidadesmg: `base_url !~* '//cm' and coalesce(tipo_folha,'mensal') like 'mensal%'`,
  // 🚨 O SCPI tem municípios cuja coleta é só da CÂMARA (cargos de vereador, 1-10% da RAIS): contá-los como
  //    cobertura municipal é dar por publicada uma folha que não existe. Ficam marcados em folha_scpi_coleta.
  // 🚨 …e o 13º SALÁRIO entra na mesma tabela como uma "referência" própria (o campo mistura TIPO e MÊS:
  //    "Folha Mensal - Julho", "Férias - Junho", "13º Salário - Dezembro"). Medido em 19/ago: **15.414 linhas /
  //    R$ 28,4 mi em 72 municípios** — quem soma reais conta o 13º junto com o mês. Férias, rescisão e
  //    complementar FICAM (remuneração daquele período), a mesma régua do cidadesmg e do Ágili Blue.
  //    ✅ Conferido antes de vetar: **nenhum** município tem o 13º como única coleta — ninguém sai da cobertura.
  // ⭐ RESOLVIDO (19/ago): 19 municípios tinham DOIS ou três meses de "Folha Mensal" — quem soma reais contava o
  //    município duas vezes (Picos: julho 2.394 pessoas E agosto 1.978). ⚖️ NÃO se apaga a folha do outro mês:
  //    ela é dado real e publicado, e o problema é de CONSUMO. `folha_scpi_competencia_principal` declara o mês
  //    com mais pessoas por município (`_scpi_dois_meses.mjs`) e o veto exige esse mês — férias, rescisão e
  //    complementar DAQUELE mês continuam entrando. O dado do outro mês fica no banco, visível a quem quiser.
  scpi: `not exists (select 1 from folha_scpi_coleta c
           where c.cod_ibge = folha_servidores_scpi.cod_ibge and c.situacao in ('ok_so_camara','so_camara'))
         and (entidade is null or entidade !~* '\\mc[âa]mara\\M|\\mlegislativ')
         and coalesce(referencia,'') !~* '13.{0,3}sal|d[ée]cimo.{0,3}terceiro'
         and not exists (select 1 from folha_scpi_competencia_principal p
                          where p.cod_ibge = folha_servidores_scpi.cod_ibge
                            and p.mes is distinct from scpi_mes(folha_servidores_scpi.referencia)
                            and scpi_mes(folha_servidores_scpi.referencia) is not null)`,
  // 🚨 21/ago/2026: o MegaSoft passou a colher também a CÂMARA (`PODER=legislativo`), na mesma tabela e com a
  //    coluna `poder` marcada. Sem este veto a folha dos vereadores entraria na conta da prefeitura.
  megasoft: `(poder is null or poder <> 'legislativo')`,
  nucleogov: `(poder is null or poder <> 'legislativo')`,
  portaltp: `(poder is null or poder <> 'legislativo')`,
  quality: `(poder is null or poder <> 'legislativo')`,
  smarapd: `(poder is null or poder <> 'legislativo')`,
  // ⭐ 22/ago: as 23 câmaras do catálogo passaram a ser colhidas; aqui quem separa é a ENTIDADE (o rótulo do
  //    portal já diz "Câmara Municipal de X"), não uma coluna de poder.
  transpcidadao: `(entidade is null or entidade !~* '\\mc[âa]mara\\M')`,
  // 🚨 21/ago/2026: o Betha tem 382 PORTAIS DE CÂMARA no `betha_portal` e o coletor os percorre junto com os da
  //    prefeitura — a entidade declarada (`nomeEntidade`, ou o nome do portal) é quem separa.
  //    ⚠️ CUSTO MEDIDO: 5 municípios têm entidade de câmara no betha e só **Erval Seco/RS** fica sem folha
  //    nenhuma (as 26 linhas dele são "CAMARA MUNICIPAL DE VEREADORES DE ERVAL SECO"). Mostrar a lacuna é mais
  //    honesto do que dar a câmara por prefeitura ([[pnigp-lista-sem-valor-nao-e-folha]]).
  //    ⚠️ Linhas ANTIGAS de portal de câmara vieram com `entidade` NULA e este veto não as alcança — quem as
  //    pega é a re-passada, que agora grava a entidade.
  betha: `(entidade is null or entidade !~* '\\mc[âa]mara\\M|\\mlegislativ')`,
  // 🚨 O Ágili Blue traz 13º Salário, Férias, Licença prêmio, Rescisão e Complementar junto com a folha
  //    Mensal — somar tudo infla (Ipanguaçu: 1.603 linhas para 1.146 nomes). A folha do mês é só a Mensal;
  //    o resto fica na tabela para quem precisar. Ver [[pnigp-agili-blue-api-uc]].
  agiliblue: `tipo_calculo ilike 'mensal'`,
  // 🚨 O GeneXus e-transparência exporta com "TODAS AS FOLHAS" e algumas delas NÃO são remuneração: o portal
  //    trata vale-alimentação, auxílio-transporte e bônus como folhas próprias, com uma linha por servidor.
  //    Em Lins isso é R$ 1,89 mi sobre R$ 11,46 mi — **16,5% de inflação** num único mês. Férias, rescisão e
  //    complementar FICAM: são remuneração daquele período, a mesma régua do cidadesmg.
  //    ⚠️ Conferido antes de vetar: **nenhuma pessoa** aparece só em folha de benefício nos 8 municípios, então
  //    o veto tira dinheiro que não é salário sem tirar ninguém da contagem ([[pnigp-lista-sem-valor-nao-e-folha]]).
  genexus: `(folha_tipo is null or folha_tipo !~* 'aux[ií]lio|vale|b[ôo]?nus|transporte|alimenta')`,
  // 🚨 MEMORY: o portal identifica o ente por CÓDIGO (`98H9AD`), nunca por nome — nem na tela, nem na API. Quando
  //    o mesmo código é declarado por DOIS municípios (Cabeceira Grande e Formoso apontam ambos `98H9AD/1` para
  //    Pessoal), a folha é de um dos dois e não há como saber qual: a RAIS não separa (522 × 476 para 594 linhas)
  //    e a lotação é rubrica orçamentária, sem cidade. ⭐ O DADO FICA na tabela — é real e pode ser reatribuído
  //    quando houver prova —, mas NÃO CONTA como cobertura: publicar folha no município errado é pior do que
  //    mostrar a lacuna ([[pnigp-gemeas-calibragem-e-entidade]]).
  // ⚠️ 21/ago/2026: a CÂMARA passou a ser colhida no mesmo produto (PODER=legislativo) e o Memory identifica o
  //    ente por CÓDIGO, não por nome — só a coluna `poder` separa os dois.
  memory: `(poder is null or poder <> 'legislativo')
         and not exists (select 1 from folha_memory_coleta c
             where c.cod_ibge = folha_servidores_memory.cod_ibge
               and c.situacao in ('entidade_indeterminada','contaminado','entidade_nao_confere'))`,
  // 🚨 O TCE-MT entrega TODAS as unidades gestoras do município na mesma tabela: prefeitura, câmara, RPPS,
  //    consórcio, agência reguladora e autarquia de água. Medido em 18/ago: **13,1% das linhas (21.243 pessoas)
  //    não são do executivo** — 140 municípios com câmara, 105 com RPPS, 22 com consórcio.
  //    ⚖️ O veto é PARCIAL de propósito: câmara, consórcio, agência e autarquia saem (outro poder / outra pessoa
  //    jurídica), mas o **RPPS FICA** — aposentado municipal é folha pública do município, de outra NATUREZA, e
  //    a view o marca como tal em vez de sumir com ele ([[pnigp-tcemt-soma-entidades-no-municipio]]).
  //    ✅ Conferido: nenhum município fica sem folha por causa deste veto — os 3 sem executivo no tcemt
  //    (Cocalinho, Nova Nazaré e o registro da ARIS-MT) já têm outra fonte.
  tcemt: `(entidade is null or entidade !~* 'c[âa]mara|consorcio|consórcio|ag[êe]ncia|regula|autarquia|saae|samae')`,
  // 🚨 21/ago/2026: passei a colher as **417 CÂMARAS da Bahia** pelo mesmo coletor (`TIPO=CAMARA`), na mesma
  //    tabela — a entidade é quem separa. Sem este veto, a folha dos vereadores entraria na conta da PREFEITURA
  //    ([[pnigp-radar-mapeou-a-camara-causa-nacional]]). Ela não some: vive em `vw_folha_camara_brasil`.
  //    ✅ Conferido antes: os 417 municípios da BA já têm a folha do executivo pelo mesmo tribunal — nenhum sai
  //    da cobertura por causa deste veto ([[pnigp-ba-completa-por-municipio-nao-por-pessoa]]).
  tcmba: `(entidade is null or entidade !~* '\\mc[âa]mara\\M')`,
  // 🚨 DOIS COLETORES NO MESMO PORTAL (19/ago): `gxrh` e `genexus_wwp` falam com o MESMO GeneXus/WorkWithPlus em
  //    domínio próprio, cada um escolhendo uma competência. Em 7 municípios de SP (Adamantina, São Manuel,
  //    Cajati, Flórida Paulista, Joanópolis, Irapuru, Monte Mor) os dois têm dado: a cobertura não muda (pessoas
  //    distintas não somam), mas quem soma REAIS conta o município duas vezes.
  //    Fica o `gxrh`, que filtra o órgão EXECUTIVO explicitamente e traz organograma/centro de custo — em Monte
  //    Mor o wwp tem 2.199 linhas SEM NOME (0 pessoas) e o gxrh tem as 2.199 nominais.
  //    ⚠️ CUSTO DECLARADO: em Joanópolis o wwp trazia 621 pessoas (comp 202606) contra 492 do gxrh (202607) —
  //    são as mesmas pessoas noutro mês, e o município segue coberto, mas a contagem dele cai 129.
  //    ⏭️ DÍVIDA: dois coletores para um produto viola "1 método por tipo" — unificar é o conserto de verdade.
  genexus_wwp: `not exists (select 1 from folha_servidores_gxrh g
                  where g.cod_ibge = folha_servidores_genexus_wwp.cod_ibge)`,
  // 🚨 23/ago/2026: o SIAP novo percorre as entidades do portal e traz a CÂMARA junto — a re-tentativa de hoje
  //    gravou São Sebastião/SP (116 linhas) e Pedro de Toledo/SP (21) com entidade "CÂMARA MUNICIPAL DE …" e
  //    os dois passaram a contar como PREFEITURA. Nos dois, a folha do siapapi é INTEIRAMENTE de câmara, então
  //    o veto os tira da cobertura do executivo — que é a verdade ([[pnigp-lista-sem-valor-nao-e-folha]] pelo
  //    lado do PODER). A folha deles não some: vive em vw_folha_camara_brasil.
  siapapi: `(entidade is null or entidade !~* '\\mc[âa]mara\\M|\\mlegislativ')`,
  // 🚨 o catálogo da S&S mistura prefeitura, CÂMARA, institutos de previdência e consórcios no mesmo entcod-space.
  //    O `poder` é lido do CABEÇALHO DO PDF, não do catálogo (que erra) — só o executivo é folha do município.
  ss: `poder = 'executivo'`,
};

// nome da tabela → predicado (ou null). Aceita `folha_servidores_x` ou só `x`.
export const filtroDaTabela = (t) => FILTRO_FOLHA[String(t).replace(/^folha_servidores_/, "")] || null;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// QUEM CONTA COMO SERVIDOR — a régua do ATIVO, separada dos vetos acima de propósito.
//
// 🚨 22/ago/2026: o `tcepe` entrega a lista HISTÓRICA de vínculos, e nós contávamos afastado/desligado como
//    servidor. Câmara do Recife: 4.607 "pessoas" para 1.155 da RAIS — filtrando por `data_afastamento` sobram
//    1.162, que batem com a RAIS na casa decimal. No executivo eram 523.093 afastados contra 391.749 ativos.
//    É [[pnigp-rais-ativo3112-e-o-denominador-do-mes]] pelo lado do NUMERADOR: se o denominador da RAIS conta
//    vínculo ativo em 31/12, o numerador tem de contar ativo também ([[pnigp-tcepe-afastado-conta-como-servidor]]).
//
// ⚖️ POR QUE NÃO É UM VETO: veto tira a linha da VIEW; esta régua não. O afastado é dado real e publicado, e
//    fica visível na view com `situacao = 'Afastado'` — o Heitor decidiu em 22/ago que muda só a CONTAGEM.
//    Por isso `filtroDaTabela` (view + contadores) e `filtroAtivoDaTabela` (só contadores) são listas separadas.
//
// ⚠️ NÃO GENERALIZAR pelo vocabulário de `situacao`: a régua ingênua `situacao !~ '^(ativo|efetivo|normal)'`
//    acusa o `tcmba` como 100% não-ativo, quando o vocabulário dele é "Cargo Comissionado"/"Agente Político" —
//    que são ativos. Só entra aqui fonte onde o desligamento é EXPLÍCITO e binário (uma data de afastamento).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Sobre a TABELA CRUA (`folha_servidores_<chave>`) — usado por `_cobertura_folha_nacional.mjs`.
export const FILTRO_ATIVO = {
  pe: `coalesce(data_afastamento, '') = ''`,
};
export const filtroAtivoDaTabela = (t) => FILTRO_ATIVO[String(t).replace(/^folha_servidores_/, "")] || null;

// Sobre as VIEWS (`vw_folha_municipal_brasil` / `vw_folha_camara_brasil`), que expõem `situacao` já normalizada.
// Só as palavras INEQUÍVOCAS de não-ativo. Nulo, '-', "Cargo Comissionado" e afins continuam contando.
export const ATIVO_NA_VIEW = `coalesce(situacao, '') not in ('Afastado', 'Desligado', 'Inativo', 'Pensionista')`;
