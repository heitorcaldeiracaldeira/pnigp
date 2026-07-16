# Pontos de Notificação — PNCP

**Todos os gatilhos que a base do PNCP sustenta, para os dois públicos, num lugar só.** Feito para não ter que
pensar solução avulsa a cada conversa. Cada linha diz **de onde vem o dado** — se não tem origem, não está aqui.

**Regra de honestidade:** o que o PNCP **não** publica está na §4, explícito. Não inventar estado que não existe
("adjudicado", "em fase de lances" — verificado no `/historico`: só há Inclusão/Retificação de 4 entidades).

---

## 1. Estados que o PNCP realmente publica

O ciclo notificável é este — mais grosso que o do pregão real, e é o que existe:

| estado | de onde vem |
|---|---|
| **Recebendo proposta** | contratação: `now()` entre `dataAberturaProposta` e `dataEncerramentoProposta` |
| **Em disputa/julgamento** | passou o encerramento e o item segue `situacaoCompraItem=1` (Em Andamento) |
| **Homologado** | `situacaoCompraItem=2` + `dataResultado` do `/resultados` (carimbo item a item, com hora) |
| **Deserto** | `situacaoCompraItem=4` — ninguém apareceu |
| **Fracassado** | `situacaoCompraItem=5` — todos desclassificados/inabilitados |
| **Anulado/Revogado/Cancelado** | `situacaoCompraItem=3` |
| **Processo suspenso/revogado/anulado** | contratação: `situacaoCompraId` 2/3/4 |
| **Retificado** | `/historico`: `tipoLogManutencao=1` (Retificação) na categoria 1/4/5/6 |
| **Documento novo** | `/historico`: categoria 6 + `documentoTitulo` (recurso, decisão, ata…) |

---

## 2. Para o FORNECEDOR (a prefeitura envia de graça às empresas locais)

Cruzamento "o que a empresa vende × o que está aberto" = **motor CATMAT** (consumir, nunca mexer).

| # | gatilho | dado | por que importa |
|---|---|---|---|
| F1 | **Abriu processo no meu ramo** | `/v1/contratacoes/proposta` + CATMAT | com `linkSistemaOrigem` (onde se envia) e `dataEncerramentoProposta` |
| F2 | **Prazo fechando** (D-3, D-1) | `dataEncerramentoProposta` | o aviso só vale se chegar a tempo |
| F3 | **Item DESERTO** | `situacaoCompraItem=4` | ninguém apareceu → **o município VAI REPETIR**. É a melhor oportunidade que existe: concorrência zero demonstrada |
| F4 | **Item FRACASSADO** | `situacaoCompraItem=5` | todos inabilitados → repete, e quem tiver documentação em ordem leva |
| F5 | **Resultado saiu** | `/resultados` + `dataResultado` | ganhei/perdi, por quanto, para quem |
| F6 | **Ata de registro de preço vencendo** | `atas_sc` (vigência) | nova licitação vem aí — dá tempo de se preparar |
| F7 | **Contrato vencendo** | `contratos_sc.vig_fim` | idem, e mostra quem é o incumbente |
| F8 | **Processo suspenso/anulado/retificado** | `situacaoCompraId`, `/historico` | quem ia participar precisa saber que mudou |
| F9 | **Este município compra o que eu vendo** | `item_homologado_sc` histórico | não é alerta, é prospecção: recorrência de compra |

**O diferencial não é o alerta — é o HISTÓRICO junto.** A pergunta do fornecedor não é "abriu?", é **"vale a pena e a
quanto?"**. Só a base de 1,1 milhão de itens homologados responde:
> *Chapecó abriu pregão de pneu, fecha em 6 dias → [link]. Comprou 4× desde 2023, arrematado entre R$ 340 e R$ 512.
> Desconto sobre o estimado nas últimas 3: 12%, 8%, 31%. Disputaram 3, 5 e 4. Venceram: [nomes]. Marcas: [da ata].*

---

## 3. Para o SERVIDOR da prefeitura

| # | gatilho | dado | por que importa |
|---|---|---|---|
| S1 | **Item arrematado no estimado ou ACIMA** | `unit_homologado >= unit_estimado` | **408.717 itens = 36,8% de SC.** Ninguém puxou o preço. É o número que o sinalizador (F1) conserta |
| S2 | **Poucos licitantes vs. o normal do item** | `propostas_sc` × mediana do CATMAT | disputa fraca → preço alto. Antecipa o S1 |
| S3 | **Paguei acima do que outros pagaram** | `item_homologado_sc` por CATMAT + unidade básica | sobrepreço por item, com quem pagou menos e o nº do processo |
| S4 | **Item DESERTO/FRACASSADO** | `situacaoCompraItem` 4/5 | tem que republicar — e o F3/F4 avisa fornecedor para não dar deserto de novo |
| S5 | **Ata de RP vencendo** | `atas_sc` | planejar a próxima antes de faltar |
| S6 | **Contrato vencendo** | `contratos_sc.vig_fim` | idem |
| S7 | **Fornecedor sancionado participando/vencendo** | CEIS/CNEP × `cnpj_fornecedor` | mostrar órgão + pena. **Nunca dizer "proibido comprar"** — contratar é decisão discricionária do órgão |
| S8 | **Concentração de fornecedor** | `item_homologado_sc` por `cnpj_fornecedor` | mesmo ganhador recorrente. Sinal, não acusação |
| S9 | **Meu estimado destoa do praticado** | `precos_referencia_basica_sc` | **antes de publicar** — é onde se ganha, não depois |
| S10 | **Prazo de proposta curto vs. média** | `dataAbertura` → `dataEncerramento` | prazo apertado afasta licitante → vira S1 |
| S11 | **Planejei no PCA e não contratei** | `/v1/pca` × contratações | execução do plano |

---

## 4. O que o PNCP **NÃO** publica (não prometer)

- **"Adjudicado"** e **"em fase de lances"** — não existem. `situacaoCompraItem` tem 5 valores e nenhum é esses.
  Verificado no `/historico`: só Inclusão/Retificação das categorias Contratação, Item, Resultado e Documento.
- **Lance a lance** — não há endpoint. Fica na ata (PDF) ou no portal da plataforma. **Fonte separada.**
- **Marca** — nenhum campo da API tem. Provado no JSON cru de `/resultados` (37 campos). Só do PDF da ata.
- **`catalogoCodigoItem` (CATMAT)** — existe o campo, vem **vazio** (medido: 1 de 16). O eixo depende do
  casamento por descrição (~14,9%).

---

## 5. Regras que valem para os dois públicos

- **Ler antes de desenhar**: Jacoby, TCU, TCE/SC + `docs/metodologia-mapa-precos.md`. Avisar fornecedor sobre
  certame aberto tem contorno jurídico.
- **Tom neutro e didático** — sem crítica à gestão, sem viés. Explicar a metodologia, mostrar o cálculo.
- **Não abrir disputa entre municípios** — mostrar a condição própria, não o que o vizinho fez.
- **Proveniência sempre**: fonte, competência, data de extração, e o nº do processo para conferir.
- **Sanção**: exibir órgão e pena, nunca "proibido contratar".
- **Nada de análise sobre coleta incompleta** — a extração passa fora de ordem por modalidade; no meio do caminho
  o dado está enviesado.
