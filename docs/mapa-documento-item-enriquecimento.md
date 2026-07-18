# Mapa: modalidade → documento → onde procurar (enriquecimento da classificação do item)

**Objetivo:** o campo `descricaoItem` do PNCP tem teto de **2.048 caracteres** (média real 148) — é rótulo, não especificação. A especificação completa do item vive, **sem limite**, nos documentos da fase de criação. Este mapa diz, sem adivinhação: **qual documento** carrega a spec por modalidade e **onde dentro dele** procurar. Fonte da escrita: Manual das APIs de Consultas PNCP v1.0 §5.12 (`docs/manual-integracao-pncp.txt`). Fonte da definição: Lei 14.133 (`docs/lei-14133-integral.md`). **Estudo empírico + casador: `docs/casamento-item-documento-estudo.md`** (200 pregões; union 0,92; casador IDF+posição+confiança; convergência).

---

## 1. Tipos de documento — escrita oficial (PNCP §5.12), agrupada por entidade

O PNCP agrupa os tipos **por entidade**. Isso É o roteamento.

### Documentos da CONTRATAÇÃO (o processo)
| Cód | Nome oficial (escrita PNCP) | Definição legal (Lei 14.133) | O que contém / onde a spec do item vive |
|---|---|---|---|
| 2 | **Edital** | art. 25 | Objeto da licitação + regras (convocação, julgamento, habilitação, gestão). **Anexa** TR/projetos (art. 25 §3). A spec detalhada NÃO está no corpo — está no TR anexo. |
| 1 | **Aviso de Contratação Direta** | art. 72 (proc. de contratação direta) | O "edital" da dispensa/inexigibilidade: objeto + condições. |
| 4 | **Termo de Referência** | art. 6º XXIII + **art. 40 §1** | 🎯 **A CASA DA SPEC (bens/serviços).** art. 40 §1 I: *"especificação do produto… requisitos de qualidade, rendimento, compatibilidade, durabilidade e segurança"*; art. 6º XXIII-a: objeto e **quantitativos**; III: garantia/manutenção/assistência. |
| 6 | **Projeto Básico** | art. 6º XXV | 🎯 **A CASA DA SPEC (obra/engenharia).** Elementos técnicos que caracterizam a obra/serviço com detalhamento suficiente. |
| 7 | **Estudo Técnico Preliminar** | **art. 18 §1** | Problema→solução. Útil ao item: IV = **estimativas das quantidades** (+ memórias de cálculo); VI = **preços unitários referenciais**; VII = descrição da solução como um todo. |
| 5 | **Anteprojeto** | art. 6º XXIV | Peça técnica preliminar de obra (usada na contratação integrada). |
| 8 | **Projeto Executivo** | art. 6º XXVI | Elementos para a execução completa da obra. |
| 10 | **DFD** (Documento de Formalização da Demanda) | fase de planejamento (art. 12 VII / regulamento) | A necessidade que originou a compra: o quê e quanto, na origem. |
| 9 | **Mapa de Riscos** | art. 18 X / §1 X | Análise dos riscos da licitação/execução. |
| 3 | **Minuta do Contrato** | art. 18 VI (anexo obrigatório do edital) | Cláusulas do futuro contrato. |
| 20 | **Ato que autoriza a Contratação Direta** | art. 72 | Autorização/decisão da dispensa/inexigibilidade. ⚠️ não consta no manual v1.0 (criado depois). |
| 16 | *"Outros documentos do processo"* | — | Balde sem tipo próprio: **é onde a ata de sessão cai** (fonte da marca). |

### Documentos da ATA de registro de preço
| 11 | **Ata de Registro de Preço** | art. 82–86 | O que foi registrado (item, fornecedor, preço). Marca só no PDF. |

### Documentos do CONTRATO
| 12 Contrato · 13 Termo de Rescisão · 14 Termo Aditivo · 15 Termo de Apostilamento · 17 Nota de Empenho · 18 Relatório Final de Contrato · 19 Minuta de Ata de Registro de Preços |
|---|

> **Verificação da escrita (conferido contra 627k docs reais):** a API é fiel ao manual palavra por palavra nos códigos **1–17**. Divergências: **19** (Minuta de Ata) e **20** (Ato que autoriza) existem na API mas **não** no manual v1.0; **18** (Relatório Final) está no manual mas tem **0 ocorrências em SC**.

---

## 2. Roteamento: modalidade → documento-fonte da spec

| Família / modalidade | Instrumento principal | **Documento-fonte da spec do item** | Complemento (quantidade/preço) |
|---|---|---|---|
| **Licitação** — Pregão (6/7), Concorrência (4/5), Concurso (3), Diálogo (2) | Edital (2) | **TR (4)** p/ bens e serviços · **Projeto Básico (6)** p/ obra | ETP (7) |
| **Contratação direta** — Dispensa (8), Inexigibilidade (9), Credenciamento (12) | Aviso de Contratação Direta (1) + Ato que autoriza (20) | **TR (4)** quando existir (dispensa costuma ter TR simplificado) | ETP (7), se houver |
| **Alienação** — Leilão (1/13) | Edital (2) | Laudo de avaliação (cai em "Outros", 16) | — |

**Princípio:** cada modalidade tem UM documento-fonte primário. Baixar todo tipo para todo processo ignora isso — para enriquecer a classificação, basta o documento-fonte da modalidade.

---

## 3. Onde procurar DENTRO do documento

- **Seção-âncora:** a spec do item mora sob títulos como *"DO OBJETO"*, *"ESPECIFICAÇÃO"*, *"ESPECIFICAÇÕES TÉCNICAS"*, *"TERMO DE REFERÊNCIA"* — não no documento inteiro.
- **Chave de casamento:** o **número do item** (+ quantidade + unidade), que já temos estruturado da API (`itens_sc`). O TR/edital lista os itens numa **tabela** (Item nº → descrição detalhada); casa-se a linha da tabela ao item do PNCP pelo número e confirma-se por quantidade/unidade.
- **Marca (art. 41):** marca/modelo só aparecem no documento e apenas *"excepcionalmente, com justificativa formal"* (art. 41 I) — por isso a descrição é genérica por obrigação legal (não minerar a descrição no lugar do documento).

---

## 4. Os dois cortes que evitam a busca extensa

1. **Quais itens** — só os de **baixa confiança** do classificador (genéricos/truncados), não os 2,2 M.
2. **Qual documento e onde** — o documento-fonte da modalidade (§2), na seção-âncora (§3).

Coleta = completa (todos os documentos, regra 2). Leitura = cirúrgica (este mapa).

---

## 5. Camada profunda: classificar → aprender padrões → sugerir os melhores documentos

Onde isto chega: não só ler o item, mas **classificar cada documento na base**, aprender sua **estrutura e padrões**, e depois **sugerir os melhores documentos para cada compra**. Três camadas, cada uma sobre a anterior.

### A — Classificação estrutural (determinística, barata, na ingestão)
Cada documento ganha, além do tipo (que já temos), sinais de estrutura:
- **Completude legal** = quantos dos elementos que a lei exige o documento contém. **A lei é a régua:**
  - ETP → art. 18 §1 (13 incisos: necessidade, quantidades, levantamento de mercado, preço referencial, solução, riscos…).
  - TR → art. 6º XXIII (a–j: objeto, quantitativos, modelo de execução/gestão, critérios de medição…) + art. 40 §1 (especificação do produto, entrega, garantia).
  - Edital → art. 25 (objeto, julgamento, habilitação, anexos do art. 25 §3).
- **Sinais de forma**: tem tabela de itens? nº de páginas/caracteres, seções presentes, gerador/plataforma, anexa TR?
- Vira score por documento (ex.: `TR 9/12 elementos`), gravável em coluna — comparável entre municípios.

### B — Padrões (LLM sobre o corpus classificado)
Com o corpus rotulado, o LLM aprende **por categoria de objeto (CATMAT)** o que caracteriza um documento completo: quais seções recorrem, como se descreve bem um item de "medicamento" vs "obra", quais lacunas são comuns, quais documentos são exemplares. Trabalho de estrutura e padrão, não de leitura avulsa.

### C — Recomendação (o produto)
Para uma **nova compra**, casada por CATMAT/objeto: sugerir os **documentos de referência melhores da base** ("os melhores TRs para comprar X são estes") + um **checklist de lacunas** ("seu TR não traz garantia/assistência técnica — art. 40 §1 III"). É o mesmo motor de [sugestão de peças orçamentárias] e do **banco de sucesso** (qualidade a preço justo em processo limpo), aplicado à instrução do processo.

### Dependência e ordem
Tudo isto assenta sobre **ter o corpus extraído** (a coleta completa dos documentos). Ordem: (1) coletar+extrair todos os documentos → (2) camada A na ingestão (score de completude pela régua legal) → (3) camada B (padrões) → (4) camada C (recomendação). Começar por A, que já é útil sozinha (mede a qualidade da instrução do processo — uma lente de auditor e um insumo do índice).
