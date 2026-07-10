# Nota Técnica — Classificação de Itens de Compra (CATMAT/CATSER) e Fundamentação Metodológica

**Módulo:** Compras / Banco de Preços — comparação por preço unitário. Versão 1.0 — Julho/2026
**Princípio inegociável:** rigor e auditabilidade. Toda a cadeia — dado, catálogo e técnica — é rastreável a **base oficial da União**. A classificação não cria taxonomia própria nem usa modelo caixa-preta: apoia-se em **fontes basilares do Estado brasileiro**.

---

## 1. Objetivo

Para comparar preços de compras públicas de forma **defensável**, é preciso garantir que se está comparando **o mesmo produto** — não apenas a mesma palavra na descrição. Descrições livres ("caneta azul", "caneta esferográfica cor azul ponta 1,0mm") escondem o mesmo item sob milhares de grafias.

A solução é **classificar cada item no catálogo oficial de materiais e serviços do governo federal (CATMAT/CATSER)**, obtendo uma chave nacional e padronizada (PDM — Padrão Descritivo de Material; e classe). Só então o preço unitário de um município pode ser comparado ao de outro ente — inclusive ao da União — sobre a **mesma unidade de análise**.

Esta Nota documenta os **dois pilares** que sustentam essa classificação: **(2)** a linha metodológica do controle interno da União (robô "Alice") e **(3)** o uso dos catálogos oficiais CATMAT/CATSER sobre os dados do PNCP.

---

## 2. Pilar 1 — Fundamentação metodológica: a linha do controle interno da União ("Alice")

**Alice** ("Análise de Licitações e Editais") é o robô desenvolvido pela **Controladoria-Geral da União (CGU)** — órgão central do **controle interno do Poder Executivo Federal** — em parceria com o **Tribunal de Contas da União (TCU)**. Ele varre diariamente as publicações de licitações e aplica **processamento de linguagem natural (NLP)** sobre o texto de compras para apoiar auditores na detecção de riscos (restrição à competição, direcionamento, sobrepreço).

A geração de robôs de controle da CGU/TCU (Alice, Sofia, Mônica) assenta-se sobre **NLP clássico — representação vetorial de texto (bag-of-words / TF-IDF) seguida de classificador linear** — e não sobre grandes modelos de linguagem opacos.

**O que adotamos dessa linha (o método, não o objetivo):**

| | Alice (CGU/TCU) | Classificador PNIGP |
|---|---|---|
| **Objetivo** | flagar risco em editais | classificar item → CATMAT/PDM p/ comparar preço |
| **Entrada** | texto de edital/licitação | descrição curta de produto |
| **Técnica** | TF-IDF + classificador linear | **TF-IDF (1-2gram) + LinearSVC** |

A escolha de **TF-IDF + SVM linear** em vez de *embeddings* é deliberada e tem três justificativas:

1. **Adequação à tarefa.** Para **descrição curta de produto**, o baseline clássico empata ou supera *embeddings* — a identidade do item está em poucos termos discriminantes, não em semântica de contexto longo.
2. **Reprodutibilidade e auditabilidade.** Cada predição é explicável pelos termos que a determinaram; o modelo é determinístico e versionável.
3. **Alinhamento ao padrão do controle.** Adotar a mesma escola metodológica dos robôs da CGU/TCU torna o resultado **defensável perante auditoria** (TCE, TCU, imprensa): a resposta a um questionamento é *"usamos a técnica do controle federal sobre o catálogo oficial"*, não *"um modelo nosso"*.

> **Ressalva de honestidade.** Os detalhes internos exatos da Alice não são integralmente públicos. O que se afirma aqui é o **alinhamento à linha metodológica** (amplamente documentada), **não** a replicação de seu código. A validade do nosso classificador vem da **acurácia medida** (§5), não de um selo de equivalência.

---

## 3. Pilar 2 — Bases basilares: catálogos oficiais (CATMAT/CATSER) sobre o PNCP

A classificação usa **duas bases basilares do Estado brasileiro**, ambas oficiais:

### 3.1. O dado — PNCP (Portal Nacional de Contratações Públicas)

Os itens de compra são coletados do **PNCP**, portal oficial instituído pela **Lei nº 14.133/2021 (Nova Lei de Licitações)** como repositório nacional das contratações públicas. Dele extraímos, por item: descrição, quantidade, unidade, **valor unitário estimado × homologado**, fornecedor/CNPJ/porte, e o **código de catálogo (CATMAT/CATSER) quando o próprio ente o informa**.

### 3.2. A taxonomia — CATMAT e CATSER

- **CATMAT** — Catálogo de Materiais.
- **CATSER** — Catálogo de Serviços.

Ambos compõem o **Sistema de Catalogação de Material e Serviços do Governo Federal** (Compras.gov.br), a árvore de classificação oficial usada pela Administração Pública Federal. Classificamos cada item **dentro dessa árvore** (Grupo → Classe → PDM), em vez de inventar categorias.

**Por que isto importa — o princípio "classificar no catálogo do próprio Estado":**

1. **Defensabilidade.** A referência é a taxonomia oficial da União, não um esquema proprietário.
2. **Escala nacional.** Como CATMAT/CATSER são federais, a mesma chave compara **SC × qualquer UF × a própria União** quando outras bases forem ingeridas — o pipeline já é *state-agnostic*.
3. **Ponte com o preço-teto legal.** Abre caminho para cruzar com referenciais oficiais de preço (ex.: PMVG/CMED para medicamentos, via princípio ativo no CATMAT).

---

## 4. Especificação técnica do classificador

- **Corpus de treino (rótulos):** catálogo oficial CATMAT (`catmat_catalogo`) — descrição → `codigo_pdm` / `codigo_classe` / `nome_pdm`. Corpus atual: **343.323 exemplos** cobrindo **20.332 PDMs**.
- **Alvo a classificar:** descrições distintas de **bens** em SC (`itens_sc`), filtrando serviços/obras e unidades não-comparáveis.
- **Vetorização:** TF-IDF, *n-gramas* 1–2, `strip_accents=unicode`, `min_df=2`, `max_features=20000`, `sublinear_tf`.
- **Limpador de unidade/embalagem:** remove quantidade+unidade ("400g", "cx c/ 100") para focar na **identidade do produto**, preservando dimensões que o definem (ex.: "175/70 r13", "220v").
- **Modelo:** classificador linear (SVM, *hinge loss* via SGD) sobre a matriz TF-IDF.
- **Confiança:** sigmoide da margem entre 1ª e 2ª classe → escore [0,5 – 1,0] por item, permitindo cortar predições de baixa confiança.

---

## 5. Validação (a preencher pela execução)

O treino reserva **holdout aleatório de 8%** e reporta acurácia em dois níveis:

- **PDM** (classe exata do produto) — métrica estrita.
- **CLASSE** (o item cai na classe certa, ainda que o PDM difira) — mais tolerante e, para comparação de preços, frequentemente suficiente.

Além do placar, a validação produz **análise de erro estrutural**: separa erro **mole** (classe certa, PDM errado = questão de especificação) de erro **duro** (classe errada = confusão real), lista as confusões sistemáticas de classe e verifica se a **margem prevê o erro** (acertos com margem maior = confiança útil).

> *[Preencher com os números do run: acurácia PDM __%, CLASSE __%, % de erro mole vs. duro. A Nota é atualizada a cada retreino.]*

---

## 6. Limitações declaradas

- **CATMAT muitas vezes vem vazio no PNCP** — daí a necessidade do classificador; a chave é **inferida**, com confiança explícita, não fornecida pelo ente.
- **Dentro de um mesmo PDM ainda cabem especificações distintas** — logo, diferença de preço entre dois entes do mesmo PDM **não** é automaticamente sobrepreço. Ver Nota sobre decomposição de preço (descrição → disputa → preço).
- A acurácia é **medida e publicada**, não presumida. Predições de baixa margem são sinalizadas, não escondidas.

---

## 7. Governança e auditabilidade

- **Rastreabilidade completa:** dado (PNCP, oficial) → taxonomia (CATMAT/CATSER, oficial) → técnica (linha CGU/TCU, documentada) → acurácia (medida).
- **Reprodutível:** corpus, parâmetros e modelo versionados; retreino gera nova versão desta Nota.
- **Carimbo de proveniência:** toda exibição derivada informa fonte (PNCP) e catálogo (CATMAT/CATSER) — coerente com o padrão de exibição por fonte da plataforma.

---

*Fontes basilares: Portal Nacional de Contratações Públicas (PNCP — Lei 14.133/2021); Catálogos CATMAT/CATSER (Sistema de Catalogação do Governo Federal / Compras.gov.br); linha metodológica dos robôs de controle da Controladoria-Geral da União (CGU) e do Tribunal de Contas da União (TCU).*
