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
// COMO DIMENSIONAR A TOLERÂNCIA DA TRAVA — o erro é intuitivo e caro. Ela NÃO é a duração da cadeia: é quanto
// tempo se aceita sem BATIDA antes de concluir que o dono morreu. Como o runner é um processo só, vivo do
// primeiro ao último passo, ele bate de minuto em minuto mesmo numa cadeia de três horas — bastam poucos
// minutos de folga para um soluço do banco. Tolerância grande não protege nada e tem custo real: quando um
// processo morre de verdade (taskkill, máquina dormindo), a cadeia fica bloqueada por todo esse tempo. Foi o
// que aconteceu aqui em 05/ago com 60 min declarados: matei um teste e a execução seguinte saiu como PULADA.
// A exceção é a trava tomada pela linha de comando (scripts/trava.mjs) dentro de um .cmd: ali a batida só
// acontece entre passos, então a tolerância precisa cobrir o PASSO MAIS LONGO — é o caso do
// run_enriquecimento_diario.cmd, que segue com 45 min por isso.
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
    trava: { nome: "cadeia_enriquecimento", toleranciaMin: 10 },
    aoFalhar: "parar",
    env: {},
    // UM passo só, e não dois: o enriquece_paralelo.mjs JÁ chama constroiFila() antes de abrir os shards
    // (importa a função, não o script). Declarar a fila como passo separado faria a varredura duas vezes —
    // uma varredura inteira jogada fora por rodada. O passo é o lançador; os shards são filhos dele, um por
    // núcleo, em fatias disjuntas por hash.
    passos: [
      { rotulo: "reconstrói a fila e enriquece em paralelo", script: "scripts/enriquece_paralelo.mjs", env: { LIMIT: "0" }, timeoutMin: 180 },
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
    // debaixo do passo 6 da outra. A tolerância é de batida, não de duração — o runner bate a cada minuto
    // durante os ~8 min da cadeia; o que cobre o passo lento é o timeoutMin de cada passo, logo abaixo.
    trava: { nome: "cadeia_tce", toleranciaMin: 10 },
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

  // OS COLETORES DE PLATAFORMA vão à internet, e por isso esta cadeia existe: eles NÃO terminam numa corrida.
  // Medido em 06/ago/2026 ao religá-los: o coletor do PCP tem 19.729 processos na fila e parou sozinho no
  // nono, com "rate limit persistente" — porque busca o linkSistemaOrigem AO VIVO na API do PNCP, uma chamada
  // por processo, antes de qualquer download. O desenho deles já assume isso: são idempotentes e retomam de
  // onde pararam. O que faltava era alguém relançá-los espaçadamente, que é o que esta cadeia faz.
  //
  // SEGUE no primeiro erro, de propósito: os quatro são independentes — cada um fala com um host diferente —
  // e um rate limit no PCP não é razão para o e-lic não rodar. Esconder os três que funcionaram por causa de
  // um que bateu no teto é justamente o que a regra "aoFalhar: seguir" existe para evitar.
  //
  // CONC=1 no PCP e na BLL: os dois furaram o limite com concorrência 3. Aqui devagar não é desperdício —
  // é a única forma de avançar, porque a alternativa é parar no nono processo de 19.729.
  coletores: {
    titulo: "Coletores de plataforma — retomada espaçada (e-lic, PCP, BLL, Compras.gov)",
    log: "pnigp-coletores.log",
    trava: { nome: "cadeia_coletores", toleranciaMin: 10 },
    aoFalhar: "seguir",
    env: {},
    passos: [
      { rotulo: "e-lic (compras.sc)", script: "scripts/auditoria/coletor_estado_de_santa_catarina_e_lic.mjs",
        env: { LIMIT: "400" }, timeoutMin: 90 },
      { rotulo: "PCP", script: "scripts/auditoria/coletor_pcp.mjs",
        env: { LIMIT: "300", CONC: "1" }, timeoutMin: 90 },
      { rotulo: "BLL", script: "scripts/auditoria/coletor_bll.mjs",
        env: { LIMIT: "300", CONC: "1" }, timeoutMin: 60 },
      // NCAT é quantos CATMATs do catálogo se varre por execução; cada um é uma chamada à API. Em 300 a
      // execução inteira levou minutos e devolveu 318 registros, então 600 cabe folgado numa janela horária.
      { rotulo: "Compras.gov (banco de precos)", script: "scripts/auditoria/coletor_compras_gov.mjs",
        env: { NCAT: "600" }, timeoutMin: 60 },
    ],
  },

  // A RODADA COMPLETA é uma cadeia de cadeias: cada passo chama o runner de novo, no mesmo caminho que o
  // Agendador usa. Não para no primeiro erro porque as cinco são independentes o bastante e, numa rodada de
  // verificação, esconder as quatro que funcionaram por causa de uma que quebrou é pior do que seguir e dizer.
  rodada: {
    titulo: "Rodada completa — as cinco cadeias, na ordem em que dependem uma da outra",
    log: "pnigp-rodada.log",
    trava: { nome: "cadeia_rodada", toleranciaMin: 10 },
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
