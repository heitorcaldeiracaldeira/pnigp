// Catálogo de boas práticas de gestão municipal — ações comprovadas, ligadas a cada área/gargalo.
// Curado a partir de casos públicos (FNDE/PAR, Meu Município/OTIMIZA, TCE-SC, Undime, CONASEMS). Cresce com o tempo.
export type Pratica = { titulo: string; oque: string; impacto: string; base: string };

export const BOAS_PRATICAS: Record<string, { rotulo: string; praticas: Pratica[] }> = {
  receita: {
    rotulo: "Receita própria (IPTU/ISS/ITBI)",
    praticas: [
      { titulo: "Atualizar a Planta Genérica de Valores (PGV)", oque: "Recadastrar imóveis por georreferenciamento e atualizar a PGV por lei, corrigindo a defasagem do valor venal.", impacto: "Maior alavanca do IPTU — casos de +18% a triplicar a arrecadação (ex.: Paraty/RJ).", base: "CTN art. 33; jurisprudência STJ sobre PGV por lei" },
      { titulo: "Nota Fiscal de Serviços eletrônica (NFS-e) + fiscalização", oque: "Implantar a NFS-e nacional e cruzar com cadastros (construção civil, saúde, profissionais liberais) para reduzir sonegação de ISS.", impacto: "Aumento estrutural do ISS e base cadastral permanente.", base: "LC 116/2003; Convênio NFS-e nacional" },
      { titulo: "Valor venal de referência do ITBI + cartórios", oque: "Definir tabela de valor de referência e integrar com cartórios para coibir subavaliação na transmissão.", impacto: "Corrige a base do ITBI (tema 1.113/STJ — base é o valor de mercado).", base: "STJ Tema 1.113; CTN art. 38" },
      { titulo: "Dívida ativa: protesto e cobrança administrativa", oque: "Protestar CDAs em cartório e escalonar a cobrança antes da execução fiscal.", impacto: "Recupera receita parada com baixo custo (mais eficaz que só executar).", base: "Lei 9.492/97; Lei 6.830/80" },
    ],
  },
  educacao: {
    rotulo: "Educação (IDEB/aprendizagem)",
    praticas: [
      { titulo: "Plano de Ações Articuladas (PAR) bem feito", oque: "Diagnosticar no SIMEC/PAR e pleitear assistência técnica/financeira do FNDE casada com o gargalo (formação, infraestrutura, transporte).", impacto: "Acessa recurso federal direcionado ao problema real.", base: "MEC/FNDE — PAR; Lei 12.695/2012" },
      { titulo: "Foco na alfabetização na idade certa", oque: "Programa estruturado de alfabetização (material, formação e avaliação) nos Anos Iniciais.", impacto: "Maior elasticidade do IDEB-AI; base para todas as etapas seguintes.", base: "Compromisso Nacional Criança Alfabetizada" },
      { titulo: "Busca ativa escolar + registro no e-SUS/Educacenso", oque: "Reduzir evasão com busca ativa e garantir registro correto (muitos 'recuos' são subnotificação, não queda real).", impacto: "Sustenta matrícula e a fidedignidade dos indicadores.", base: "Undime/UNICEF — Busca Ativa Escolar" },
    ],
  },
  saude: {
    rotulo: "Saúde (APS/Previne)",
    praticas: [
      { titulo: "Qualificar os indicadores do Previne Brasil", oque: "Organizar pré-natal, citopatológico, vacinação e crônicos com busca ativa e registro no e-SUS — o Previne paga por desempenho.", impacto: "Cada indicador na meta aumenta o repasse federal da APS.", base: "Portaria GM/MS 3.493/2024 (Previne/cofinanciamento)" },
      { titulo: "Habilitar novas equipes (eSF/eAP/eMulti)", oque: "Pleitear habilitação de equipes e serviços (saúde bucal, eMulti) junto ao Ministério da Saúde via fundo a fundo.", impacto: "Amplia a base de custeio federal da atenção primária.", base: "Min. Saúde — credenciamento de equipes" },
    ],
  },
  compras: {
    rotulo: "Compras públicas",
    praticas: [
      { titulo: "Planejamento e PCA realista (Lei 14.133)", oque: "Consolidar o Plano de Contratações Anual e padronizar termos de referência por item (CATMAT/NCM).", impacto: "Reduz compras emergenciais e sobrepreço; melhora a competição.", base: "Lei 14.133/2021 — PCA; doutrina (Jacoby, Justen Filho)" },
      { titulo: "Pesquisa de preços por preço unitário", oque: "Comparar preço unitário por item (não por marca) com outros entes e atas vigentes antes de contratar.", impacto: "Identifica sobrepreço item a item e economiza.", base: "IN SEGES 65/2021; TCU" },
    ],
  },
  fiscal: {
    rotulo: "Gestão fiscal e regularidade",
    praticas: [
      { titulo: "Monitorar mínimos e limites antes do fechamento", oque: "Acompanhar saúde (15%), educação (25%) e pessoal (LRF) ao longo do ano, não só no encerramento.", impacto: "Evita rejeição de contas e suspensão de transferências.", base: "CF art. 198/212; LC 101/2000 (LRF)" },
      { titulo: "Manter CRP e CAUC em dia", oque: "Acompanhar a regularidade previdenciária (CRP) e fiscal (CAUC) que liberam convênios e crédito.", impacto: "Mantém o acesso a transferências voluntárias e financiamentos.", base: "Lei 9.717/98; CAUC/Tesouro" },
    ],
  },
};
