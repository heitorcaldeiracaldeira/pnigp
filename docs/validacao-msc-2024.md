# Relatório de Validação — MSC Ancorada ao RREO

**Data:** 27/06/2026 · **Exercício:** 2024 · **Amostra:** 40 municípios aleatórios de SC
**Script:** `scripts/validate_msc_40.mjs`

## Objetivo
Verificar se a despesa gerada pelo sistema (MSC ancorada ao RREO) bate com a fonte oficial
do SICONFI/Tesouro Nacional, consultada **ao vivo** no momento do teste.

## Metodologia
40 municípios sorteados (`ORDER BY md5`). Para cada um, comparado:
1. **SICONFI ao vivo** — despesas empenhadas do RREO Anexo 02 (API do Tesouro, chamada direta).
2. **Sistema** — total da MSC ancorada (forma da MSC × total do RREO).
3. **Integridade** — Σ natureza = Σ fonte = total.

## Resultados
| Métrica | Resultado |
|---|---|
| Municípios testados | 40 |
| Dentro de 0,5% | 39 / 40 (97,5%) |
| Diferença média | 0,065% |
| Diferença máxima | 1,53% (1 caso) |
| Integridade interna | 40 / 40 (100%) |

A maioria fechou em 0,00% exato (Itapema 652,5mi, São Bento do Sul 561,4mi, Caçador 408,1mi, Xaxim, Orleans…).

## Único desvio
**Curitibanos** −1,53% (sistema 212,5mi × SICONFI 215,8mi). Causa: a âncora RREO ingerida está
defasada porque o município republicou o RREO após a coleta. A reingestão automática (orquestrador,
a cada bimestre) corrige — não é erro de método.

## Conclusão
O sistema reconcilia com a fonte oficial do Tesouro com precisão média de **0,065%** e **100%**
de integridade interna. A estratégia "forma da MSC × total do RREO" entrega o detalhe granular
(natureza e fonte) sem divergir do número oficial declarado pelo município.
