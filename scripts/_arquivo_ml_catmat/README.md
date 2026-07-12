# Arquivo — classificador ML de CATMAT (descartado)

Experimento de classificar descrição de compra → CATMAT (PDM) por **TF-IDF + SGD linear**
(baseline CGU "Alice"). **Descartado em 2026-07-09** por não passar no próprio portão de aceite.

## Por que foi descartado
O único rótulo disponível é o próprio catálogo (`catmat_catalogo`), que descreve em registro
formal/longo, enquanto a compra real é curta e coloquial. Isso cria um descasamento treino×uso:

| Versão | Acurácia intra-catálogo (NÃO é produção) | Portão de sanidade (consultas reais) | Veredito |
|---|---|---|---|
| v1 | PDM 88,6% / CLASSE 94,0% | ~42% — `caneta azul → cunha odontológica` | reprovado |
| v2 (âncora no nome do PDM + abstenção) | PDM 82,6% / CLASSE 88,9% | **58,3% (7/12)** | **REJEITADO** (< 66%) |

A âncora no nome do PDM (injetar o nome canônico curto como exemplo de treino) melhorou, mas
não o suficiente para bater o portão de 66%. `sc_pred.tsv` nunca foi ingerido por nenhum script.

## Caminho de produção (mantido)
A classificação CATMAT em produção é por **trigrama** (pg_trgm, LATERAL KNN sobre `catmat_pdm`):
- `scripts/match_item_catmat.mjs` → `item_catmat_map` (38.889 chaves item-a-item)
- `precos_referencia_sc.catmat_cod/catmat_pdm/catmat_sim` — 936/1007 refs, sim médio 0,961
  (é o que o Banco de Preços na UI consome via `getBancoPrecosSC`)

## Se um dia retomar o ML
Alavanca não testada: subir `NAME_WEIGHT` (era 4) para 8–10 e reduzir `CONF_MIN`. Inputs
ficavam no scratchpad `...ba9cc77b.../catmat_train.tsv` e `sc_keys.tsv` (podem não existir mais).
