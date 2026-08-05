// AS CADEIAS COMO DADO — quem roda o quê, em que ordem, com que ambiente e com que regra de falha.
//
// Antes daqui isso morava espalhado em seis arquivos .cmd, cada um com a sua convenção: um parava no primeiro
// erro e outro seguia, um isolava o ambiente e outro deixava vazar, um escrevia log na raiz do repo e outro em
// Temp, um devolvia o código de saída de verdade e outro devolvia sempre 0 porque terminava num echo. Nada
// disso era decisão: era o que cada arquivo tinha virado. Aqui a decisão é declarada e o motor (roda.mjs) a
// cumpre igual para todas.
//
// CAMPOS DE UMA CADEIA
//   titulo      texto para o log e para o painel
//   log         nome do arquivo em %LOCALAPPDATA%\Temp (um arquivo por cadeia, sempre)
//   trava       { nome, toleranciaMin } — exclusão mútua. null quando o próprio script já se tranca.
//   aoFalhar    "parar"  = o passo seguinte consome o anterior; se um quebra, o resto sairia errado
//               "seguir" = os passos são independentes o bastante; esconder os que funcionam é pior
//   env         ambiente comum a todos os passos da cadeia
//   passos[]    { rotulo, script, env, timeoutMin }  ou  { rotulo, cadeia }
//
// O ENV DE UM PASSO NÃO VAZA PARA O SEGUINTE. Cada passo recebe o ambiente montado da declaração — base do
// processo + env da cadeia + env do passo — e nada do passo anterior. Era assim que o CONC=6 do consumidor de
// evento chegava aos 17 extratores de marca, calibrados para CONC=3.
//
// PASSO QUE É OUTRA CADEIA vira uma chamada ao próprio runner. É o que garante uma porta só: a rodada completa
// executa exatamente o mesmo caminho que o Agendador executa, e não um atalho paralelo para o node.

const ANO = new Date().getFullYear();

export const CADEIAS = {
  coleta: {
    titulo: "Coleta do PNCP e das fontes devidas",
    log: "pnigp-coleta.log",
    trava: null,   // etl_orquestrador.mjs pega a trava "orquestrador" por conta própria, com batida viva
    aoFalhar: "parar",
    env: { MODO: "run" },
    passos: [
      { rotulo: "orquestrador de coleta", script: "scripts/etl_orquestrador.mjs" },
    ],
  },

  solicitados: {
    titulo: "Atende pedidos de coleta feitos na tela /etl",
    log: "pnigp-coleta.log",
    trava: null,   // mesma trava "orquestrador", pega lá dentro
    aoFalhar: "parar",
    env: { MODO: "solicitados" },
    passos: [
      { rotulo: "orquestrador (só o solicitado)", script: "scripts/etl_orquestrador.mjs" },
    ],
  },

  itens: {
    titulo: "Consumidor de evento — mantém itens_sc fresco",
    log: "pnigp-itens.log",
    // A trava mora DENTRO do consome_evento_dado.mjs, e não aqui, porque ele é alcançável por quatro portas:
    // a tarefa horária, a fonte `eventos_dado` do orquestrador, o run_enriquecimento_diario.cmd e este runner.
    // Trava posta na cadeia deixaria as outras três passando por baixo. (A fila em si não se protege: o SELECT
    // pega `consumido_dado IS NULL LIMIT LOTE` sem FOR UPDATE SKIP LOCKED, então dois consumidores escolhem
    // exatamente os mesmos eventos.)
    trava: null,
    aoFalhar: "parar",
    env: {},
    passos: [
      { rotulo: "drena a fila de eventos", script: "scripts/consome_evento_dado.mjs", env: { LOTE: "25000", CONC: "6" } },
    ],
  },

  enriquecimento: {
    titulo: "Descrição do item a partir dos documentos do processo",
    log: "pnigp-enriquecimento.log",
    trava: { nome: "cadeia_enriquecimento", toleranciaMin: 60 },
    aoFalhar: "parar",   // o enriquecedor consome a fila que o passo anterior constrói
    env: {},
    passos: [
      { rotulo: "constrói a fila", script: "scripts/constroi_fila_enriquecimento.mjs" },
      { rotulo: "enriquece em paralelo", script: "scripts/enriquece_paralelo.mjs", env: { LIMIT: "0" } },
    ],
  },

  marca: {
    titulo: "Cadeia da marca e do modelo",
    log: "pnigp-marca.log",
    trava: null,   // pipeline.mjs pega "cadeia_marca" por conta própria (e a batida dele fica viva 17 etapas)
    aoFalhar: "seguir",
    env: {},
    passos: [
      { rotulo: "pipeline da marca (17 etapas)", script: "scripts/auditoria/pipeline.mjs" },
    ],
  },

  tce: {
    titulo: "Casamento TCE × PNCP, saneamento do valor e fila de averiguação",
    log: "pnigp-tce.log",
    // o passo 1 faz DROP e reconstrói app.processo_tce_pncp: duas execuções sobrepostas derrubam a tabela
    // debaixo do passo 6 da outra. 45 min cobre o passo mais lento (statement_timeout de 1790s).
    trava: { nome: "cadeia_tce", toleranciaMin: 45 },
    // PARA no primeiro erro, e o motivo é de dado: se o saneamento falhar e a cadeia seguisse, o casamento de
    // contrato leria valor VELHO e a fila sairia com divergência que não existe.
    aoFalhar: "parar",
    env: {},
    passos: [
      { rotulo: "casamento por numero de edital", script: "scripts/casa_tcesc_pncp.mjs", timeoutMin: 30 },
      { rotulo: "saneamento do valor - 1a passada", script: "scripts/sanea_valor_item_tcesc.mjs", timeoutMin: 30 },
      { rotulo: "casamento por objeto+valor", script: "scripts/casa_tcesc_objeto_valor.mjs", timeoutMin: 40 },
      { rotulo: "casamento por objeto+datas", script: "scripts/casa_tcesc_objeto_datas.mjs", timeoutMin: 40 },
      // roda o MESMO script de novo de propósito: a 1a passada dá teto parcial para os casadores 3 e 4, e esta
      // fecha o teto com o casamento inteiro. Sem ela, todo par novo fica sem teto até o dia seguinte.
      { rotulo: "saneamento do valor - 2a passada", script: "scripts/sanea_valor_item_tcesc.mjs", timeoutMin: 30 },
      { rotulo: "casamento contrato", script: "scripts/casa_contrato_tcesc.mjs", timeoutMin: 30 },
      { rotulo: "auditoria do casamento", script: "scripts/audita_casamento_tce.mjs", timeoutMin: 30 },
      { rotulo: "quadro de apontamentos", script: "scripts/constroi_tce_apontamentos.mjs", timeoutMin: 30 },
      { rotulo: "apontamento no processo", script: "scripts/constroi_tce_apontamento_processo.mjs", timeoutMin: 30 },
      { rotulo: "fila de averiguacao", script: "scripts/constroi_fila_divergencia_valor.mjs", timeoutMin: 30 },
    ],
  },

  // A RODADA COMPLETA é uma cadeia de cadeias: cada passo chama o runner de novo, no mesmo caminho que o
  // Agendador usa. Não para no primeiro erro porque as cinco são independentes o bastante e, numa rodada de
  // verificação, esconder as quatro que funcionaram por causa de uma que quebrou é pior do que seguir e dizer.
  rodada: {
    titulo: "Rodada completa — as cinco cadeias, na ordem em que dependem uma da outra",
    log: "pnigp-rodada.log",
    trava: { nome: "cadeia_rodada", toleranciaMin: 30 },
    aoFalhar: "seguir",
    env: {},
    passos: [
      { rotulo: "coleta PNCP e fontes devidas", cadeia: "coleta" },
      { rotulo: "consumidor de evento - itens", cadeia: "itens" },
      { rotulo: "enriquecimento do descritivo", cadeia: "enriquecimento" },
      { rotulo: "cadeia da marca e modelo", cadeia: "marca" },
      // o TCE vem por último porque lê itens_sc e contratos_sc já atualizados pelos dois primeiros
      { rotulo: "casamento TCE e fila", cadeia: "tce" },
    ],
  },

  // Cadeia de mentira, só para provar o motor sem tocar em dado: ordem, isolamento de ambiente, trava,
  // timeout, semântica de falha e código de saída. Use `roda.mjs teste` e `roda.mjs teste_falha`.
  teste: {
    titulo: "Cadeia sintética de verificação do runner",
    log: "pnigp-teste.log",
    trava: { nome: "cadeia_teste", toleranciaMin: 5 },
    aoFalhar: "parar",
    env: { CADEIA_BASE: "base-da-cadeia" },
    passos: [
      { rotulo: "diz quem sou e o que herdei", script: "scripts/passo_verificacao.mjs", env: { PASSO: "um" } },
      { rotulo: "confirma que o env do passo anterior NAO vazou", script: "scripts/passo_verificacao.mjs" },
    ],
  },

  teste_falha: {
    titulo: "Cadeia sintética que quebra no meio (prova o corte e o código de saída)",
    log: "pnigp-teste.log",
    trava: { nome: "cadeia_teste", toleranciaMin: 5 },
    aoFalhar: "parar",
    env: {},
    passos: [
      { rotulo: "passo que vai bem", script: "scripts/passo_verificacao.mjs", env: { PASSO: "ok" } },
      { rotulo: "passo que quebra", script: "scripts/passo_verificacao.mjs", env: { PASSO: "quebra", SAIR: "3" } },
      { rotulo: "passo que NAO pode rodar", script: "scripts/passo_verificacao.mjs", env: { PASSO: "jamais" } },
    ],
  },
};

export const nomes = () => Object.keys(CADEIAS);
export const ANO_REF = ANO;
