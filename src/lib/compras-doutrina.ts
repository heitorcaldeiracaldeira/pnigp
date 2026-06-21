// Base doutrinária de compras públicas (Lei 14.133/2021) — apoio metodológico ao planejamento das
// prefeituras. Atribuição por LINHA DE CONTRIBUIÇÃO conhecida de cada autor (não são citações literais).
// Exibição neutra e didática, sem juízo político.

export type Doutrinador = { nome: string; foco: string; obra?: string };

// Roll completo de doutrinadores, áreas de referência e obras principais em contratações públicas
export const DOUTRINADORES: Doutrinador[] = [
  { nome: "Marçal Justen Filho", foco: "Teoria geral da Lei 14.133; planejamento como pilar; custo × benefício da contratação", obra: "Comentários à Lei de Licitações e Contratações Administrativas (RT)" },
  { nome: "Jorge Ulisses Jacoby Fernandes", foco: "Sistema de Registro de Preços, dispensa e vedação ao fracionamento; sanções", obra: "Sistema de Registro de Preços e Pregão; Contratação direta sem licitação (Fórum)" },
  { nome: "Murilo Queiroz M. Jacoby Fernandes", foco: "Pregão, registro de preços e operacionalização prática da Nova Lei (Diretor INCP)", obra: "Contratação direta sem licitação na Lei 14.133 (Fórum, coautor)" },
  { nome: "Ronny Charles Lopes de Torres", foco: "Pesquisa de preços, planejamento, gestão de riscos e sustentabilidade (AGU)", obra: "Leis de Licitações Públicas Comentadas (Juspodivm)" },
  { nome: "Joel de Menezes Niebuhr", foco: "Princípios licitatórios, competitividade/isonomia e fase de seleção", obra: "Licitação Pública e Contrato Administrativo (Fórum)" },
  { nome: "Tatiana Camarão", foco: "Planejamento das contratações, Estudo Técnico Preliminar (ETP) e gestão de contratos", obra: "Comentários à Lei 14.133 (Fórum); estudos sobre ETP" },
  { nome: "Gabriela Verona Pércio", foco: "Gestão e fiscalização de contratos; governança das contratações (Presidente INCP)", obra: "Obras sobre gestão de contratos e contratação direta" },
  { nome: "Christianne de Carvalho Stroppa", foco: "Controle externo (TCU) e jurisprudência aplicada às contratações (PUC-SP)", obra: "O regime jurídico do controle nas contratações públicas" },
  { nome: "Viviane Mafissoni", foco: "Fase de seleção (pregoeira), procedimentos auxiliares e sanções (Diretora acad. INCP)", obra: "Artigos no Observatório da Nova Lei de Licitações; coautora de livros" },
  { nome: "Min. Benjamin Zymler", foco: "Controle externo, governança e gestão de riscos (jurisprudência TCU)", obra: "Obras sobre controle e direito das licitações" },
  { nome: "Min. Antônio Anastasia", foco: "Concepção da Lei 14.133 (relator no Senado); governança pública", obra: "Relatoria e estudos da Nova Lei de Licitações" },
  { nome: "Cristiane Nardes", foco: "Auditoria e governança das aquisições; instrução do processo (Pres. Rede Governança Brasil)", obra: "Coordenação de obras sobre governança pública (Fórum)" },
  { nome: "Thiago Guterres", foco: "Fase preparatória e panorama prático da Nova Lei", obra: "A Nova Lei de Licitações — panorama (e-book gratuito, UFSC)" },
];

// Biblioteca de materiais GRATUITOS e oficiais — apoio direto às prefeituras, agrupados por instituição
export type Material = { titulo: string; fonte: string; url: string; cat: string };
export const MATERIAIS_LIVRES: Material[] = [
  // TCU
  { cat: "TCU — controle federal", titulo: "Licitações e Contratos: Orientações e Jurisprudência (Manual, com PCA, ETP, pesquisa de preços)", fonte: "TCU", url: "https://licitacoesecontratos.tcu.gov.br/" },
  { cat: "TCU — controle federal", titulo: "Riscos e Controles nas Aquisições (RCA) — catálogo de riscos e controles", fonte: "TCU", url: "https://tcu.gov.br/arquivosrca/ManualOnLine.htm" },
  { cat: "TCU — controle federal", titulo: "Análise e gestão de riscos das contratações", fonte: "TCU", url: "https://licitacoesecontratos.tcu.gov.br/4-2-analise-de-riscos/" },
  // TCE-SC
  { cat: "TCE/SC — controle estadual (SC)", titulo: "Cartilha “Perguntas e Respostas: Licitações e Contratações” (Lei 14.133)", fonte: "TCE/SC", url: "https://www.tcesc.tc.br/tcesc-publica-cartilha-perguntas-e-respostas-licitacoes-e-contratacoes" },
  { cat: "TCE/SC — controle estadual (SC)", titulo: "Decisões e prejulgados que interpretam a Nova Lei (apoio ao gestor)", fonte: "TCE/SC", url: "https://www.tcesc.tc.br/decisoes-do-tcesc-auxiliam-gestores-publicos-interpretarem-melhor-nova-lei-de-licitacoes" },
  { cat: "TCE/SC — controle estadual (SC)", titulo: "Orientações sobre licitações a partir de dúvidas de gestores", fonte: "TCE/SC", url: "https://www.tcesc.tc.br/tcesc-elabora-documento-com-algumas-orientacoes-sobre-licitacoes-e-contratacoes-partir-de-duvidas" },
  // Ministério Público
  { cat: "Ministério Público", titulo: "MPSC — licitações, recomendações e atuação contra irregularidades", fonte: "MPSC", url: "https://www.mpsc.mp.br/" },
  { cat: "Ministério Público", titulo: "CNMP — contratações públicas e temas recorrentes (ex.: dispensas)", fonte: "CNMP", url: "https://www.cnmp.mp.br/portal/transparencia/prestacao-de-contas/licitacoes" },
  { cat: "Ministério Público", titulo: "MPU — legislação relacionada às contratações", fonte: "MPU", url: "https://www.mpu.mp.br/contratacoes/legislacao-relacionada" },
  // CGU — superfaturamento (base do sobrepreço)
  { cat: "CGU — integridade e preços", titulo: "Guia de Superfaturamento em Contratos de Bens e Serviços", fonte: "CGU", url: "https://repositorio.cgu.gov.br/bitstream/1/94699/1/Guia_Superfaturamento_Contratos_Bens_Servicos.pdf" },
  // Doutrina / guias gerais
  { cat: "Doutrina e guias gerais", titulo: "Manual de Boas Práticas em Contratações Públicas", fonte: "gov.br / Compras", url: "https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-governanca-nas-contratacoes/manual-de-boas-praticas-em-contratacoes-publicas.pdf" },
  { cat: "Doutrina e guias gerais", titulo: "Observatório da Nova Lei de Licitações (artigos dos doutrinadores)", fonte: "Observatório", url: "https://www.novaleilicitacao.com.br/" },
  { cat: "Doutrina e guias gerais", titulo: "A Nova Lei de Licitações — e-book gratuito", fonte: "Thiago Guterres / UFSC", url: "https://repositorio.ufsc.br/bitstream/handle/123456789/222330/ebook%20-%20a%20nova%20lei%20de%20licita%C3%A7%C3%B5es%20-%20thiago%20guterres.pdf?sequence=1" },
  { cat: "Doutrina e guias gerais", titulo: "Orientações para a implementação da Nova Lei (NLLCA)", fonte: "Ronny Charles", url: "https://ronnycharles.com.br/wp-content/uploads/2022/07/Orientacoes-para-a-implementacao-da-NLLCA.pdf" },
  { cat: "Doutrina e guias gerais", titulo: "Cartilha da Nova Lei de Licitações e Contratos", fonte: "TCE-SP", url: "https://www.tce.sp.gov.br/sites/default/files/publicacoes/cartilha_nova_lei_licitacoes_contratos.pdf" },
  { cat: "Doutrina e guias gerais", titulo: "Lei nº 14.133/2021 — texto oficial atualizado", fonte: "Planalto", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" },
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
