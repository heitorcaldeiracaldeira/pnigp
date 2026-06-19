# Índice de Capacidade Estatal (ICE) — Metodologia

**Produto-farol B2G da PNIGP.** Versão 0.1 — Junho/2026
**Princípio inegociável:** rigor e auditabilidade. Cada componente é rastreável à fonte oficial e à fórmula. O índice mede *capacidade de gestão* — não opinião.

---

## 1. O que o ICE mede (e o que NÃO mede)

**Mede:** a capacidade institucional de um ente público de **arrecadar, planejar, gastar com responsabilidade, investir e executar** — os meios de governar bem.

**NÃO mede:** resultado final de política pública (saúde, educação). Capacidade ≠ resultado. Misturar os dois seria erro metodológico e atribuiria causalidade que o dado não sustenta. Indicadores de resultado (PIB per capita, alfabetização, indicadores sociais) entram como **contexto**, ao lado do índice — nunca dentro do score.

> Essa separação é o que protege a credibilidade na frente de um TCE ou da imprensa.

---

## 2. Dimensões e componentes (todos computáveis com o dado atual)

| Dim. | Componente | Fórmula (campos reais) | Direção |
|---|---|---|---|
| **D1. Autonomia & Sustentabilidade Fiscal** | Autonomia tributária | `tributaria / receita` | ↑ melhor |
| | Equilíbrio orçamentário | `resultado / receita` | ↑ melhor |
| | Endividamento | `divida / receita` (e DCL via `dcl_fim`) | ↓ melhor |
| | Cumprimento da meta primária | `resultado_primario − meta_primario` (LDO) | ↑ melhor |
| **D2. Responsabilidade do Gasto (LRF)** | Peso de pessoal* | `pessoal / receita` | ↓ melhor |
| | Rigidez da despesa | `(pessoal + custeio) / despesa` | ↓ melhor |
| **D3. Capacidade de Investimento** | Taxa de investimento | `investimento / despesa` | ↑ melhor |
| | Execução orçamentária | `Σ empenhado / Σ dotacao` (campo `funcoes`) | ↑ melhor (≈100%) |
| **D4. Gestão de Aquisições** | Economia em licitações | economia por **preço UNITÁRIO** (unit estimado × unit homologado, item a item — `itens_sc`) | ↑ melhor |
| | Grau de competição | `100 − dispensa_pct` | ↑ melhor |
| | Aderência ao planejamento | PCA planejado × contratado (quando há PCA) | ↑ melhor |
| **D5. Qualidade do Planejamento** | Acurácia da receita | `1 − |receita − receita_prevista| / receita_prevista` | ↑ melhor |
| | Acurácia fiscal | `receita_prim_real / receita_prim_prev` e `despesa_prim_emp / despesa_prim_dot` | ↑ próximo de 1 |

*\* `pessoal / receita` é **proxy** do limite LRF (que usa a Receita Corrente Líquida específica). Declarado explicitamente; refinável quando coletarmos a RCL. Não inflar a precisão.*

---

## 3. Como o número é construído (5 passos auditáveis)

1. **Grupos de pares (peer groups).** Comparar semelhantes: faixas de porte populacional (`entes_sc.populacao`) — ex.: até 5k · 5–10k · 10–20k · 20–50k · 50–100k · >100k. O Estado é avaliado à parte. *Comparar um município de 3 mil habitantes com a capital seria injusto e errado.*
2. **Normalização por percentil dentro do grupo.** Cada componente vira 0–100 pelo **percentil** entre os pares (robusto a outliers). Componentes "↓ melhor" são invertidos.
3. **Agregação transparente.** Componente → dimensão (média, peso documentado) → índice (média ponderada das 5 dimensões). Pesos default iguais; ajustáveis e **sempre explícitos**.
4. **Âncoras legais para faixas absolutas.** Onde a lei define limite (LRF: pessoal 54%/60%; dívida), usar o **valor legal** como referência absoluta — não só o percentil relativo. É isso que diferencia "índice fundamentado em lei" de "achismo".
5. **Cobertura explícita.** Dado faltante não é imputado em silêncio: o ente recebe o índice apenas sobre as dimensões disponíveis, com **selo de cobertura** (% de componentes presentes). Transparência sobre lacuna.

**Saída:** ICE 0–100 (ano mais recente) + **tendência de 3 anos** (essencial para o "Antecipa") + score por dimensão + cobertura.

---

## 4. Camada de Antecipação — alertas derivados (o diferencial)

O índice descreve; os **alertas agem**. Regras ancoradas em lei ou em tendência:

| Alerta | Gatilho | Base |
|---|---|---|
| 🔴 Risco de pessoal (LRF) | `pessoal/receita` > 51,3% (alerta) / 54% (limite) | LRF art. 22/19 |
| 🔴 Descumprimento de meta primária | `resultado_primario < meta_primario` | LDO/RREO |
| 🟠 Dívida crescente | `dcl_fim > dcl_inicio` por 2 anos | RREO An. 6 |
| 🟠 Queda de investimento | taxa de investimento cai 2 anos seguidos | financas_sc |
| 🟠 Baixa concorrência em compras | `dispensa_pct` alto vs pares | PNCP |
| 🟡 Planejamento frágil | acurácia de receita baixa (superestimação) | financas_sc |

Cada alerta vem com o número, a fonte e a referência legal — pronto para um gestor agir.

---

## 5. Garantias de rigor (o que sustenta a credibilidade)

- **Rastreabilidade total:** todo valor liga à fonte oficial (PNCP/SICONFI/CGU/IBGE) e à fórmula publicada.
- **Metodologia versionada e aberta:** mudanças datadas; resultados reproduzíveis.
- **Percentil entre pares:** evita comparação injusta e reduz efeito de outliers.
- **Âncora legal:** limites da LRF como referência absoluta, não arbitrária.
- **Descritivo ≠ normativo:** as direções de valor ("↑ melhor") são premissas declaradas, não escondidas.
- **Cobertura honesta:** lacuna de dado é exibida, não mascarada.

---

## 6. Limitações declaradas (honestidade que protege)

- `pessoal/receita` é proxy da razão LRF (RCL exata a coletar).
- SICONFI é autodeclarado pelos entes (RREO/DCA): a qualidade depende da declaração — refletimos a fonte oficial, não a auditamos.
- Capacidade não prevê resultado: o ICE não promete causalidade com indicadores sociais.
- Cobertura temporal varia por ente/ano.

---

## 7. Implementação

Já existe a base (`getRankingFiscalSC` calcula índice fiscal por percentil: autonomia/investimento/equilíbrio/pessoal). O ICE **formaliza e estende** isso para as 5 dimensões + tendência + alertas + cobertura. Esforço incremental sobre infraestrutura existente.

**Próximo passo após validação metodológica:** implementar `getIndiceCapacidadeEstatal(cod_ibge)` e a aba "Capacidade Estatal" no painel, com o score, as 5 dimensões, a tendência e os alertas.

---

## 8. Alinhamento a referenciais oficiais (TCE-SC, TCU, IRB)

O ICE e o Diagnóstico do Gestor são ancorados em referenciais reconhecidos do controle externo — não em critérios próprios:

- **IEGM / IRB** (Índice de Efetividade da Gestão Municipal, Instituto Rui Barbosa, adotado pelos TCEs): 7 dimensões — i-Educ, i-Saúde, i-Planejamento, **i-Fiscal**, i-Amb, i-Cidades, i-GovTI. Nossa dimensão fiscal espelha o **i-Fiscal**; as demais (questionário de aderência) ficam como roadmap.
- **LRF + TCE-SC** — despesa de pessoal do Executivo: limite **54%** da RCL, prudencial **51,3%**, alerta **48,6%**. O TCE-SC notifica municípios nessas faixas e sobre metas de arrecadação. *(Usamos proxy sobre a receita; a RCL exata é roadmap — RREO Anexo 03.)*
- **TCU** — iGG/iESGo: governança de pessoas, TI e **contratações**. A análise de competição/dispensa em compras dialoga com a dimensão de contratações.
- **Mínimos constitucionais** — Educação **≥ 25%** (CF art. 212) e Saúde **≥ 15%** municípios (LC 141). **Importante:** o gasto por função (`financas_sc.educacao/saude`) ÷ receita **não é** o indicador legal (a base MDE/ASPS é específica). O cálculo de cumprimento constitucional exige coletar o **RREO Anexo 08/12** — item de roadmap; até lá, não afirmamos cumprimento/descumprimento.

**Princípio:** preferir sempre o parâmetro legal/oficial ao critério relativo. Onde só temos proxy, declaramos. Onde falta a base exata, não concluímos.
