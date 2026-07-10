// NOTA TÉCNICA — Classificação de Itens (CATMAT/CATSER) e preço de referência do Banco de Preços.
// Nota pública e versionada da metodologia por trás da comparação de preços por item. Torna auditável a cadeia
// dado (PNCP) → taxonomia (CATMAT/CATSER, catálogo oficial) → técnica (linha do controle interno da União, "Alice").
// Espelha docs/nota-tecnica-classificacao-catmat.md. Retreinou/mudou fonte ou técnica → sobe a versão + data.

export const NOTA_CATMAT = {
  versao: "1.0",
  atualizada: "2026-07-09",
  titulo: "Banco de Preços & Classificação de Itens — Nota Técnica",
  resumo:
    "Para comparar preços é preciso garantir que se compara o MESMO produto — não a mesma palavra. Por isso cada item é classificado no catálogo oficial do Governo Federal (CATMAT/CATSER), usando a linha metodológica dos robôs de controle da União. As três bases são oficiais: o dado (PNCP), a taxonomia (CATMAT/CATSER) e a técnica (controle interno da União).",
  secoes: [
    {
      titulo: "Fonte do dado — PNCP (base basilar)",
      itens: [
        "Os itens de compra vêm do Portal Nacional de Contratações Públicas (PNCP), repositório oficial instituído pela Lei 14.133/2021 (Nova Lei de Licitações).",
        "De cada item extraímos descrição, quantidade, unidade, valor unitário estimado × homologado, fornecedor/CNPJ/porte — e o código CATMAT/CATSER quando o próprio ente o informa.",
        "Referência nacional de preço: Painel de Preços do Compras.gov.br, casado por CATMAT e por unidade de medida.",
      ],
    },
    {
      titulo: "Taxonomia — CATMAT e CATSER (catálogo oficial da União)",
      itens: [
        "CATMAT (Catálogo de Materiais) e CATSER (Catálogo de Serviços) compõem o Sistema de Catalogação do Governo Federal (Compras.gov.br) — a árvore oficial de classificação da Administração Pública.",
        "Classificamos cada item DENTRO dessa árvore (Grupo → Classe → PDM, Padrão Descritivo de Material). Não inventamos categorias próprias.",
        "Ganho: defensabilidade (taxonomia oficial da União) e escala nacional (a mesma chave compara SC × qualquer UF × a própria União, pois o catálogo é federal).",
      ],
    },
    {
      titulo: "Técnica — a linha do controle interno da União (“Alice”)",
      itens: [
        "“Alice” (Análise de Licitações e Editais) é o robô da Controladoria-Geral da União (CGU) — órgão de controle interno do Poder Executivo Federal — em parceria com o TCU, que analisa licitações por processamento de linguagem (NLP) para apoiar auditores.",
        "Essa geração de robôs do controle (Alice, Sofia, Mônica) usa NLP clássico: representação vetorial de texto (TF-IDF) + classificador linear — não modelos opacos. Adotamos a MESMA linha: TF-IDF (1-2gram) + SVM linear sobre a descrição do item.",
        "Por que esta técnica e não embeddings: para descrição CURTA de produto o baseline clássico empata ou supera; é reproduzível, explicável termo a termo e alinhado ao padrão do controle federal — logo, defensável perante auditoria (TCE/TCU).",
        "Ressalva honesta: replicamos a LINHA metodológica documentada da Alice, não o seu código. A validade vem da acurácia medida, não de um selo de equivalência.",
      ],
    },
    {
      titulo: "Como ler o preço de referência",
      itens: [
        "Preço de referência = MEDIANA (robusta a outliers, conforme a IN SEGES/ME 65/2021), sempre POR unidade de medida — pacote, unidade avulsa, quilograma são calculados separadamente (não misturamos unidades).",
        "“SC +X%” compara a mediana de SC × a referência nacional (Painel de Preços). É INDÍCIO, não acusação: a especificação do item pode diferir.",
        "“Como comprar”: convertemos toda embalagem ao preço por unidade (valor ÷ quantidade) e comparamos comprar avulso × comprar em escala — mostra a forma mais eficiente por unidade.",
      ],
    },
    {
      titulo: "Limitações declaradas",
      itens: [
        "O CATMAT muitas vezes vem vazio no PNCP — por isso a chave é INFERIDA pelo classificador, com confiança explícita, não fornecida pelo ente.",
        "Dentro de um mesmo PDM ainda cabem especificações distintas — logo, diferença de preço entre dois entes do mesmo PDM NÃO é automaticamente sobrepreço.",
        "A acurácia do classificador é medida e publicada (níveis PDM e Classe), não presumida; predições de baixa margem são sinalizadas, não escondidas.",
      ],
    },
  ],
  nota: "Metodologia sujeita a revisão versionada. Retreino do classificador, mudança de fonte, catálogo ou técnica geram nova versão registrada com data. Análise técnica e apartidária, a partir de bases públicas oficiais (PNCP, CATMAT/CATSER); não constitui manifestação de órgão de controle. Documento completo: docs/nota-tecnica-classificacao-catmat.md.",
};
