// Base metodológica por área — marcos legais + biblioteca de materiais oficiais (órgãos de controle e
// normatizadores). Replica o modelo de Compras para os demais pilares. Exibição neutra e didática.

export type Marco = { titulo: string; desc: string };
export type MaterialRef = { titulo: string; fonte: string; url: string };
export type AreaConhecimento = { titulo: string; marcos: Marco[]; materiais: MaterialRef[] };

export const CONHECIMENTO: Record<string, AreaConhecimento> = {
  financas: {
    titulo: "Finanças e responsabilidade fiscal",
    marcos: [
      { titulo: "LRF — LC 101/2000", desc: "Limites de pessoal, dívida e regras de equilíbrio das contas públicas." },
      { titulo: "CF, arts. 163–169", desc: "Finanças públicas, orçamento e limites de despesa." },
      { titulo: "Mínimos constitucionais", desc: "Saúde 15% (LC 141) e Educação 25% (art. 212)." },
    ],
    materiais: [
      { titulo: "Manual de Demonstrativos Fiscais (MDF) — interpreta a LRF (RREO/RGF)", fonte: "STN", url: "https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-demonstrativos-fiscais-mdf" },
      { titulo: "Manual de Contabilidade Aplicada ao Setor Público (MCASP)", fonte: "STN", url: "https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais" },
      { titulo: "SICONFI — dados e prazos de contas (DCA, RREO, RGF)", fonte: "Tesouro Nacional", url: "https://siconfi.tesouro.gov.br/" },
      { titulo: "Lei de Responsabilidade Fiscal (texto oficial)", fonte: "Planalto", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm" },
    ],
  },
  saude: {
    titulo: "Saúde (SUS / Atenção Primária)",
    marcos: [
      { titulo: "LC 141/2012", desc: "Aplicação mínima de 15% das receitas em saúde (ASPS)." },
      { titulo: "PNAB", desc: "Política Nacional de Atenção Básica — organização da APS." },
      { titulo: "Cofinanciamento da APS", desc: "Previne Brasil (Port. 2.979/2019) → novo modelo (Port. GM/MS 3.493/2024)." },
    ],
    materiais: [
      { titulo: "Financiamento da Atenção Primária (gestor)", fonte: "Min. Saúde / SAPS", url: "https://aps.saude.gov.br/gestor/financiamento" },
      { titulo: "Previne Brasil — modelo de financiamento", fonte: "Min. Saúde", url: "https://www.gov.br/saude/pt-br/composicao/saps/previne-brasil/" },
      { titulo: "LC 141/2012 (mínimo em saúde)", fonte: "Planalto", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp141.htm" },
      { titulo: "CONASEMS — apoio aos municípios", fonte: "CONASEMS", url: "https://www.conasems.org.br/" },
    ],
  },
  educacao: {
    titulo: "Educação básica",
    marcos: [
      { titulo: "Art. 212 da CF", desc: "Aplicação mínima de 25% das receitas em manutenção e desenvolvimento do ensino (MDE)." },
      { titulo: "FUNDEB — Lei 14.113/2020", desc: "Art. 212-A; VAAF/VAAT/VAAR e complementação da União (23% até 2026)." },
      { titulo: "PNE e CAQ", desc: "Plano Nacional de Educação e Custo Aluno-Qualidade como referência." },
    ],
    materiais: [
      { titulo: "FUNDEB — legislação e manuais de orientação", fonte: "FNDE", url: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/financiamento/fundeb" },
      { titulo: "Lei 14.113/2020 (Novo FUNDEB)", fonte: "Planalto", url: "http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14113.htm" },
      { titulo: "Referências normativas do financiamento da educação", fonte: "MEC", url: "https://www.gov.br/mec/pt-br/financiamento-da-educacao-basica/RefernciasNormativas2024.pdf" },
      { titulo: "Indicadores e censo (IDEB, matrículas)", fonte: "INEP", url: "https://www.gov.br/inep/" },
    ],
  },
  previdencia: {
    titulo: "Previdência (RPPS)",
    marcos: [
      { titulo: "EC 103/2019", desc: "Reforma da Previdência — regras gerais aplicáveis aos RPPS subnacionais." },
      { titulo: "Portaria MTP 1.467/2022", desc: "Parâmetros e diretrizes de organização e funcionamento dos RPPS." },
      { titulo: "Equilíbrio financeiro e atuarial", desc: "Avaliação atuarial anual (atuário registrado no IBA); art. 40 CF." },
    ],
    materiais: [
      { titulo: "Regimes Próprios de Previdência Social (RPPS)", fonte: "Min. Previdência / SPREV", url: "https://www.gov.br/previdencia/pt-br/assuntos/rpps" },
      { titulo: "Portaria MTP 1.467/2022 (texto)", fonte: "Min. Previdência", url: "https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/portarias/portarias_todas/portaria-mtp-no-1-467-de-02-de-junho-de-2022.pdf" },
      { titulo: "Aplicação da EC 103/2019 aos RPPS", fonte: "Min. Previdência", url: "https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/aplicacao-da-emenda-constitucional-no-103-de-2019-aos-rpps" },
    ],
  },
  controle: {
    titulo: "Controle e governança",
    marcos: [
      { titulo: "Controle externo (CF)", desc: "Fiscalização pelos Tribunais de Contas; controle interno obrigatório." },
      { titulo: "Governança pública", desc: "Liderança, estratégia e controle como pilares da boa gestão." },
      { titulo: "IEGM (7 dimensões)", desc: "Avaliação da efetividade da gestão municipal (IRB / Rede Indicon)." },
    ],
    materiais: [
      { titulo: "Referencial Básico de Governança Organizacional (3ª ed.)", fonte: "TCU", url: "https://portal.tcu.gov.br/referencial-basico-de-governanca-organizacional.htm" },
      { titulo: "IEGM — Índice de Efetividade da Gestão Municipal", fonte: "IRB", url: "https://irbcontas.org.br/" },
      { titulo: "TCE/SC — orientações e jurisprudência", fonte: "TCE/SC", url: "https://www.tcesc.tc.br/" },
    ],
  },
};
