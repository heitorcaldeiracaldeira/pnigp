# PNIGP — Documentação do Sistema (gerada automaticamente)

> Gerada em 2026-06-19 por `scripts/gerar_documentacao.mjs`. Reflete o estado real do código e do banco. **Não editar à mão.**

## 1. Banco de dados (Neon)

| Tabela | Registros | Colunas |
|---|---|---|
| `coleta_heartbeat` | 1 | 6 (id, ts, progresso, etapa, reinicios, msg) |
| `coleta_qa` | 1 | 6 (id, ts, status, suspeitos, alertas, regras) |
| `compras_publicas` | 106 | 11 (ente_tipo, ente_id, ano, valor_contratado_pc, pct_pregao_eletronico, pct_dispensa, economia_pregao, fornecedores_mil…) |
| `compras_sc` | 662 | 9 (cod_ibge, ano, n_contratos, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade…) |
| `compras_sc_vazios` | 46 | 1 (cod_ibge) |
| `contratacoes` | 1.035 | 13 (id, ente_tipo, ente_id, numero, objeto, orgao, modalidade, valor_estimado…) |
| `contratos_sc` | 765.146 | 14 (id, cod_ibge, numero_controle_compra, cnpj_compra, ano_compra, seq_compra, fornecedor, ni_fornecedor…) |
| `contratos_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `contratos_sc_feitos_inc` | 295 | 2 (cod_ibge, n) |
| `entes_sc` | 296 | 5 (cod_ibge, nome, uf, tipo, populacao) |
| `estado_indicador_valores` | 2.160 | 4 (estado_id, indicador_id, ano, valor) |
| `estados` | 27 | 8 (id, uf, nome, regiao, populacao, capital, governador, pib_per_capita) |
| `etl_catalogo` | 10 | 9 (id, label, api, max_ano, ultima_exec, ultimo_status, devido, msg…) |
| `financas` | 106 | 19 (ente_tipo, ente_id, ano, receita_total, rec_tributaria, rec_transferencias, rec_outras, despesa_total…) |
| `financas_sc` | 1.969 | 22 (cod_ibge, ano, receita, receita_prevista, tributaria, transferencias, outras, despesa…) |
| `indicador_valores` | 2.080 | 4 (municipio_id, indicador_id, ano, valor) |
| `indicadores` | 16 | 8 (id, codigo, nome, area, unidade, fonte, direcao_melhor, descricao) |
| `indicadores_sc` | 4.672 | 7 (cod_ibge, ano, codigo, area, valor, unidade, fonte) |
| `indices_pnigp` | 130 | 9 (municipio_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `indices_pnigp_estados` | 135 | 9 (estado_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `metas` | 130 | 6 (id, municipio_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_estados` | 135 | 6 (id, estado_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_fiscais_feitos` | 2.072 | 2 (cod_ibge, ano) |
| `metas_fiscais_sc` | 1.417 | 12 (cod_ibge, ano, meta_primario, resultado_primario, meta_nominal, resultado_nominal, receita_prim_prev, receita_prim_real…) |
| `municipios` | 26 | 9 (id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito…) |
| `orgaos_municipais_sc` | 872 | 2 (cod_ibge, cnpj) |
| `orgaos_sc_feitos` | 295 | 1 (cod_ibge) |
| `pca_sc` | 10 | 6 (cod_ibge, n_itens, valor_total, por_categoria, por_ano, top) |
| `pca_sc_feitos` | 79 | 2 (cod_ibge, n) |
| `rgf_sc` | 1.270 | 10 (cod_ibge, ano, pessoal_pct, pessoal_valor, limite_pct, rcl_ajustada, dcl_valor, dcl_pct…) |
| `rreo_const_sc` | 1.268 | 9 (cod_ibge, ano, educacao_pct, educacao_min, educacao_valor, fundeb_pct, rcl, saude_pct…) |
| `siops_sc` | 1.475 | 5 (cod_ibge, ano, saude_pct, saude_valor, saude_min) |
| `transferencias_sc` | 295 | 8 (cod_ibge, n_instrumentos, valor_total, valor_liberado, por_situacao, por_orgao, top, por_ano) |

## 2. Coleta (ETLs e scripts)

| Script | O que faz |
|---|---|
| `scripts/_reset_pca_feitos.mjs` | Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT). |
| `scripts/auditoria_dados_sc.mjs` | Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada). Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_ |
| `scripts/backup_neon.mjs` | Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored). Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump |
| `scripts/diagnostico_gestor.mjs` | MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis. Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso). Regras ancoradas e |
| `scripts/etl_orquestrador.mjs` | ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental, idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrado |
| `scripts/gerar_documentacao.mjs` | Gerador de documentação automática do sistema PNIGP. Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta e tarefas agendadas  |
| `scripts/ingest_compras_sc.mjs` | Fase 2 — Compras OFICIAIS (PNCP) de Santa Catarina, agregadas por ente no banco. Para cada ente de entes_sc: contratações 2024 (PNCP), esfera municipal (ou estadual), principais mo |
| `scripts/ingest_contratos_sc.mjs` | ETL — Contratos ASSINADOS do PNCP por município de SC, conectados ao processo licitatório. Descobre os CNPJs dos órgãos municipais (via contratações esfera M) e puxa /contratos?cnp |
| `scripts/ingest_indicadores_sc.mjs` | ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita). Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, un |
| `scripts/ingest_itens_sc.mjs` | ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon. Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd, unitário |
| `scripts/ingest_metas_fiscais_sc.mjs` | ETL — Metas Fiscais (LDO) REAIS via SICONFI (RREO Anexo 06: Resultado Primário e Nominal). Meta fixada no Anexo de Metas Fiscais da LDO × resultado realizado, por ente e ano. node  |
| `scripts/ingest_pca_sc.mjs` | ETL — PCA (Plano Anual de Contratações) do PNCP por município de SC. Descobre os CNPJs dos órgãos municipais (contratações esfera M) e puxa /pca/atualizacao?cnpj= de cada (o filtro |
| `scripts/ingest_rgf_sc.mjs` | ETL — RGF (Relatório de Gestão Fiscal, SICONFI): número OFICIAL de pessoal por Poder (Executivo) e Dívida Consolidada Líquida. Anexo 01 = DTP % sobre RCL Ajustada (limites LRF); An |
| `scripts/ingest_rreo_constitucional_sc.mjs` | ETL — RREO constitucional (SICONFI): Educação MDE (Anexo 14, % aplicado real), RCL (Anexo 03, TOTAL últimos 12 meses → base legal do limite de pessoal da LRF) e tentativa de Saúde  |
| `scripts/ingest_sc.mjs` | Ingestão de dados OFICIAIS de Santa Catarina (SICONFI/Tesouro) para o banco. 295 municípios (lista IBGE) + Estado de SC. Anos 2021–2024. RREO Anexos 01 e 02. Idempotente (UPSERT).  |
| `scripts/ingest_siops_sc.mjs` | ETL — SIOPS (Saúde): % da receita própria aplicada em ASPS conforme LC 141 (mínimo constitucional 15%). Fonte oficial: API pública SIOPS/Min. Saúde (indicador 3.2). co_municipio =  |
| `scripts/ingest_transferencias_sc.mjs` | Ingestão de Transferências da União / Convênios (Transferegov) via Portal da Transparência (CGU). Requer PORTAL_TRANSPARENCIA_KEY no .env.local. Idempotente (UPSERT por município). |
| `scripts/recover_dca.mjs` | Recuperação dos municípios SC sem RREO: usa a DCA (Declaração de Contas Anuais) do SICONFI. DCA-Anexo I-C (receita), I-D (despesa por categoria), I-E (despesa por função). node scr |
| `scripts/seed.mjs` | PNIGP — Seed de dados simulados realistas (Painel do Prefeito) Gera municípios, indicadores setoriais, série histórica, índices e metas. Uso: node scripts/seed.mjs   (lê DATABASE_U |
| `scripts/seed_compras.mjs` | PNIGP — Seed de Compras Públicas (municípios + estados). Métricas inspiradas no PNCP / Compras Gov, correlacionadas ao ICEB do ente. Uso: node scripts/seed_compras.mjs |
| `scripts/seed_contratacoes.mjs` | PNIGP — Seed de Contratações Públicas (estilo PNCP) — municípios + estados. Gera licitações/contratos individuais por ente. Uso: node scripts/seed_contratacoes.mjs |
| `scripts/seed_estados.mjs` | PNIGP — Seed de dados estaduais simulados (Painel do Governador) Reutiliza as definições da tabela `indicadores`. Uso: node scripts/seed_estados.mjs |
| `scripts/seed_financas.mjs` | PNIGP — Seed de Finanças Públicas (receitas e despesas) — municípios + estados. Inspirado no SICONFI/FINBRA. Valores em R$, correlacionados ao ICEB e à população. Uso: node scripts |
| `scripts/supervisor_coleta.mjs` | SUPERVISOR auto-recuperável da coleta PNCP/SC. Um único processo é dono do ciclo de vida: roda cada ETL como filho, monitora o PROGRESSO REAL no Neon e, se estagnar (sem avanço por |
| `scripts/validacao_continua.mjs` | VALIDAÇÃO CONTÍNUA — auditor independente do coletor (só lê + flaga, nunca atrapalha a coleta). A cada INTERVALO: aplica regras de integridade, marca anomalias IMPOSSÍVEIS como sus |
| `scripts/validar_consistencia.mjs` | Validação de consistência/integridade dos dados oficiais (SC) após os ETLs. Cobertura por base, duplicatas (vazamento de CNPJ compartilhado), conexões, e amostra planejado × contra |
| `scripts/warm_compras.mjs` | Pré-aquece o cache de compras (PNCP) das maiores cidades de SC + Estado, chamando a API de produção sequencialmente (usa o IP do Vercel). node scripts/warm_compras.mjs |

## 3. Fontes de dados (catálogo de coleta)

| Fonte | Provedor | Ano + recente | Última coleta | Situação |
|---|---|---|---|---|
| Transferências (CGU) | cgu | — | nunca | pendente |
| Indicadores (IBGE/CGU) | ibge | 2024 | nunca | pendente |
| Compras (PNCP ano corrente) | pncp | 2026 | nunca | pendente |
| Contratos (PNCP ano corrente, append) | pncp | 2026 | nunca | pendente |
| PCA (PNCP) | pncp | — | nunca | pendente |
| Finanças (SICONFI RREO an.1/2) | siconfi | 2025 | nunca | pendente |
| Metas Fiscais LDO (RREO an.6) | siconfi | 2025 | nunca | em dia |
| Pessoal/DCL (RGF) | siconfi | 2025 | nunca | em dia |
| Educação/RCL (RREO an.14/3) | siconfi | 2025 | nunca | em dia |
| Saúde ASPS (SIOPS) | siops | 2025 | nunca | em dia |

## 4. Rotas e APIs (Next.js)

- `/`
- `/api/coleta-status`
- `/api/compras-item/[cnpj]/[ano]/[seq]`
- `/api/compras-sc/[codigo]`
- `/api/contratos-processo/[cnpj]/[ano]/[seq]`
- `/api/etl-catalogo`
- `/api/transferencias-sc/[codigo]`
- `/cidadao`
- `/cidadao/[codigo]`
- `/coleta`
- `/etl`
- `/governador`
- `/governador/[uf]`
- `/governador/[uf]/gestao`
- `/painel`
- `/painel/[codigo]`
- `/painel/[codigo]/gestao`
- `/real`
- `/real/[codigo]`
- `/relatorio/estado/[uf]`
- `/relatorio/municipio/[codigo]`

## 5. Automação agendada (Agendador do Windows)

- **PNIGP-ETL-Diario** — `scripts/etl_orquestrador.cmd` — diário 03:30. Detecta novidade por fonte e coleta só o que falta (supervisionado: religa estagnação/crash).
- **PNIGP-Auditor-QA** — `scripts/validacao_continua.cmd` — a cada 5 min. Valida integridade e flag de registros suspeitos.
- **Backup** — `scripts/backup_neon.mjs` (dump local seguro) + Neon PITR nativo.

## 6. Integridade (última validação)

- status: **ok** · registros suspeitos (excluídos): 6 · sobrepreço unitário: 0

---
*Documentação viva — regenerada a cada coleta diária. Fontes oficiais: PNCP, SICONFI, SIOPS, IBGE, CGU.*
