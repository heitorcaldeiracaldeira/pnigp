// NOTA TÉCNICA — Índice de Gestão Fiscal (a nota pública e versionada da metodologia do índice exibido no Placar).
// Fiel ao cálculo real em getRankingFiscalSC (queries.ts): 4 dimensões, peso igual, normalização por percentil entre
// os municípios de SC. Publicar a metodologia é o que transforma o índice de passivo (contestável) em ativo (auditável).
// Versionar: mudou peso/dimensão/normalização → sobe a versão + registra a data.

export const NOTA_INDICE = {
  versao: "1.0",
  atualizada: "2026-07-02",
  titulo: "Índice de Gestão Fiscal — Nota Técnica",
  resumo:
    "Índice comparativo (0–100) que posiciona o município entre os demais de Santa Catarina em quatro dimensões da gestão orçamentária. É uma medida RELATIVA (posição frente aos pares), não uma nota absoluta de aprovação ou reprovação.",
  secoes: [
    {
      titulo: "Fonte dos dados",
      itens: [
        "Demonstrativos fiscais oficiais do SICONFI (Relatório Resumido da Execução Orçamentária — RREO), consolidados na base financas_sc.",
        "Usa-se o último exercício disponível de cada município (pode variar entre municípios conforme a entrega ao SICONFI).",
        "Excluem-se linhas marcadas como inconsistentes na validação (campo `suspeito`) e o ente estadual — o índice é apenas MUNICIPAL (o Estado não entra no ranking nem no cálculo dos percentis).",
      ],
    },
    {
      titulo: "As quatro dimensões (peso igual — 25% cada)",
      itens: [
        "Autonomia = Receita Tributária ÷ Receita Total. Mede quanto o município arrecada do próprio esforço. Maior é melhor.",
        "Investimento = Investimento ÷ Despesa Total. Mede quanto do gasto vira obra/equipamento. Maior é melhor.",
        "Equilíbrio = Resultado Orçamentário ÷ Receita Total. Mede o superávit/déficit relativo. Maior é melhor.",
        "Pessoal = Despesa de Pessoal ÷ Receita Total. Mede o peso da folha. MENOR é melhor (dimensão invertida na normalização).",
      ],
    },
    {
      titulo: "Normalização e cálculo",
      itens: [
        "Cada dimensão é convertida em PERCENTIL (0 a 100) entre os municípios de SC: 100 = melhor posição no conjunto, 0 = pior. A dimensão Pessoal é invertida (menor gasto relativo → maior percentil).",
        "O percentil torna as quatro dimensões comparáveis apesar de escalas diferentes — cada uma vale por posição relativa, não por valor bruto.",
        "O Índice é a MÉDIA SIMPLES dos quatro percentis, de 0 a 100, com uma casa decimal. O ranking é a ordenação decrescente do índice.",
      ],
    },
    {
      titulo: "Como ler o número (o que ele diz e o que NÃO diz)",
      itens: [
        "DIZ: como o município se posiciona frente aos pares de SC nas quatro dimensões fiscais.",
        "NÃO diz cumprimento de mínimos legais: saúde (≥15%), educação (≥25%) e o limite de pessoal da LRF são medidos SEPARADAMENTE. Índice alto não atesta legalidade; índice baixo não atesta ilegalidade.",
        "É RELATIVO: se todos os municípios melhoram juntos, os percentis se mantêm. O índice mede posição no conjunto, não uma meta absoluta.",
      ],
    },
    {
      titulo: "Distinção do IEGM (TCE-SC) e a origem de cada índice",
      itens: [
        "Índice de Gestão Fiscal (este): calculado PELA PLATAFORMA a partir do SICONFI/RREO — 4 dimensões fiscais, base percentil. Metodologia própria (esta nota).",
        "IEGM — Índice de Efetividade da Gestão Municipal: índice OFICIAL do TCE-SC (7 dimensões, faixas A a C). A plataforma apenas EXIBE o valor oficial, ingerido do Instituto Rui Barbosa (iegm.irbcontas.org.br/dados_abertos) — não o recalcula. A metodologia do IEGM é do TCE-SC/IRB.",
        "São medidas diferentes e complementares — não se substituem. Uma é fiscal e comparativa (nossa); a outra é de efetividade da gestão e oficial (do controle externo).",
      ],
    },
    {
      titulo: "Limitações declaradas",
      itens: [
        "Depende da entrega e da qualidade do RREO no SICONFI — município omisso não entra no cálculo.",
        "O percentil é sensível ao conjunto: mudanças na base de municípios alteram as posições.",
        "Peso igual entre as quatro dimensões é uma ESCOLHA metodológica (não há consenso único). Alterá-la sobe a versão desta nota.",
        "É um recorte fiscal — não capta qualidade de serviço, resultado social ou conformidade legal, que têm indicadores próprios na plataforma.",
      ],
    },
  ],
  nota: "Metodologia sujeita a revisão versionada. Alterações de dimensão, peso, fonte ou normalização geram nova versão registrada com data. Análise técnica e apartidária, a partir de dados públicos oficiais; não constitui manifestação de órgão de controle.",
};
