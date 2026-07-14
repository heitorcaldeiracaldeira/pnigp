# Relatório de Status — Base de Inteligência de Compras Públicas

**Projeto:** PNIGP — Compras Públicas de Santa Catarina
**Data:** 13/07/2026
**Fonte oficial:** Portal Nacional de Contratações Públicas (PNCP)

---

## 1. Resumo executivo

Concluímos o **mapeamento completo dos processos licitatórios de Santa Catarina** publicados no PNCP: **241.302
processos**, de **todos os 1.324 órgãos públicos do estado**, em **todas as modalidades**, de 2021 a 2026. É a base
consolidada que nenhum órgão de controle do estado tinha reunido em um só lugar.

A camada de detalhe (item a item) e de **marca/modelo** está em ingestão, com conclusão prevista para **sexta-feira**.

---

## 2. O que já está pronto — entregue e confiável

| Entrega | Situação |
|---|---|
| **241.302 processos** (modalidade, plataforma, valores, datas) | ✅ 100% completo |
| Distribuição por modalidade, órgão, plataforma e ano | ✅ pronto |
| **Banco de preços por unidade básica** (comparável entre embalagens) | ✅ 4.787 grupos de referência |
| **Alerta de unidade trocada** (erro de lançamento) | ✅ 1.478 apontamentos |
| Classificação de itens no catálogo oficial (CATMAT) | ✅ motor validado |

**Achados que já dão para apresentar:**
- **49% das compras (R$ 90,6 bi) são por Dispensa** — compra direta, sem disputa competitiva. É o denominador que o
  controle externo raramente enxerga consolidado.
- **Economia real: 6,4%** em contrato direto × **26,4%** em registro de preço (ata) — separar os dois evita
  superestimar a economia (misturado, aparenta ~9,5%).
- **Duas plataformas concentram 62%** das publicações (Betha e IPM), o que permite ler marca e lances por formato.

---

## 3. Por que a base é confiável

A base **espelha fielmente a estrutura oficial do PNCP** (Contratação → Itens → Resultados → Atas → Contratos),
ligada pela chave oficial `numeroControlePNCP`. Nada é inventado: cada tabela corresponde a uma entidade do PNCP, e
todo dado que o PNCP fornece de forma estruturada vem sempre da fonte estruturada — não de estimativa nem de leitura
de documento.

O processo de coleta é **idempotente e resiliente**: registra o que já foi feito, sobrevive a quedas e retoma de onde
parou, sem perda de dados.

---

## 4. Em andamento (conclusão prevista: sexta-feira)

| Frente | Fonte | Prazo |
|---|---|---|
| **Itens item a item** (descrição, quantidade, preço estimado e homologado) | PNCP — endpoint de itens | ~2-3 dias |
| **Marca e modelo** dos produtos vencedores | Atas do processo (PNCP), extraídas por IA e validadas pelo valor | após os itens |
| **Lances e participantes** (força da disputa) | Atas do processo | após os itens |
| Agrupamento por item comparável (CATMAT) + preço por unidade básica no conjunto completo | derivado | após os itens |

> **Nota técnica:** o ritmo de coleta é limitado pelo próprio PNCP (controle de requisições); a arquitetura garante
> que a coleta completa sem falhas, mesmo em vários dias.

---

## 5. Diferencial estratégico

A base integrada permite responder, com evidência de compras reais: *"quero comprar determinado produto de determinada
marca — qual a melhor descrição e o menor preço já praticado no estado?"* — um **banco de casos de sucesso** para o
gestor comprar com qualidade e preço justo, e um **radar de controle** para apontar sobrepreço, direcionamento e
compra sem competição. É um dado que, hoje, nenhum ente do estado possui.

---

*Relatório gerado a partir da base PNIGP. Apontamentos de controle são indícios para verificação, não juízo de
irregularidade.*
