// Base metodológica por área — marcos legais + biblioteca de materiais oficiais (órgãos de controle e
// normatizadores). Replica o modelo de Compras para os demais pilares. Exibição neutra e didática.

export type Marco = { titulo: string; desc: string; url?: string };
export type MaterialRef = { titulo: string; fonte: string; url: string };
export type AutorRef = { nome: string; foco: string };
export type AreaConhecimento = { titulo: string; marcos: Marco[]; autores?: AutorRef[]; materiais: MaterialRef[] };

export const CONHECIMENTO: Record<string, AreaConhecimento> = {
  financas: {
    titulo: "Finanças e responsabilidade fiscal",
    marcos: [
      { titulo: "Constituição Federal de 1988", desc: "Orçamento público (arts. 165–169); fiscalização contábil e financeira (arts. 70–75); mínimo em saúde (art. 198); educação e FUNDEB (arts. 212 e 212-A); limite do Legislativo municipal (art. 29-A).", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" },
      { titulo: "Lei nº 4.320/1964", desc: "Normas gerais de direito financeiro; orçamentos e balanços (arts. 2º–8º); créditos adicionais (arts. 40–46); execução: empenho, liquidação e pagamento (arts. 58–70).", url: "https://www.planalto.gov.br/ccivil_03/leis/l4320.htm" },
      { titulo: "LRF — LC 101/2000", desc: "PPA, LDO e LOA (arts. 3º–5º); metas (arts. 8º–9º); despesa com pessoal (arts. 18–23); dívida e operações de crédito (arts. 29–40); transparência e RGF (arts. 48–55).", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm" },
      { titulo: "LC nº 178/2021", desc: "Regime de recuperação fiscal; altera a LRF; regra de redução de excesso de despesa de pessoal; apuração por competência (art. 18, §2º).", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp178.htm" },
      { titulo: "Resolução SF nº 40/2001", desc: "Limites globais da dívida consolidada (art. 30 da LRF): 200% da RCL para Estados e 120% para Municípios.", url: "https://www2.camara.leg.br/legin/fed/ressen/2001/resolucao-40-20-dezembro-2001-429320-normaatualizada-pl.html" },
      { titulo: "Resolução SF nº 43/2001", desc: "Operações de crédito, garantias e ARO (arts. 7º e 38 da LRF): montante 16%, comprometimento 11,5%, ARO 7%, garantias 22%/32% da RCL.", url: "https://www2.camara.leg.br/legin/fed/ressen/2001/resolucao-43-21-dezembro-2001-429342-norma-pl.html" },
      { titulo: "Portaria MOG nº 42/1999", desc: "Classificação da despesa por função e subfunção de governo (base do módulo de áreas-fim).", url: "https://www2.camara.leg.br/legin/fed/portmog/1999/portaria-42-14-abril-1999-552031-norma-pe.html" },
      { titulo: "Decreto-Lei nº 201/1967", desc: "Responsabilidade de prefeitos e vereadores; crimes de responsabilidade na gestão pública.", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del0201.htm" },
      { titulo: "Lei nº 10.028/2000", desc: "Crimes contra as finanças públicas (Lei de Crimes Fiscais); sanções por descumprir limites da LRF.", url: "https://www.planalto.gov.br/ccivil_03/leis/l10028.htm" },
      { titulo: "FPM/FPE — art. 159 CF + LC 62/1989", desc: "Fundos de Participação que distribuem parte do IR e do IPI a municípios e estados.", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp62.htm" },
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
      { titulo: "FNS — Lei 8.142/1990", desc: "Cria os fundos de saúde e o repasse fundo-a-fundo do SUS (FNS instituído pelo Decreto 64.867/1969)." },
      { titulo: "LC 141/2012", desc: "Aplicação mínima de 15% das receitas em saúde (ASPS)." },
      { titulo: "PNAB", desc: "Política Nacional de Atenção Básica — organização da APS." },
      { titulo: "Cofinanciamento da APS", desc: "Previne Brasil (Port. 2.979/2019) → novo modelo (Port. GM/MS 3.493/2024)." },
    ],
    autores: [
      { nome: "Lenir Santos", foco: "Direito sanitário e organização do SUS (fundadora/presidente do IDISA)" },
      { nome: "Sueli Gandolfi Dallari", foco: "Direito sanitário e saúde pública (USP)" },
      { nome: "Gilson Carvalho", foco: "Financiamento do SUS (idealizador da Domingueira da Saúde)" },
      { nome: "Áquilas Mendes", foco: "Economia e financiamento da saúde (USP)" },
      { nome: "Francisco Funcia", foco: "Financiamento do SUS e mínimos constitucionais" },
    ],
    materiais: [
      { titulo: "Financiamento da Atenção Primária (gestor)", fonte: "Min. Saúde / SAPS", url: "https://aps.saude.gov.br/gestor/financiamento" },
      { titulo: "Previne Brasil — modelo de financiamento", fonte: "Min. Saúde", url: "https://www.gov.br/saude/pt-br/composicao/saps/previne-brasil/" },
      { titulo: "LC 141/2012 (mínimo em saúde)", fonte: "Planalto", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp141.htm" },
      { titulo: "SIOPS — orçamentos públicos em saúde (acompanha o mínimo de 15%)", fonte: "DataSUS/MS", url: "https://www.gov.br/saude/pt-br/acesso-a-informacao/siops" },
      { titulo: "CONASEMS — apoio aos municípios", fonte: "CONASEMS", url: "https://www.conasems.org.br/" },
    ],
  },
  educacao: {
    titulo: "Educação básica",
    marcos: [
      { titulo: "Art. 212 da CF", desc: "Aplicação mínima de 25% das receitas em manutenção e desenvolvimento do ensino (MDE)." },
      { titulo: "FUNDEB — Lei 14.113/2020", desc: "Fundo permanente (EC 108/2020, art. 212-A); VAAF/VAAT/VAAR. Sucede o FUNDEF (Lei 9.424/1996) e o FUNDEB original (Lei 11.494/2007)." },
      { titulo: "IDEB — Decreto nº 6.094/2007", desc: "Cria o IDEB (art. 3º) como indicador objetivo de qualidade da educação básica, calculado pelo INEP a partir do Censo Escolar + SAEB.", url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6094.htm" },
      { titulo: "PNE — Lei nº 13.005/2014 (Meta 7)", desc: "Plano Nacional de Educação; a Meta 7 fixa as metas do IDEB por etapa de ensino.", url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l13005.htm" },
      { titulo: "CAQ — Custo Aluno-Qualidade", desc: "Padrão de referência de financiamento por aluno (PNE e art. 211 da CF)." },
      { titulo: "Acordo de Cooperação 7/2019 (SC)", desc: "TCE/SC + MPC + MPSC + Undime + Fecam + CEE/SC monitoram as metas dos Planos de Educação com base de dados comum." },
    ],
    autores: [
      { nome: "José Marcelino de Rezende Pinto", foco: "Financiamento da educação e Custo Aluno-Qualidade (USP)" },
      { nome: "Romualdo Portela de Oliveira", foco: "Financiamento da educação básica e federalismo (USP)" },
      { nome: "Nicholas Davies", foco: "FUNDEB e fiscalização dos recursos da educação (UFF)" },
      { nome: "FINEDUCA / Campanha Nacional pelo Direito à Educação", foco: "Rede de pesquisa em financiamento e CAQ" },
    ],
    materiais: [
      { titulo: "FUNDEB — legislação e manuais de orientação", fonte: "FNDE", url: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/financiamento/fundeb" },
      { titulo: "Lei 14.113/2020 (Novo FUNDEB)", fonte: "Planalto", url: "http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14113.htm" },
      { titulo: "Referências normativas do financiamento da educação", fonte: "MEC", url: "https://www.gov.br/mec/pt-br/financiamento-da-educacao-basica/RefernciasNormativas2024.pdf" },
      { titulo: "SIOPE — orçamentos públicos em educação (acompanha o mínimo de 25%)", fonte: "FNDE/MEC", url: "https://www.fnde.gov.br/siope/" },
      { titulo: "INEP — IDEB e indicadores educacionais", fonte: "INEP", url: "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb" },
      { titulo: "TCE/SC Educação — painéis das metas dos Planos de Educação (IDEB, infantil, integral)", fonte: "TCE/SC", url: "https://servicos.tcesc.tc.br/tceeducacao/" },
      { titulo: "Índice ICMS Educação / IQESC — qualidade das escolas de SC", fonte: "TCE/SC", url: "https://servicos.tcesc.tc.br/tceeducacao/#despesas" },
    ],
  },
  previdencia: {
    titulo: "Previdência (RPPS)",
    marcos: [
      { titulo: "RPPS — Lei 9.717/1998", desc: "Normas gerais dos regimes próprios; cada ente institui seu fundo previdenciário por lei municipal." },
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
      { titulo: "e-Sfinge — prestação de contas dos municípios de SC", fonte: "TCE/SC", url: "https://www.tcesc.tc.br/" },
    ],
  },
  assistencia: {
    titulo: "Assistência social (SUAS)",
    marcos: [
      { titulo: "FNAS / LOAS — Lei 8.742/1993", desc: "Lei Orgânica da Assistência Social cria o Fundo Nacional de Assistência Social (art. 28) e o BPC." },
      { titulo: "SUAS — Lei 12.435/2011", desc: "Institui o Sistema Único de Assistência Social na LOAS (cofinanciamento e gestão)." },
      { titulo: "Bolsa Família / CadÚnico — Lei 14.601/2023", desc: "Programa de transferência de renda; CadÚnico como porta de entrada da proteção social." },
    ],
    autores: [
      { nome: "Aldaíza Sposati", foco: "Construção do SUAS e da proteção social (PUC-SP / NEPSAS)" },
      { nome: "Maria Carmelita Yazbek", foco: "Assistência social e classes subalternas (PUC-SP)" },
      { nome: "Berenice Rojas Couto", foco: "Direito socioassistencial e SUAS (PUCRS)" },
    ],
    materiais: [
      { titulo: "Assistência social — programas e Censo SUAS", fonte: "MDS", url: "https://www.gov.br/mds/" },
      { titulo: "LOAS — Lei 8.742/1993 (texto oficial)", fonte: "Planalto", url: "https://www.planalto.gov.br/ccivil_03/leis/l8742.htm" },
      { titulo: "Conselho Nacional de Assistência Social (normas e resoluções)", fonte: "CNAS", url: "https://www.gov.br/mds/pt-br/orgaos-colegiados/conselho-nacional-de-assistencia-social-cnas" },
    ],
  },
};
