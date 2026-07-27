// Camada de APROFUNDAMENTO do módulo "Custo da Merenda Escolar".
//
// O núcleo do módulo (getMerendaSC em queries.ts) calcula sozinho das tabelas
// nacionais `_sc` e replica para todo município. Esta camada guarda o estudo
// PROFUNDO — anatomia do contrato terceirizado, equipe nominal e cadeia de
// execução — que exige garimpo local (e-Pública + WBC + Farol TCE) e por isso
// NÃO sai das bases nacionais. Entra por município, chaveado por cod_ibge.
//
// Fontes por município estão em cada registro (proveniência). Para adicionar um
// novo município, basta acrescentar uma entrada em MERENDA_CURADO — o componente
// e a query não mudam.

export type TrienteAno = {
  ano: string;
  pnae: number; // União — PNAE/FNDE (carimbado p/ alimentação)
  salarioEducacao: number; // União — Salário-Educação (destinado ao ensino)
  proprio: number; // Município — impostos-educação (residual)
  total: number;
  pctProprio: number;
};

// Visão bipartite (União PNAE × Município) — para municípios onde só se tem a
// execução da subfunção Alimentação (ex.: portal Betha), sem o split Salário-Educação.
export type ExecucaoMerenda = {
  ano: string;
  total: number; // empenhado na subfunção Alimentação
  pago: number;
  orcado: number;
  pnae: number; // União — PNAE recebido no ano
  residual: number; // total − pnae
  pctProprio: number;
  nota?: string;
};

export type PostoContrato = { nome: string; qtd: number; salario: number; custo: number; fator: number };

export type CamadaCusto = { titulo: string; valor: number; unidade: string; desc: string; regra: string; cor: string };

export type CategoriaPortfolio = { categoria: string; processos: number; valor: number };

export type ContratoCadeia = {
  licitacao: string;
  contrato: string;
  fornecedor: string;
  natureza: string;
  empenhado: number;
  pago: number;
};

export type Rota = { rota: string; escolas: number; cozinheiras: number; alunos: number };

export type Refeicao = { segmento: string; matriculas: number; refPorDia: number; total: number };

export type Servidor = { nome: string; papel: string; cargo: string; bruto: number; tag?: string };

export type HoraTransacao = { servidor: string; atividade: string; horas: number; valorHora: number; custo: number };

// Aprofundamento por município — TOLERANTE A PARCIAL: cada município preenche só
// as seções que o garimpo local rendeu. O componente renderiza o que existe.
// Floripa = completo (garimpo e-Pública + planilha SEPAT); Jaraguá = só execução
// da subfunção (portal Betha), sem anatomia do contrato.
export type MerendaCurado = {
  nome: string;
  competencia: string;
  janela: string; // ex.: "2024–2026 (até jul)"
  fonte: string; // sistema de origem do garimpo (e-Pública, Betha…)
  // destaque editorial opcional (ex.: agricultura familiar acima da lei)
  destaque?: { titulo: string; texto: string };
  // financiamento tri-ente completo (3 fontes) — quando disponível
  triente?: TrienteAno[];
  // execução da subfunção Alimentação (União PNAE × Município) — visão bipartite
  execucao?: ExecucaoMerenda[];
  // folha própria das merendeiras (quando o município NÃO terceiriza) — Farol TCE.
  // A FONTE (quem paga) é provada pela lotação no Farol TCE — ver
  // [[pnigp-folha-fonte-lotacao-fundeb]] e [[feedback-quem-paga-prova-pela-fonte]].
  folhaPropria?: {
    competencia: string;
    servidores: number;
    brutoMes: number;
    // quem paga a folha — cada fonte vem da lotação (carimbada = fonte declarada)
    fontes?: { fonte: string; servidores: number; bruto: number; carimbada: boolean }[];
    // vínculo (efetivo × temporário) — opcional; nem todo garimpo rende
    cargos?: { cargo: string; n: number; bruto: number }[];
    vinculoNota?: string;
    nota?: string;
  };
  // anatomia do contrato terceirizado
  contrato?: {
    fornecedor: string;
    licitacao: string;
    postos: number;
    mensal: number;
    deslocamento: number;
    salarioPct: number;
    encargosPct: number;
    restoPct: number;
    postosDetalhe: PostoContrato[];
  };
  // licitações/compras de merenda (PNCP) — visão simples por processo
  processos?: { ano: string; modalidade: string; objeto: string; valor: number }[];
  fornecedores?: { nome: string; valor: number; tipo: string }[];
  camadas?: CamadaCusto[];
  portfolio?: CategoriaPortfolio[];
  generosPorAno?: { ano: string; empenhado: number; investimento: number }[];
  cadeia?: ContratoCadeia[];
  cadeiaTotal?: { contratos: number; empenhado: number; pago: number };
  escolas?: { total: number; alunos: number; comCozinha: number; nutricionistas: number; rotas: number };
  rotas?: Rota[];
  refeicoes?: { total: number; porCozinheira: number; detalhe: Refeicao[] };
  depae?: { servidores: Servidor[]; total: number };
  processo?: { servidores: Servidor[]; total: number };
  transacao?: { horas: number; custo: number; detalhe: HoraTransacao[]; encargos: number };
  fontes: string[];
};

const FLORIANOPOLIS: MerendaCurado = {
  nome: "Florianópolis",
  competencia: "empenhado 2024–2026 (até jul) · valores auditáveis",
  janela: "2024–2026 (até jul)",
  fonte: "e-Pública + PNCP + Farol TCE-SC + Planilha de Custos SEPAT",
  triente: [
    { ano: "2024", pnae: 7.93e6, salarioEducacao: 13.55e6, proprio: 57.92e6, total: 79.4e6, pctProprio: 73 },
    { ano: "2025", pnae: 10.23e6, salarioEducacao: 17.42e6, proprio: 49.07e6, total: 76.72e6, pctProprio: 64 },
    { ano: "2026 (até jul)", pnae: 3.95e6, salarioEducacao: 9.44e6, proprio: 33.26e6, total: 46.65e6, pctProprio: 71 },
  ],
  contrato: {
    fornecedor: "SEPAT - MULTI SERVICE EIRELI",
    licitacao: "PE 196/2025 (contrato 537/SME/2025)",
    postos: 550,
    mensal: 2638888.38,
    deslocamento: 20045.89,
    salarioPct: 34,
    encargosPct: 39,
    restoPct: 27,
    postosDetalhe: [
      { nome: "Cozinheira 40h", qtd: 170, salario: 1752.4, custo: 5195.94, fator: 2.97 },
      { nome: "Cozinheira 30h", qtd: 363, salario: 1433.78, custo: 4382.34, fator: 3.06 },
      { nome: "Nutricionista 40h", qtd: 17, salario: 4747.05, custo: 9693.48, fator: 2.04 },
    ],
  },
  camadas: [
    { titulo: "1. Execução (terceirizada)", valor: 2638888, unidade: "/mês", desc: "550 postos.", regra: "entra INTEGRAL", cor: "teal" },
    { titulo: "2. Gestão (DEPAE)", valor: 61639, unidade: "/mês", desc: "8 servidores estatutários, 100% merenda.", regra: "entra INTEGRAL", cor: "blue" },
    { titulo: "3. Transação (licitação)", valor: 7200, unidade: "/proc", desc: "Pregoeiro, jurídico, ordenadora — compartilhado com toda a cidade.", regra: "só a FRAÇÃO-hora", cor: "amber" },
  ],
  portfolio: [
    { categoria: "Mão de obra", processos: 3, valor: 106.4e6 },
    { categoria: "Pães", processos: 3, valor: 20.46e6 },
    { categoria: "Gêneros", processos: 7, valor: 20.38e6 },
    { categoria: "Hortifruti", processos: 2, valor: 17.69e6 },
    { categoria: "Carnes / proteicos", processos: 2, valor: 14.53e6 },
    { categoria: "Secos", processos: 6, valor: 7.4e6 },
    { categoria: "Lácteos", processos: 2, valor: 4.83e6 },
  ],
  generosPorAno: [
    { ano: "2024", empenhado: 27.82e6, investimento: 0 },
    { ano: "2025", empenhado: 33.25e6, investimento: 0 },
    { ano: "2026 (até jul)", empenhado: 14.97e6, investimento: 0 },
  ],
  cadeia: [
    { licitacao: "CC899/2018", contrato: "598/SME/2019", fornecedor: "SEPAT - MULTI SERVICE EIRELI", natureza: "Mão de obra, Despesas de Exercícios Anteriores", empenhado: 66016602, pago: 62112859 },
    { licitacao: "PE 196/2025", contrato: "537/SME/2025", fornecedor: "SEPAT - MULTI SERVICE EIRELI", natureza: "Mão de obra", empenhado: 27285634, pago: 14579863 },
    { licitacao: "PE283/2024", contrato: "(sem contrato)", fornecedor: "SAFI COMERCIO ATACADISTA EIRELI", natureza: "Gêneros", empenhado: 14607044, pago: 13894561 },
    { licitacao: "PE252/2023", contrato: "(sem contrato)", fornecedor: "BRUTHAN COMERCIAL LTDA.", natureza: "Gêneros", empenhado: 14296065, pago: 15076101 },
    { licitacao: "DL238/2025", contrato: "400/SME/2025", fornecedor: "SEPAT - MULTI SERVICE EIRELI", natureza: "Mão de obra (dispensa emergencial)", empenhado: 13100989, pago: 5933871 },
    { licitacao: "PE162/2024", contrato: "(sem contrato)", fornecedor: "EDIGA COMERCIO E REPRESENTAÇÕES LTDA.", natureza: "Gêneros", empenhado: 10454027, pago: 9796322 },
    { licitacao: "IL276/2025", contrato: "509/SME/2025", fornecedor: "COOP. AGRIC. FAM. DE RIO FORTUNA", natureza: "Gêneros (agricultura familiar)", empenhado: 4326513, pago: 2218729 },
    { licitacao: "PE169/2023", contrato: "(sem contrato)", fornecedor: "GNB COMERCIO ATACADISTA LTDA", natureza: "Gêneros", empenhado: 4200037, pago: 4162070 },
  ],
  cadeiaTotal: { contratos: 70, empenhado: 191843770, pago: 158363061 },
  escolas: { total: 130, alunos: 37481, comCozinha: 130, nutricionistas: 17, rotas: 14 },
  rotas: [
    { rota: "NORTE 1", escolas: 9, cozinheiras: 32, alunos: 2518 },
    { rota: "NORTE 2", escolas: 8, cozinheiras: 48, alunos: 4494 },
    { rota: "NORTE 3", escolas: 8, cozinheiras: 47, alunos: 4730 },
    { rota: "NORTE 4", escolas: 9, cozinheiras: 38, alunos: 4415 },
    { rota: "OESTE", escolas: 9, cozinheiras: 33, alunos: 2273 },
    { rota: "LESTE", escolas: 9, cozinheiras: 24, alunos: 1633 },
    { rota: "CENTRO/SUL", escolas: 9, cozinheiras: 34, alunos: 1883 },
    { rota: "CENTRO 1", escolas: 9, cozinheiras: 34, alunos: 1799 },
    { rota: "CENTRO 2", escolas: 7, cozinheiras: 30, alunos: 1052 },
    { rota: "CENTRO 3", escolas: 6, cozinheiras: 23, alunos: 1397 },
    { rota: "SUL 1", escolas: 9, cozinheiras: 34, alunos: 2259 },
    { rota: "SUL 2", escolas: 10, cozinheiras: 35, alunos: 3005 },
    { rota: "CONTINENTE 1", escolas: 8, cozinheiras: 33, alunos: 1489 },
    { rota: "CONTINENTE 2", escolas: 9, cozinheiras: 35, alunos: 1798 },
  ],
  refeicoes: {
    total: 73288,
    porCozinheira: 138,
    detalhe: [
      { segmento: "Tempo integral — creche+pré+fund", matriculas: 10466, refPorDia: 4, total: 41864 },
      { segmento: "Creche parcial", matriculas: 4409, refPorDia: 2, total: 8818 },
      { segmento: "Pré-escola parcial", matriculas: 4453, refPorDia: 1, total: 4453 },
      { segmento: "Fundamental parcial", matriculas: 17256, refPorDia: 1, total: 17256 },
      { segmento: "EJA", matriculas: 897, refPorDia: 1, total: 897 },
    ],
  },
  depae: {
    total: 61326.68,
    servidores: [
      { nome: "Carla Cristina Britto", papel: "Coordenadora do DEPAE", cargo: "Professor", bruto: 17827.23, tag: "assinou TR + ETP" },
      { nome: "Lidiamara Dornelles de Souza", papel: "Nutricionista — Resp. Técnica", cargo: "Nutricionista", bruto: 9479.46, tag: "assinou TR + ETP" },
      { nome: "Renata Brodbeck Faust", papel: "Nutricionista", cargo: "Nutricionista", bruto: 8300.41, tag: "assinou TR + ETP" },
      { nome: "Raquel Erdmann", papel: "Nutricionista", cargo: "Nutricionista", bruto: 6385.04 },
      { nome: "Gisele Liliam D'Avila", papel: "Nutricionista", cargo: "Nutricionista", bruto: 5688.07 },
      { nome: "Daniele Hack Alves Coelho", papel: "Administrativo", cargo: "Auxiliar de Sala", bruto: 4571.44 },
      { nome: "Graziela Ladwig de Souza", papel: "Administrativo", cargo: "Auxiliar de Sala", bruto: 4624.37 },
      { nome: "Heloisa Helena Braga de Oliveira", papel: "Administrativo", cargo: "Auxiliar de Sala", bruto: 4450.66 },
    ],
  },
  processo: {
    total: 117196.84,
    servidores: [
      { nome: "Thiago M. P. da Silveira", papel: "Secretário de Educação — demandante / gestor", cargo: "Secretário Municipal", bruto: 23544.23, tag: "assinou DFD" },
      { nome: "Katherine Schreiner", papel: "Ordenadora de despesa — Sec. de Licitações", cargo: "Secretário Municipal", bruto: 23544.23, tag: "homologou" },
      { nome: "Rodrigo Buenavides Rodrigues", papel: "Pregoeiro", cargo: "Administrador", bruto: 18325.25, tag: "conduziu a disputa" },
      { nome: "Jauna Medianeira Argenta", papel: "Equipe de apoio", cargo: "Administrador", bruto: 18297.77 },
      { nome: "Sidnei Silva", papel: "Equipe de apoio", cargo: "Contínuo", bruto: 13851.89 },
      { nome: "Edgard Pinto Junior", papel: "Parecer jurídico", cargo: "Assessor Técnico", bruto: 7876.88 },
      { nome: "Alexandre Farias Luz", papel: "Responsável jurídico", cargo: "Assessor Técnico", bruto: 6358.88 },
      { nome: "Marcia C. de Araujo Gomes", papel: "Chefia", cargo: "Auxiliar de Sala", bruto: 5397.71, tag: "assinou TR + ETP" },
    ],
  },
  transacao: {
    horas: 99,
    custo: 11096.75,
    encargos: 3170.5,
    detalhe: [
      { servidor: "Katherine Schreiner", atividade: "Ordenação de despesa / controle de legalidade", horas: 13.2, valorHora: 117.72, custo: 1553.92 },
      { servidor: "Rodrigo Buenavides Rodrigues", atividade: "Condução do pregão (sessão + análise)", horas: 33.0, valorHora: 91.63, custo: 3023.67 },
      { servidor: "Jauna Medianeira Argenta", atividade: "Apoio ao pregão", horas: 16.5, valorHora: 91.49, custo: 1509.57 },
      { servidor: "Sidnei Silva", atividade: "Apoio ao pregão", horas: 16.5, valorHora: 69.26, custo: 1142.78 },
      { servidor: "Alexandre Farias Luz", atividade: "Análise jurídica", horas: 11.0, valorHora: 31.79, custo: 349.74 },
      { servidor: "Edgard Pinto Junior", atividade: "Parecer jurídico", horas: 8.8, valorHora: 39.38, custo: 346.58 },
    ],
  },
  fontes: [
    "e-Pública (Público Tecnologia) — execução orçamentária (empenho/liquidação/pagamento, dotação, fonte)",
    "PNCP — planejamento (edital, TR, ETP, DFD) e assinaturas digitais",
    "WBC / Paradigma — Ata da sessão do pregão (pregoeiro e equipe de apoio)",
    "Farol TCE-SC (e-Sfinge) — folha de pessoal nominal",
    "Censo Escolar INEP 2024 — rede física (escolas, matrículas, cozinha)",
    "Planilha de Custos da vencedora (SEPAT, PE 196/2025) — anatomia do custo por posto",
    "FNDE (Resolução CD/FNDE) — pesos do PNAE por grupo",
  ],
};

// Jaraguá do Sul — garimpo do portal Betha (transparencia.betha.cloud, dados
// abertos "Despesas Orçadas × Executadas"). Aprofundamento PARCIAL: temos a
// execução da subfunção Alimentação, mas não a anatomia do contrato (a planilha
// da proposta vive no PNCP/edital, fora do portal de transparência) nem a folha
// da equipe (Farol TCE — próximo passo). Cozinheiras podem ser servidoras
// próprias (folha), então este valor é a subfunção Alimentação, não o custo total.
const JARAGUA_DO_SUL: MerendaCurado = {
  nome: "Jaraguá do Sul",
  competencia: "execução da subfunção Alimentação · 2024–2025",
  janela: "2024–2025",
  fonte: "Betha (transparencia.betha.cloud) — dados abertos",
  destaque: {
    titulo: "Referência nacional em agricultura familiar",
    texto:
      "Jaraguá do Sul compra 68,8% da merenda da agricultura familiar (2022) — mais do que o DOBRO do mínimo legal de 30% (Lei 11.947/2009) e muito acima de Florianópolis (34,6%). É um caso de excelência: o recurso do PNAE volta para o pequeno produtor local.",
  },
  execucao: [
    {
      ano: "2024",
      total: 12690811,
      pago: 9695932,
      orcado: 13285084,
      pnae: 3286996,
      residual: 9403815,
      pctProprio: 74,
    },
    {
      ano: "2025",
      total: 12476164.49,
      pago: 7922610.87,
      orcado: 14657363.92,
      pnae: 3390136,
      residual: 9086028.49,
      pctProprio: 73,
      nota:
        "Subfunção Alimentação da Secretaria de Educação (Ensino Fundamental + Educação Infantil), empenhado por competência — essencialmente GÊNEROS (comida). A mão de obra NÃO está aqui: Jaraguá tem quadro próprio de merendeiras (ver folha abaixo), diferente de Floripa que terceiriza. Custo total da merenda ≈ gêneros (R$12,48mi) + folha própria escolar (~R$16,8mi) ≈ R$29,3mi/ano.",
    },
  ],
  folhaPropria: {
    competencia: "nov/2025 (Farol TCE-SC · e-Sfinge)",
    servidores: 358,
    brutoMes: 1261226,
    // QUEM PAGA — provado pela lotação (a lotação no Farol encoda a fonte de recurso).
    // FUNDEB e Próprios reconfirmados idênticos em duas leituras independentes.
    fontes: [
      { fonte: "FUNDEB 70% (Ens. Fundamental + Ed. Infantil)", servidores: 225, bruto: 836105, carimbada: true },
      { fonte: "Recursos Próprios (educação)", servidores: 59, bruto: 204105, carimbada: true },
      { fonte: "Sem lotação definida (fonte não declarada)", servidores: 74, bruto: 221016, carimbada: false },
    ],
    vinculoNota:
      "~69% do quadro é REDA (contrato temporário via processo seletivo, Edital 006/2025) e ~31% efetivo — mais o cargo de Merendeira em extinção. O vínculo temporário domina.",
    nota:
      "Quadro ESCOLAR (excluída a Assistência Social — cozinha de CRAS/CREAS não é merenda escolar). Bruto mensal (rubricas positivas); anualizado ×13,33 (c/ 13º) ≈ R$16,8 mi/ano; com encargos patronais (~25%), ~R$21 mi. Diferente de Florianópolis, que terceiriza a mão de obra (contrato SEPAT).",
  },
  processos: [
    { ano: "2026", modalidade: "Credenciamento", objeto: "Gêneros da agricultura familiar (chamada pública)", valor: 8013518 },
    { ano: "2025", modalidade: "Dispensa", objeto: "Gêneros da agricultura familiar", valor: 7399731 },
    { ano: "2025", modalidade: "Pregão Eletrônico", objeto: "Gêneros alimentícios para as escolas", valor: 4098491 },
    { ano: "2025", modalidade: "Pregão Eletrônico", objeto: "Gêneros alimentícios", valor: 3847426 },
    { ano: "2025", modalidade: "Pregão (SRP)", objeto: "Registro de preços — gêneros", valor: 1251020 },
    { ano: "2026", modalidade: "Pregão Eletrônico", objeto: "Gêneros alimentícios", valor: 1174169 },
  ],
  fornecedores: [
    { nome: "Cooperativa de Prod. Agropecuária", valor: 1997403, tipo: "Agricultura familiar" },
    { nome: "Supermercado Portal Ltda", valor: 1580140, tipo: "Gêneros" },
    { nome: "Coop. de Pequenos Agricultores", valor: 1381311, tipo: "Agricultura familiar" },
    { nome: "Dialta Distribuidora de Alimentos", valor: 1159496, tipo: "Gêneros" },
    { nome: "Coop. Central Sabor Colonial", valor: 1139481, tipo: "Agricultura familiar" },
    { nome: "Coop. dos Agricultores Rurais", valor: 1091263, tipo: "Agricultura familiar" },
  ],
  processo: {
    total: 265353,
    servidores: [
      { nome: "Edson Ivo Tiedt", papel: "Diretor de Compras, Licitações e Contratos", cargo: "Diretor (CC-2)", bruto: 24163 },
      { nome: "Karine Kath Jochem Schmitt", papel: "Gerente de Contratos", cargo: "Gerente (CC-3)", bruto: 14744 },
      { nome: "Mariane Sueli Correa Schalinski", papel: "Coordenadora de Compras e Licitações", cargo: "Coordenador", bruto: 14064 },
      { nome: "Camila Souza da Rosa", papel: "Gerente de Licitações", cargo: "Gerente (CC-3)", bruto: 10872 },
      { nome: "Lucimara Gabardo Tarachucky", papel: "Chefe de Licitações", cargo: "Chefe (CC-4)", bruto: 10663 },
      { nome: "Matheus Felipe Vilas Boas", papel: "Chefe de Compras", cargo: "Chefe (CC-4)", bruto: 10311 },
      { nome: "Tatiana Luiza Machado", papel: "Chefe de Contratos e Judicializações", cargo: "Chefe (CC-4)", bruto: 9006 },
      { nome: "Andressa Heloisa Ignacio", papel: "Analista de Compras e Licitações", cargo: "Analista", bruto: 8641 },
    ],
  },
  fontes: [
    "Betha — Portal da Transparência (transparencia.betha.cloud) · dados abertos Contabilidade: Despesas Orçadas × Executadas 2025",
    "FNDE/SIMAD — PNAE recebido (repasse federal)",
    "PNAE agricultura familiar (FNDE) — % da merenda comprada da agricultura familiar",
    "Cardápio da rede: jaraguadosul.sc.gov.br/educacao/cardapio",
  ],
};

// Mapa por código IBGE. Adicionar novos municípios aqui conforme o garimpo local
// for feito — o componente e a query não mudam.
export const MERENDA_CURADO: Record<string, MerendaCurado> = {
  "4205407": FLORIANOPOLIS,
  "4208906": JARAGUA_DO_SUL,
};

export function merendaCurado(codIbge: string): MerendaCurado | null {
  return MERENDA_CURADO[codIbge] ?? null;
}
