// Base doutrinária de compras públicas (Lei 14.133/2021) — apoio metodológico ao planejamento das
// prefeituras. Atribuição por LINHA DE CONTRIBUIÇÃO conhecida de cada autor (não são citações literais).
// Exibição neutra e didática, sem juízo político.

export type Doutrinador = { nome: string; foco: string };

// Roll completo de doutrinadores e suas áreas de referência em contratações públicas
export const DOUTRINADORES: Doutrinador[] = [
  { nome: "Marçal Justen Filho", foco: "Teoria geral da Lei 14.133; planejamento como pilar; custo × benefício da contratação" },
  { nome: "Jorge Ulisses Jacoby Fernandes", foco: "Sistema de Registro de Preços, dispensa e vedação ao fracionamento; sanções" },
  { nome: "Murilo Queiroz M. Jacoby Fernandes", foco: "Pregão, registro de preços e operacionalização prática da Nova Lei" },
  { nome: "Ronny Charles Lopes de Torres", foco: "Pesquisa de preços, planejamento, gestão de riscos e sustentabilidade (AGU)" },
  { nome: "Joel de Menezes Niebuhr", foco: "Princípios licitatórios, competitividade/isonomia e fase de seleção" },
  { nome: "Tatiana Camarão", foco: "Planejamento das contratações, Estudo Técnico Preliminar (ETP) e gestão de contratos" },
  { nome: "Gabriela Verona Pércio", foco: "Gestão e fiscalização de contratos; governança das contratações" },
  { nome: "Christianne de Carvalho Stroppa", foco: "Controle externo (TCU) e jurisprudência aplicada às contratações" },
  { nome: "Viviane Mafissoni", foco: "Atuação prática na fase de seleção (pregoeira) e operacionalização" },
  { nome: "Min. Benjamin Zymler", foco: "Controle externo, governança e gestão de riscos (jurisprudência TCU)" },
  { nome: "Min. Antônio Anastasia", foco: "Concepção da Lei 14.133 (relator no Senado); governança pública" },
  { nome: "Cristiane Nardes", foco: "Auditoria e governança das aquisições; instrução do processo" },
  { nome: "Thiago Guterres", foco: "Fase preparatória e jurisprudência prática da Nova Lei" },
];

export type FaseContratacao = { id: string; emoji: string; titulo: string; resumo: string; praticas: string[]; autores: string[] };

// Ciclo da contratação — as 4 fases, com boas práticas e os autores que ancoram cada uma
export const CICLO_COMPRAS: FaseContratacao[] = [
  {
    id: "planejar", emoji: "📐", titulo: "1. Planejar",
    resumo: "A boa compra nasce do planejamento — é o pilar da Lei 14.133. Antes de comprar, estude a necessidade, pesquise preços e mapeie riscos.",
    praticas: [
      "Plano de Contratações Anual (PCA, art. 12) — consolida o que será comprado no ano.",
      "Estudo Técnico Preliminar (ETP) — justifica a necessidade e a solução escolhida.",
      "Pesquisa de preços com método (ampla, documentada) para definir o valor de referência.",
      "Matriz de riscos do objeto e definição clara do que se quer.",
    ],
    autores: ["Marçal Justen Filho", "Tatiana Camarão", "Ronny Charles Lopes de Torres"],
  },
  {
    id: "selecionar", emoji: "⚖️", titulo: "2. Selecionar",
    resumo: "Escolha a via certa para cada objeto, com a maior competição possível — e nunca fracione a despesa para fugir da modalidade.",
    praticas: [
      "Modalidade adequada: pregão para bens e serviços comuns; concorrência para o resto.",
      "Registro de Preços (ata) para demanda recorrente ou incerta — escala sem comprar já.",
      "Evitar fracionamento: somar o mesmo objeto no ano para definir a via correta.",
      "Dispensa por valor só quando licitar custa mais que o benefício — com justificativa.",
    ],
    autores: ["Joel de Menezes Niebuhr", "Jorge Ulisses Jacoby Fernandes", "Murilo Queiroz M. Jacoby Fernandes", "Viviane Mafissoni"],
  },
  {
    id: "gerir", emoji: "🤝", titulo: "3. Gerir o contrato",
    resumo: "Assinar não é o fim. Designe gestor/fiscal, acompanhe a execução e documente — é onde o valor (ou o prejuízo) acontece.",
    praticas: [
      "Designar fiscal e gestor do contrato com atribuições claras.",
      "Fiscalização da execução: prazos, qualidade e aderência ao contratado.",
      "Gestão de riscos e de alterações contratuais (aditivos justificados).",
      "Liquidação e pagamento conforme a entrega efetiva.",
    ],
    autores: ["Gabriela Verona Pércio", "Tatiana Camarão"],
  },
  {
    id: "controlar", emoji: "🛡️", titulo: "4. Controlar e governar",
    resumo: "Governança e transparência protegem o gestor. Estruture controle interno e acompanhe a jurisprudência dos Tribunais de Contas.",
    praticas: [
      "Governança das contratações (art. 11, §ún.): linhas de defesa e controle interno.",
      "Transparência ativa no PNCP — publicidade de todas as fases.",
      "Atenção à jurisprudência do TCU/TCE para reduzir risco de glosa.",
      "Trilhas de auditoria: processo instruído e rastreável.",
    ],
    autores: ["Min. Benjamin Zymler", "Min. Antônio Anastasia", "Christianne de Carvalho Stroppa", "Cristiane Nardes", "Thiago Guterres"],
  },
];
