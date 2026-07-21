# Módulo Auditoria (compras)

Lente do AUDITOR sobre o processo de compra. Consolida o que construímos: extração de marca, conferência por
trava dupla, reconcile por evento (homologação/des-homologação) e casamento item↔documento. Tudo **derivado**
(ANDAR 2, Lei 1) — nunca toca o espelho do PNCP.

Princípio: o processo é obra de MUITAS MÃOS e o erro nasce no **handoff**; a auditoria é o **verificador**.
O PNCP é um LOG → a auditoria RECONCILIA por evento, não é retrato congelado (vencedor des-homologado SAI).

## Peças
- `../portais_comportamento.mjs` — comportamento de todo portal × modalidade; o doc declara portal+modalidade;
  padrões de marca (A/B) + `leDocumento(texto)`. O portal só diz DE ONDE vem o doc; o que se extrai é igual.
- `../constroi_doc_tem_marca.mjs` — flag materializado `app.doc_tem_marca` (bootstrap + `REFRESH=1` por evento:
  doc novo OU item homolog/des-homolog). Evita varrer os 12GB de texto.
- `../extrai_marca_padrao.mjs` — extrai marca ancorada por item+valor e **RECONCILIA por processo** (apaga a
  antiga `padrao_texto`, grava a atual). Idempotência = fila `feitas` (invalidada pelo REFRESH).
- `ao_homologar.mjs` — ⭐ orquestrador DIRIGIDO POR EVENTO. Watermark em `itens.data_atualizacao`: quando um item
  homologa/des-homologa → REABRE o processo (reconcile marca + re-enriquece) e ENFILEIRA o fetch do doc que falta
  (`app.fetch_fila_${uf}`). É "quando o item homologar, já fazemos isso tudo".
- `pipeline.mjs` — orquestra: ao_homologar (evento) → REFRESH do flag → extração/reconcile. Roda no ciclo de ingestão.
- `findings.mjs` — os CHECKS da auditoria (relatório de discrepâncias).
- `cria_view_auditoria.mjs` — cria a VIEW `app.item_auditoria_${uf}`: **livro-razão de AÇÕES por item**.
- `ledger.mjs` — mostra a linha do tempo de um processo/item.

## Livro-razão (proveniência no tempo) — "de onde veio cada campo, e quando"
A view `app.item_auditoria_${uf}` UNE as fontes timestampadas → cada campo da conciliação = `campo ← ação ← fonte ← data/hora`:
| campo | ação | fonte | carimbo |
|---|---|---|---|
| descrição curta, unidade | `inclusao_item` | **API PNCP** `/itens` | `itens.data_inclusao` |
| preço homologado + vencedor | `homologacao` | **API PNCP** `/resultados` (marca passa a existir aqui) | `itens.data_atualizacao` |
| documento (edital/TR/ETP/ata) | `doc_publicado` | **PNCP arquivo** | `arquivos.data_publicacao` |
| descrição COMPLETA (spec) | `descricao_enriquecida` | **documento** do processo | `item_enriquecimento.atualizado` |
| marca + modelo | `marca_extraida` | **doc de resultado** (padrão A/B, item+valor) | `item_marca_conferida.atualizado` |
Assim se entende a criação de CADA campo. Reconcile por evento (des-homologação) reescreve a ação da marca com novo ts.

## O que a auditoria VERIFICA (findings)
1. **Doc correto** — trava dupla (CNPJ+valor) casa o doc de resultado com o processo (doc trocado = 0 conferido).
2. **Marca reconciliada** — a marca reflete o vencedor ATUAL (des-homologado saiu do sistema).
3. **Handoff item↔documento** — a descrição/CATMAT do item bate com o doc (erro nasce no handoff).
4. **Descrição vs spec** — a `descricaoItem` (truncada) vs a spec completa do TR/Edital/ETP (enriquecimento).
5. **Cobertura** — itens com vencedor SEM marca, por motivo (doc no acervo / buscar / sem rota).

## Rodar
- `node scripts/auditoria/pipeline.mjs`  — REFRESH + reconcile (idempotente, leve; entra no orquestrador).
- `node scripts/auditoria/findings.mjs`  — relatório de auditoria (só leitura).
