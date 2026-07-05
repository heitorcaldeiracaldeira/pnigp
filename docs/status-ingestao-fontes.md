# Status de ingestão das fontes de dados municipais (SC) — verificação

Cruzamento do levantamento (`fontes-dados-municipais.md`) com o banco (145 tabelas municipais). Atualizado nesta rodada.
Legenda: ✅ inserido · ⏳ parcial/instável · ❌ falta · 🔒 bloqueado/adiado.

## 📌 Fontes ingeridas nesta rodada (9) — documentação completa
Todas: coletor idempotente (UPSERT), state-agnostic (UF via env), registradas no orquestrador (`etl_orquestrador.mjs` FONTES+TAB), exibidas no app com **carimbo de origem + data de extração + CSV**.

| Fonte | Órgão | Tabela | Coletor | Série | Aba no app | Cadência | Proveniência (URL/API) |
|---|---|---|---|---|---|---|---|
| **BNDES** desembolsos | BNDES | `bndes_sc` | `ingest_bndes_sc.mjs` | 1995-2026 | Sistema Financeiro | 60d | CSV CKAN `dadosabertos.bndes.gov.br/.../desembolsos-mensais.csv` (135MB latin1) |
| **CFEM** royalties | ANM | `cfem_sc` | `ingest_cfem_sc.mjs` | 2007-2020 | Finanças | 180d | `dadosabertos.anm.gov.br/CFEM/CFEM_Distribuicao.csv` (128MB latin1) |
| **ANP** combustíveis | ANP | `anp_precos_sc` | `ingest_anp_sc.mjs` | 2004-2021 (33 munis) | Infraestrutura | 365d | `gov.br/anp/.../shpc/dsas/ca/ca-YYYY-SS.csv` (semestral) |
| **INPE queimadas** | INPE | `queimadas_sc` | `ingest_queimadas_sc.mjs` | mensal 2024+ | Defesa Civil | 15d | `dataserver-coids.inpe.br/.../focos/csv/mensal/Brasil/` (CURL, não fetch) |
| **Bolsa Atleta** | Min. Esporte | `bolsa_atleta_sc` | `ingest_bolsa_atleta_sc.mjs` | 2024-2025 | Esporte | 60d | XLSX SharePoint MDS `/sites/{site}/_layouts/15/download.aspx?share={token}` |
| **Estatísticas vitais** | IBGE Reg. Civil | `estatisticas_vitais_sc` | `ingest_estatisticas_vitais_sc.mjs` | 2003-2023 | Saúde | 180d | SIDRA t2679 (nascidos v217) + t2681 (óbitos v343), ano a ano |
| **ANS cobertura** | ANS | `ans_cobertura_sc` | `ingest_ans_cobertura_sc.mjs` | 2026 × pop IBGE 2025 | Saúde | 90d | `dadosabertos.ans.gov.br/.../taxa_de_cobertura-047/pda-047-taxa_cobertura.csv` |
| **CAGED** saldo empregos | MTE/PDET | `caged_sc` | `ingest_caged_sc.mjs` | 2026 YTD (mensal) | Sistema Financeiro | 30d | FTP `ftp://ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/` (.7z via 7zip-min) |
| **Equipamentos esportivos** | OpenStreetMap | `equipamentos_esporte_sc` | `ingest_equipamentos_esporte_sc.mjs` | atual (3.078 pts) | Esporte + mapa | 90d | Overpass `leisure=pitch/sports_centre/stadium/track/fitness` |
| **RAIS** estoque emprego | MTE/PDET | `rais_sc` | `ingest_rais_sc.mjs` | 2024 (2,86mi empregos SC) | Base Econômica (RAIS) | 180d | FTP `RAIS_VINC_PUB_SUL.7z`+`RAIS_ESTAB_PUB.7z` (.COMT, CSV vírgula+aspas, decimal ponto) |
| **Casamento RAIS×CAGED** | derivado (MTE) | rais_sc + caged_sc | (query getCasamentoEmpregoSC) | estoque + fluxo | Base Econômica (Emprego) | — | estoque RAIS 2024 + Σ saldo CAGED 2025-26 = ESTIMATIVA rotulada (escopos diferentes → não fecha 100%) |

Notas de fidelidade: CFEM distribuição pública encerra em 2020; ANP cobre só ~33 munis pesquisados; ANS = pressão latente sobre o SUS (beneficiários ÷ população IBGE, anos casados: ANS 2026 × estimativa IBGE 2025, a mais recente — 2026 do IBGE ainda não publicada); vitais substitui SIM/SINASC (DATASUS DBC/TabNet difícil), SINAN/agravos ainda falta.

## Eixo FINANCEIRO / ECONÔMICO
| Status | Fonte | Órgão | Tabela | Obs |
|---|---|---|---|---|
| ✅ | ESTBAN (crédito/poupança) | BCB | `estban_sc` | série 38 meses |
| ✅ | Pix (transações PF/PJ) | BCB | `pix_municipio_sc` | série 24 meses |
| ✅ | **BNDES desembolsos** | BNDES | `bndes_sc` | 1995-2026, R$97,6bi · aba Sistema Financeiro · CSV |
| ✅ | **RAIS** (estoque emprego formal) | MTE | `rais_sc` | 2024, 2,86mi empregos SC · Base Econômica · casado c/ CAGED |
| ✅ | **Novo CAGED** (saldo empregos) | MTE | `caged_sc` | 2026 YTD, +60k empregos · aba Sistema Financeiro · CSV (FTP .7z) |
| ❌ | **RFB CNPJ** (empresas/CNAE/MEI) | Receita | — | CSV ~20GB (frente dedicada) |
| ❌ | **RFB Arrecadação** | Receita | — | XLSX |

## Eixo RECEITA PRÓPRIA / REGULATÓRIO
| Status | Fonte | Órgão | Tabela | Obs |
|---|---|---|---|---|
| ✅ | Transferências União (FPM/FUNDEB/ITR/Kandir) | STN | `transferencias_stn_sc` | mensal |
| ✅ | ICMS/IPVA cota-parte | SEF/SICONFI | (financas) | validado |
| ✅ | **CFEM** (royalty mineração) | ANM | `cfem_sc` | 2007-2020 · aba Finanças · CSV |
| ✅ | **ANP combustíveis** (preço/posto) | ANP | `anp_precos_sc` | 2004-2021, 33 munis · aba Infraestrutura · CSV |
| 🔒 | CMED/PMVG (preço-teto remédio) | Anvisa | — | fonte futura |

## Eixo SAÚDE
| Status | Fonte | Órgão | Tabela | Obs |
|---|---|---|---|---|
| ✅ | CNES (estabelecimentos/leitos) | DATASUS | `cnes_sc`, `estabelecimentos_saude_sc` | + no mapa |
| ✅ | SIOPS (ASPS) | MS | `siops_sc` | série |
| ✅ | Previne (APS) | MS | `previne_sc` | |
| ✅ | Produção SIH/SIA (MAC) | DATASUS | `saude_producao_sc` | |
| ✅ | FNS repasses | FNS | `fns_repasse_sc` | |
| ✅ | MI Social (CRAS/PBF/CadÚnico) | MDS | `mi_social_serie_sc` | |
| ✅ | **ANS cobertura** (planos → pressão SUS) | ANS | `ans_cobertura_sc` | 2026 × pop IBGE 2025 · aba Saúde · CSV |
| ✅ | **Estatísticas vitais** (nascidos/óbitos) | IBGE Reg. Civil | `estatisticas_vitais_sc` | 2003-2023 · aba Saúde · CSV (substitui SIM/SINASC; SINAN/agravos ainda falta) |

## Eixo TERRITORIAL / AMBIENTAL
| Status | Fonte | Órgão | Tabela | Obs |
|---|---|---|---|---|
| ✅ | Saneamento (Censo 2022) | IBGE | `saneamento_sc` | água/esgoto |
| ✅ | CAR (cadastro ambiental rural) | SICAR | `car_sc` | |
| ✅ | **INPE queimadas** (focos) | INPE | `queimadas_sc` | mensal 2024+ · aba Defesa Civil · CSV |
| ❌ | **INPE PRODES/DETER** (desmatamento) | INPE | — | WFS/SHP |

## Eixo INFRAESTRUTURA / SANEAMENTO
| Status | Fonte | Órgão | Tabela | Obs |
|---|---|---|---|---|
| ⏳ | SNIS (água/esgoto) | Min.Cidades | `snis_sc` | parcial |
| ❌ | SNIS resíduos | Min.Cidades | `snis_residuos_sc` (vazia) | backend 500 morto → usar SINISA |
| ❌ | **SINISA** (sucessor do SNIS) | Min.Cidades | — | dashboard SPA (difícil) |
| ✅ | MCMV (habitação) | Min.Cidades | `mcmv_sc` | |

## Eixo ÍNDICES / GOVERNANÇA
| Status | Fonte | Tabela |
|---|---|---|
| ✅ | IEGM (TCE-SC/IRB) | `iegm_sc` |
| ✅ | MUNIC (instrumentos de gestão) | `munic_sc` |
| ✅ | Indicadores IBGE/CGU | `indicadores_sc` |
| ✅ | CAUC (regularidade) | `cauc_sc`, `cauc_detalhe_sc` |
| ✅ | Precatórios (TJSC) | `precatorios_sc` |

## Eixo POLÍTICO / SETORIAL
| Status | Fonte | Tabela | Obs |
|---|---|---|---|
| ✅ | TSE eleitorado | `eleitorado_sc` | |
| ✅ | Votos bancada federal/estadual | `votos_bancada_sc`, `votos_estadual_sc` | |
| ❌ | TSE candidatos/resultados/contas | — | CKAN (ampliar) |

## Eixo EDUCAÇÃO (muito completo)
| Status | Fonte | Tabela |
|---|---|---|
| ✅ | Censo Escolar (escolas/matrícula/infra) | `escolas_sc`, `escolas_hist_sc`, `censo_matricula_sc` |
| ✅ | IDEB | `ideb_sc` |
| ✅ | FUNDEB (matrículas/fatores/VAAT/VAAR/motor) | `fundeb_oficial_sc`, `fatores_fundeb`, `vaat_fundeb_sc`, `vaar_fundeb_sc`, `fundeb_motor_sc` |
| ✅ | Indicadores INEP (AFD/TDI/ATU/rendimento) | `indicadores_inep_sc`, `indicadores_inep_escola_sc` |
| ✅ | Educação especial/AEE | `educacao_especial_sc` |
| ✅ | PDDE / PNLD | `pdde_sc`, `pnld_reserva_sc` |

## Eixo AGROPECUÁRIA / IBGE
| Status | Fonte | Tabela |
|---|---|---|
| ✅ | Censo Agro + CAF + CAR + PRONAF | `agropecuaria_sc`, `caf_sc`, `pronaf_sc` |
| ✅ | População por idade | `populacao_idade_sc` |

## Eixo PREVIDÊNCIA (completo — CADPREV)
| Status | Fonte | Tabela |
|---|---|---|
| ✅ | RPPS + CRP + DAIR/DIPR/DRAA (37 recursos) | `rpps_sc`, `rpps_crp_sc`, `cadprev_*` (~30 tabelas) |

## Eixo COMPRAS / TRANSPARÊNCIA
| Status | Fonte | Tabela |
|---|---|---|
| ✅ | PNCP (compras/contratos/processos/itens/atas) | `compras_sc`, `contratos_sc`, `processos_sc`, `itens_sc`, `atas_sc` |
| ✅ | Emendas (indicação/execução, fed+est) | `emendas_indicacao_sc`, `emendas_execucao_sc`, `emendas_estaduais_exec_sc` |
| ✅ | Convênios (Portal, municipal) | `convenios_captados_sc` |
| ✅ | Sanções CEIS/CNEP + red flags | `red_flags_fornecedores_sc` |

---
## PLACAR (atualizado)
- **Inseridos nesta rodada:** ✅ **BNDES** (bndes_sc, 1995-2026) · **CFEM** (cfem_sc, 2007-2020) · **INPE queimadas** (queimadas_sc, mensal 2024+) · **ANP** (anp_precos_sc, 2004-2021) · **Bolsa Atleta** (bolsa_atleta_sc, Min. Esporte 2024-2025). Todos registrados no orquestrador (etl_orquestrador.mjs + TAB).
- **Já eram inéditos ✅:** ESTBAN, Pix, TSE eleitorado.
- **FALTAM (próxima frente):** ANS beneficiários (🟡 FTP), SIM/SINASC/SINAN (🟡 TabNet), INPE PRODES/DETER (🟡 WFS), RAIS·CAGED (🟠 FTP/BigQuery), RFB CNPJ 20GB·Arrecadação (🔴 dedicada), SINISA (🔴 SPA).
- **Notas:** CFEM distribuição pública para em 2020; ANP cobre ~33 munis (amostra pesquisada); infra esportiva do Min. Esporte NÃO tem SC; LIE está no portal SLIE (separado).
- **A base já é MUITO ampla** fora do levantamento: educação, saúde, previdência, compras, fiscal, financeiro — dezenas de fontes oficiais.
