# PNIGP — Documentação do Sistema (gerada automaticamente)

> Gerada em 2026-06-22 por `scripts/gerar_documentacao.mjs`. Reflete o estado real do código e do banco. **Não editar à mão.**

## 1. Banco de dados (Neon)

| Tabela | Registros | Colunas |
|---|---|---|
| `atas_check` | 744 | 3 (cnpj_orgao, checado, n) |
| `atas_sc` | 36.203 | 12 (numero_controle_ata, cod_ibge, cnpj_orgao, ano_ata, numero_ata, numero_controle_compra, vigencia_inicio, vigencia_fim…) |
| `captacao_transferegov_sc` | 1.318 | 11 (id_plano, cod_ibge, uf, id_programa, situacao, valor_total_repasse, valor_voluntario, valor_total…) |
| `cauc_sc` | 296 | 7 (cod_ibge, data_pesquisa, apto, n_pendencias, pendencias, grupos_pendentes, atualizado) |
| `censo_matricula_sc` | 3.256 | 4 (cod_ibge, ano, etapa, matriculas) |
| `cnes_sc` | 295 | 10 (cod_ibge, total, sus_amb, hospitalar, cirurgico, obstetrico, neonatal, por_tipo…) |
| `cnpj_loc` | 19.673 | 10 (cnpj, razao_social, municipio, uf, atualizado, situacao, situacao_motivo, abertura…) |
| `coleta_heartbeat` | 1 | 6 (id, ts, progresso, etapa, reinicios, msg) |
| `coleta_qa` | 1 | 6 (id, ts, status, suspeitos, alertas, regras) |
| `compras_publicas` | 106 | 11 (ente_tipo, ente_id, ano, valor_contratado_pc, pct_pregao_eletronico, pct_dispensa, economia_pregao, fornecedores_mil…) |
| `compras_sc` | 1.077 | 9 (cod_ibge, ano, n_contratos, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade…) |
| `compras_sc_vazios` | 247 | 1 (cod_ibge) |
| `contratacoes` | 1.035 | 13 (id, ente_tipo, ente_id, numero, objeto, orgao, modalidade, valor_estimado…) |
| `contratos_sc` | 765.146 | 14 (id, cod_ibge, numero_controle_compra, cnpj_compra, ano_compra, seq_compra, fornecedor, ni_fornecedor…) |
| `contratos_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `contratos_sc_feitos_inc` | 295 | 2 (cod_ibge, n) |
| `despesa_sub_check` | 1.184 | 2 (cod_ibge, ano) |
| `despesa_subfuncao_sc` | 31.273 | 5 (cod_ibge, ano, funcao, subfuncao, empenhado) |
| `empenhos_check` | 189 | 5 (cnpj_compra, ano_compra, seq_compra, checado, n) |
| `empenhos_sc` | 0 | 10 (cod_ibge, cnpj_compra, ano_compra, seq_compra, seq_empenho, numero, valor, data…) |
| `entes_sc` | 296 | 6 (cod_ibge, nome, uf, tipo, populacao, pop_indigena) |
| `estado_indicador_valores` | 2.160 | 4 (estado_id, indicador_id, ano, valor) |
| `estados` | 27 | 8 (id, uf, nome, regiao, populacao, capital, governador, pib_per_capita) |
| `etl_catalogo` | 31 | 10 (id, label, api, max_ano, ultima_exec, ultimo_status, devido, msg…) |
| `financas` | 106 | 19 (ente_tipo, ente_id, ano, receita_total, rec_tributaria, rec_transferencias, rec_outras, despesa_total…) |
| `financas_sc` | 1.969 | 23 (cod_ibge, ano, receita, receita_prevista, tributaria, transferencias, outras, despesa…) |
| `fnde_simad_check` | 3.620 | 3 (cod_ibge, ano, n) |
| `fnde_simad_sc` | 75.592 | 12 (cod_ibge, ano, data_pgto, ob, valor, parcela, programa, cnpj_recebedor…) |
| `fns_repasse_sc` | 45.606 | 8 (cod_ibge, ano, bloco_cod, bloco_nome, area_cod, area_nome, vl_total, vl_liquido) |
| `ideb_sc` | 15.250 | 7 (cod_ibge, ano, etapa, rede, ideb, meta, nota_saeb) |
| `iegm_sc` | 4.039 | 5 (cod_ibge, ano, indicador, pct, faixa) |
| `indicador_valores` | 2.080 | 4 (municipio_id, indicador_id, ano, valor) |
| `indicadores` | 16 | 8 (id, codigo, nome, area, unidade, fonte, direcao_melhor, descricao) |
| `indicadores_sc` | 4.672 | 7 (cod_ibge, ano, codigo, area, valor, unidade, fonte) |
| `indices_pnigp` | 130 | 9 (municipio_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `indices_pnigp_estados` | 135 | 9 (estado_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `itens_proc_feitos` | 78.481 | 3 (numero_controle, n, feito_em) |
| `itens_sc` | 1.193.373 | 19 (cod_ibge, cnpj, ano, seq, numero, descricao, unidade, quantidade…) |
| `itens_sc_feitos` | 0 | 2 (cod_ibge, ano) |
| `metas` | 130 | 6 (id, municipio_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_estados` | 135 | 6 (id, estado_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_fiscais_feitos` | 2.072 | 2 (cod_ibge, ano) |
| `metas_fiscais_sc` | 1.417 | 12 (cod_ibge, ano, meta_primario, resultado_primario, meta_nominal, resultado_nominal, receita_prim_prev, receita_prim_real…) |
| `municipios` | 26 | 9 (id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito…) |
| `orgaos_municipais_sc` | 872 | 2 (cod_ibge, cnpj) |
| `orgaos_sc_feitos` | 295 | 1 (cod_ibge) |
| `pca_sc` | 67 | 6 (cod_ibge, n_itens, valor_total, por_categoria, por_ano, top) |
| `pca_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `previne_sc` | 5.310 | 7 (cod_ibge, competencia, indicador, ind_nome, numerador, denominador, pct) |
| `processos_feitos` | 54 | 4 (modalidade, ano, n, concluido_em) |
| `processos_sc` | 78.481 | 12 (numero_controle, cod_ibge, cnpj_orgao, ano, sequencial, modalidade_id, modalidade, objeto…) |
| `programas_catalogo` | 740 | 10 (id_programa, nome_programa, orgao, modalidade, natureza, uf, ano, dt_ini_prop…) |
| `programas_transferegov` | 124 | 23 (id_programa, modulo, nome, orgao, modalidade, situacao, valor_global, uf…) |
| `radar_captacao_sc` | 1.359 | 8 (cod_ibge, id_programa, nome_programa, orgao, modalidade, dt_ini_prop, dt_fim_prop, situacao) |
| `receitas_det_check` | 1.480 | 2 (cod_ibge, ano) |
| `receitas_detalhe_sc` | 15.160 | 4 (cod_ibge, ano, item, valor) |
| `rgf_sc` | 1.270 | 10 (cod_ibge, ano, pessoal_pct, pessoal_valor, limite_pct, rcl_ajustada, dcl_valor, dcl_pct…) |
| `rpps_atuarial_sc` | 418 | 5 (cod_ibge, exercicio, deficit_atuarial, ativos, no_ente) |
| `rpps_check` | 1.480 | 2 (cod_ibge, ano) |
| `rpps_sc` | 329 | 9 (cod_ibge, ano, receita, despesa, resultado, contrib_segurados, contrib_patronais, aposentadorias…) |
| `rreo_const_sc` | 1.268 | 9 (cod_ibge, ano, educacao_pct, educacao_min, educacao_valor, fundeb_pct, rcl, saude_pct…) |
| `saude_producao_sc` | 1.463 | 6 (cod_ibge, ano, internacoes, valor_internacoes, sia_qtd, sia_valor) |
| `serie_anotacao` | 0 | 6 (id, escopo, cod_ibge, ano, texto, criado) |
| `siops_sc` | 1.475 | 9 (cod_ibge, ano, saude_pct, saude_valor, saude_min, transf_saude_pct, transf_uniao_pct, transf_saude_valor…) |
| `transferencias_sc` | 295 | 8 (cod_ibge, n_instrumentos, valor_total, valor_liberado, por_situacao, por_orgao, top, por_ano) |

## 2. Coleta (ETLs e scripts)

| Script | O que faz |
|---|---|
| `scripts/_reset_pca_feitos.mjs` | Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT). |
| `scripts/_uf.mjs` | Config central de UF para os ETLs. Define o estado-alvo da coleta via env UF (padrão SC). Para coletar outro estado: UF=PR node scripts/ingest_*.mjs |
| `scripts/auditoria_dados_sc.mjs` | Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada). Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_ |
| `scripts/backup_neon.mjs` | Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored). Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump |
| `scripts/diagnostico_gestor.mjs` | MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis. Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso). Regras ancoradas e |
| `scripts/etl_orquestrador.mjs` | ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental, idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrado |
| `scripts/etl_pagina_sync.mjs` | Sincroniza a PÁGINA DE COLETA (/etl) com a realidade do banco: conta registros reais por fonte, reflete progresso ao vivo do harvest (processos/itens) e atualiza etl_catalogo (msg/ |
| `scripts/gerar_documentacao.mjs` | Gerador de documentação automática do sistema PNIGP. Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta e tarefas agendadas  |
| `scripts/ingest_atas_sc.mjs` | ETL — Atas de Registro de Preço (PNCP, API de Consulta /v1/atas) por órgão de SC. Traz preços registrados + vínculo à compra (numeroControlePNCPCompra). Idempotente/resumível por ó |
| `scripts/ingest_cauc_sc.mjs` | ETL — CAUC (Sistema de Informações sobre Requisitos Fiscais) por município/Estado de SC. Fonte: CSV oficial do Tesouro Transparente (CAUC lê o CADIN diariamente). Mostra se o ente  |
| `scripts/ingest_censo_sc.mjs` | ETL — Censo Escolar (INEP): matrículas por município/etapa. Fonte: Sinopse Estatística da Educação Básica. Tabela 1.1 (sheet7): Matrículas da Educação Básica por Etapa, segundo UF  |
| `scripts/ingest_cnes_sc.mjs` | ETL — CNES (rede de saúde instalada) por município de SC. Fonte: API dados abertos do Min. Saúde. Agrega por município: nº de estabelecimentos, atende SUS, atendimento hospitalar,  |
| `scripts/ingest_cnpj_loc.mjs` | ETL — resolve UF/município dos FORNECEDORES vencedores (PNCP não fornece; usamos o CNPJ). Fonte: minhareceita.org (base Receita Federal). Cache em cnpj_loc, idempotente/resumível,  |
| `scripts/ingest_compras_sc.mjs` | Fase 2 — Compras OFICIAIS (PNCP) de Santa Catarina, agregadas por ente no banco. Para cada ente de entes_sc: contratações 2024 (PNCP), esfera municipal (ou estadual), principais mo |
| `scripts/ingest_contratos_sc.mjs` | ETL — Contratos ASSINADOS do PNCP por município de SC, conectados ao processo licitatório. Descobre os CNPJs dos órgãos municipais (via contratações esfera M) e puxa /contratos?cnp |
| `scripts/ingest_convenios_sc.mjs` | ETL — Convênios captados pelos municípios (Portal da Transparência, dado do Transferegov). "Quanto cada prefeitura captou" → base p/ benchmark vs pares (o ponto cego da captação).  |
| `scripts/ingest_despesa_subfuncao_sc.mjs` | ETL — Despesa por FUNÇÃO → SUBFUNÇÃO (drill real: Atenção Básica, Ensino Fundamental…) via SICONFI RREO Anexo 02. Hierarquia é por ordem: linha de função (lista oficial) e depois s |
| `scripts/ingest_empenhos_sc.mjs` | ETL — Empenhos por contrato (PNCP, Lei 14.133). Endpoint /contratos/{ano}/{seq}/empenhos. Hoje a cobertura em SC é ~0 (municípios ainda não publicam o ciclo), mas o coletor "acende |
| `scripts/ingest_entes_uf.mjs` | ETL — carrega os ENTES (municípios + governo estadual) de qualquer UF na tabela entes_sc. Fonte: IBGE (localidades + população estimada). Pré-requisito para coletar um novo estado. |
| `scripts/ingest_fnde_simad.mjs` | ETL — FNDE/SIMAD liberações por município (educação). Browser-only (WAF F5 bloqueia curl) → Playwright headless. Fluxo: form (tp vazio) → LISTA DE ENTIDADES → enviarFormulario(cnpj |
| `scripts/ingest_fns_sc.mjs` | ETL — Repasses federais fundo-a-fundo do FNS por bloco/área, por município de SC. Fonte: API REST da Consulta Consolidada do FNS (consultafns.saude.gov.br) — descoberta via app Ang |
| `scripts/ingest_ideb_sc.mjs` | ETL — IDEB por município (INEP) — série histórica + observado × meta (projeção) + nota SAEB. Fonte oficial: download.inep.gov.br/ideb/resultados/  (XLSX dentro de ZIP). Parser XLSX |
| `scripts/ingest_iegm_sc.mjs` | ETL — IEGM (Índice de Efetividade da Gestão Municipal) do TCE-SC, por município, via IRB. Fonte: iegm.irbcontas.org.br/dados_abertos/{ano}/calculo/calculo_iegm_{ano}_TCESC_completo |
| `scripts/ingest_indicadores_sc.mjs` | ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita). Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, un |
| `scripts/ingest_indigena_sc.mjs` | ETL — população indígena por município de SC (IBGE Censo 2022, SIDRA tabela 9605, cor/raça Indígena). Fonte sólida e agregada por município (a saúde indígena é responsabilidade com |
| `scripts/ingest_itens_sc.mjs` | ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon. Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd, unitário |
| `scripts/ingest_metas_fiscais_sc.mjs` | ETL — Metas Fiscais (LDO) REAIS via SICONFI (RREO Anexo 06: Resultado Primário e Nominal). Meta fixada no Anexo de Metas Fiscais da LDO × resultado realizado, por ente e ano. node  |
| `scripts/ingest_nf_sc.mjs` | ETL — Notas Fiscais / Instrumentos de Cobrança (PNCP, API de Consulta /v1/instrumentoscobranca). Traz chave NFe + vínculo ao contrato. Hoje cobertura em SC ~0 (municípios não publi |
| `scripts/ingest_pca_sc.mjs` | ETL — PCA (Plano Anual de Contratações) do PNCP por município de SC. Descobre os CNPJs dos órgãos municipais (contratações esfera M) e puxa /pca/atualizacao?cnpj= de cada (o filtro |
| `scripts/ingest_previne_sc.mjs` | ETL — Previne Brasil (indicadores de desempenho da APS / SISAB) por município de SC. Fonte: CSV oficial por quadrimestre (Portal de Dados Abertos do SUS, S3). Agrega numerador/deno |
| `scripts/ingest_processos_sc.mjs` | ETL — TODOS os processos de contratação do PNCP em SC (todas as modalidades, todos os anos). Fonte: API Consulta /v1/contratacoes/publicacao (exige codigoModalidadeContratacao; lim |
| `scripts/ingest_radar_captacao_sc.mjs` | ETL — Radar de Captação (Transferegov/SICONV): PROGRAMAS que cada município pode captar (elegibilidade) + janela de proposta aberta. Fonte: repositorio.dados.gov.br/seges/detru (CS |
| `scripts/ingest_receitas_detalhe_sc.mjs` | ETL — Receitas DETALHADAS por item nominal (IPTU, ISS, FPM, ICMS, IPVA, ITR, FUNDEB) via SICONFI RREO Anexo 03 (Demonstrativo da RCL). Soma os 12 meses (colunas <MR-11..MR>) = tota |
| `scripts/ingest_rgf_sc.mjs` | ETL — RGF (Relatório de Gestão Fiscal, SICONFI): número OFICIAL de pessoal por Poder (Executivo) e Dívida Consolidada Líquida. Anexo 01 = DTP % sobre RCL Ajustada (limites LRF); An |
| `scripts/ingest_rpps_atuarial_sc.mjs` | ETL — Déficit ATUARIAL dos RPPS (projeção de longo prazo) via CADPREV (SPREV). Fonte: apicadprev.trabalho.gov.br /DRAA_VALORES_COMPROMISSOS (item "Déficit Atuarial" + ativos garant |
| `scripts/ingest_rpps_sc.mjs` | ETL — Previdência (RPPS) por município/Estado de SC. Fonte: SICONFI RREO Anexo 04. Receitas × despesas previdenciárias, resultado do fundo, contribuições e benefícios. Só entes COM |
| `scripts/ingest_rreo_constitucional_sc.mjs` | ETL — RREO constitucional (SICONFI): Educação MDE (Anexo 14, % aplicado real), RCL (Anexo 03, TOTAL últimos 12 meses → base legal do limite de pessoal da LRF) e tentativa de Saúde  |
| `scripts/ingest_sc.mjs` | Ingestão de dados OFICIAIS de Santa Catarina (SICONFI/Tesouro) para o banco. 295 municípios (lista IBGE) + Estado de SC. Anos 2021–2024. RREO Anexos 01 e 02. Idempotente (UPSERT).  |
| `scripts/ingest_sia_sc.mjs` | ETL — PRODUÇÃO ambulatorial (SIA/SUS) por município de SC, via TabNet/DATASUS. Qtd. aprovada e valor aprovado, por ano. Mesma técnica do SIH (tabcgi.exe, latin1, filtros TODAS_AS_C |
| `scripts/ingest_sih_sc.mjs` | ETL — PRODUÇÃO hospitalar (SIH/SUS) por município de SC, via TabNet/DATASUS. Internações e valor total, por ano (soma das 12 competências). 1 requisição traz todos os municípios. F |
| `scripts/ingest_siops_sc.mjs` | ETL — SIOPS (Saúde): % da receita própria aplicada em ASPS conforme LC 141 (mínimo constitucional 15%). Fonte oficial: API pública SIOPS/Min. Saúde (indicador 3.2). co_municipio =  |
| `scripts/ingest_transferegov_api.mjs` | ETL — Transferegov API VIVA (PostgREST, fonte original autoritativa). Substitui o dump histórico do SICONV. 1) programas_transferegov: catálogo de programas + janela de proposta vo |
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

## 2b. Componentes (visões e molde do produto)

| Componente | O que faz |
|---|---|
| `accountability-aps.tsx` | Calendário legal de prestação de contas (obrigações reais — base neutra, sem juízo). |
| `assunto-atencao-primaria.tsx` | o que o numerador conta (a "produção" de cada indicador) |
| `assunto-captacao.tsx` | índice de criticidade da oportunidade por prazo até o fim da janela (urgência de agir) |
| `assunto-iegm.tsx` | conhecimento de cada dimensão (o que mede + como melhorar + cruzamento com nossos dados) |
| `atas-painel.tsx` | Atas de Registro de Preço — visão própria (preço registrado + quantidade máxima; gasto real = empenhos contra a ata). |
| `base-metodologica.tsx` | Base metodológica de uma área: marcos legais + biblioteca de materiais oficiais (modelo de Compras). |
| `brand.tsx` | Marca PNIGP — monograma próprio (arcos concêntricos = inteligência/radar territorial 360°). |
| `cabecalho-area.tsx` | Cabeçalho FRACTAL de área: repete o padrão de camadas (Estratégico→Tático→Operacional) dentro do bloco. |
| `charts/area-empilhada.tsx` | Área empilhada — leitura de COMPOSIÇÃO ao longo do tempo (distinta da linha, que mostra trajetória). |
| `contratos-gestao.tsx` | Índice de criticidade do vencimento — combina URGÊNCIA do prazo (70%) e MAGNITUDE do valor (30%). |
| `fnde-educacao-card.tsx` | Recursos federais da educação (FNDE/SIMAD) recebidos pelo município — PNAE, PNATE, FUNDEB, salário-educação… |
| `folha-sc.tsx` | Limites LRF do Executivo (% sobre a RCL): alerta 48,6 · prudencial 51,3 · máximo 54 |
| `ideb-painel.tsx` | Painel do IDEB — observado × meta + série histórica. Exibição neutra e pedagógica. |
| `matriculas-card.tsx` | Matrículas (Censo Escolar) — a "produção" da cadeia da educação (💰 financiamento → 🏭 matrículas → ❤️ IDEB). |
| `panel-tabs.tsx` | ao trocar de grupo, abre a 1ª sub-aba dele |
| `placar-estrategico.tsx` | liga a ação (Estratégico) ao lugar onde ela se executa (Tático/Operacional) — coordenação visível |
| `repasses-saude-ficha.tsx` | Programas/repasses da saúde no MOLDE do Previne: o que é · por que importa · série · como melhorar. |
| `resumo-executivo.tsx` | separa conformidade (legal) de desempenho (relativo): conformidade OK + posição ruim NÃO é "tudo bem" |
| `termo.tsx` | Glossário central — explica siglas/jargão para o gestor não-técnico (público-alvo do PNIGP). |

## 3. Fontes de dados (catálogo de coleta)

| Fonte | Provedor | Ano + recente | Última coleta | Situação |
|---|---|---|---|---|
| Déficit atuarial RPPS (CADPREV/DRAA) | cadprev | — | há 2d | em dia |
| Transferências (CGU) | cgu | — | há 2d | em dia |
| CNES — rede de saúde (Min. Saúde) | cnes | 2026 | há 2d | em dia |
| Previne Brasil — indicadores APS (SISAB) | datasus | — | há 2d | em dia |
| SIA — produção ambulatorial (DATASUS) | datasus | 2025 | há 2d | em dia |
| SIH — produção hospitalar (DATASUS) | datasus | 2025 | há 2d | em dia |
| Repasses federais FNS por bloco (Consulta Consolidada) | fns | 2026 | há 2d | em dia |
| Indicadores (IBGE/CGU) | ibge | 2024 | há 2d | em dia |
| População indígena (IBGE Censo 2022) | ibge | — | há 2d | em dia |
| Censo Escolar — matrículas (INEP Sinopse) | inep | 2025 | há 0h | pendente |
| IDEB — indicadores educacionais (INEP) | inep | 2025 | há 0h | pendente |
| IEGM — qualidade da gestão (TCE-SC/IRB, dados abertos) | irb | 2025 | nunca | em dia |
| Atas de Registro de Preço (PNCP Consulta) | pncp | — | há 2d | em dia |
| Compras (PNCP ano corrente) | pncp | 2026 | há 2d | em dia |
| Contratos (PNCP ano corrente, append) | pncp | 2026 | há 2d | em dia |
| Empenhos por contrato (PNCP Lei 14.133 — acende quando publicarem) | pncp | — | há 2d | em dia |
| Itens de TODOS os processos (preço unitário) | pncp | 2025 | há 2d | em dia |
| Notas fiscais / instrumentos de cobrança (PNCP — acende quando publicarem) | pncp | — | há 2d | em dia |
| PCA (PNCP) | pncp | — | há 2d | em dia |
| Processos PNCP — TODOS (todas modalidades/anos) | pncp | 2025 | há 2d | em dia |
| Localidade dos fornecedores (CNPJ→UF/município) | receita | — | há 2d | em dia |
| Despesa por subfunção (RREO an.2 — drill) | siconfi | 2025 | há 1d | em dia |
| Finanças (SICONFI RREO an.1/2) | siconfi | 2025 | há 2d | em dia |
| Metas Fiscais LDO (RREO an.6) | siconfi | 2025 | há 2d | em dia |
| Receitas detalhadas (ICMS/FPM/IPTU/FUNDEB — RREO an.3) | siconfi | 2025 | há 1d | em dia |
| Pessoal/DCL (RGF) | siconfi | 2025 | há 2d | em dia |
| Previdência RPPS (RREO Anexo 04) | siconfi | 2025 | há 2d | em dia |
| Educação/RCL (RREO an.14/3) | siconfi | 2025 | há 2d | em dia |
| Saúde ASPS (SIOPS) | siops | 2025 | há 2d | em dia |
| Regularidade fiscal CAUC/CADIN (Tesouro) | tesouro | — | há 2d | em dia |
| Radar de Captação — programas + planos (Transferegov fundo a fundo, API viva) | transferegov | 2025 | há 2h | pendente |

## 4. Rotas e APIs (Next.js)

- `/`
- `/api/coleta-status`
- `/api/compras-item/[cnpj]/[ano]/[seq]`
- `/api/compras-sc/[codigo]`
- `/api/contratos-processo/[cnpj]/[ano]/[seq]`
- `/api/etl-catalogo`
- `/api/plano-trabalho`
- `/api/serie-anotacao`
- `/api/transferencias-sc/[codigo]`
- `/catalogo-dados`
- `/cidadao`
- `/cidadao/[codigo]`
- `/coleta`
- `/dados-municipais`
- `/estrategia`
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
- `/solucoes`

## 5. Automação agendada (Agendador do Windows)

- **PNIGP-ETL-Diario** — `scripts/etl_orquestrador.cmd` — diário 03:30. Detecta novidade por fonte e coleta só o que falta (supervisionado: religa estagnação/crash).
- **PNIGP-Auditor-QA** — `scripts/validacao_continua.cmd` — a cada 5 min. Valida integridade e flag de registros suspeitos.
- **Backup** — `scripts/backup_neon.mjs` (dump local seguro) + Neon PITR nativo.

## 6. Integridade (última validação)

- status: **ok** · registros suspeitos (excluídos): 6 · sobrepreço unitário: 11779

## 7. Fontes oficiais dos dados (proveniência)

| Domínio | Fonte oficial | Acesso |
|---|---|---|
| Finanças (receita, despesa, MDE, ASPS, RCL, dívida, subfunção) | SICONFI / Tesouro Nacional (RREO/RGF) | apidatalake.tesouro.gov.br/ords/siconfi |
| Receitas nominais (IPTU, ISS, FPM, ICMS, IPVA, FUNDEB) | SICONFI RREO Anexo 03 | idem |
| Compras (processos, contratos, itens, atas) | PNCP — Portal Nacional de Contratações Públicas | pncp.gov.br/api |
| Saúde — repasses federais por bloco | Fundo Nacional de Saúde (FNS) | consultafns.saude.gov.br |
| Saúde — Atenção Primária (Previne) | SISAB / Previne Brasil (Min. Saúde) | sisab S3 (dados abertos SUS) |
| Saúde — produção MAC (internações/ambulatorial) | SIH/SIA-SUS (DATASUS) | datasus / TabNet |
| Saúde — rede | CNES (Min. Saúde) | cnes.datasus.gov.br |
| Previdência — déficit atuarial RPPS | CADPREV / SPREV | apicadprev.trabalho.gov.br |
| Educação — MDE/FUNDEB | SICONFI RREO Anexo 08 | idem SICONFI |
| Regularidade fiscal (CAUC/CADIN) | Tesouro Transparente | tesourotransparente.gov.br |
| Indicadores socioeconômicos | IBGE (Censo 2022, PIB) / CGU | ibge.gov.br |

## 8. Conceitos do produto

- **Molde 4 visões** (padrão de todo programa/assunto): *Estratégico* (como está/por que importa) · *Tático* (do que é feito/gargalo) · *Operacional* (como melhorar) · *Técnico* (série + cálculo + fonte).
- **Cadeia de valor** 💰→🏭→❤️: Dinheiro → Produção → Benefício (ex.: APS, MAC) — mostra onde a cadeia se sustenta ou se rompe.
- **Accountability**: Responsável · Compromisso × Entregue (lacuna) · Regularidade (CAUC) · Calendário legal de prestação · Evidência. Registro local auditável p/ causa real.
- **Diário de gestão**: cada variação (evento) → causa provável (metodologia) → o que fazer; gestor confere e registra a causa real.
- **Níveis de gestão** (organização do conteúdo) e **multi-UF** (um motor, configurado por estado: TCE/TCM variam) — ver `docs/arquitetura-multi-uf.md`.
- **Tom**: neutro/didático, explica a metodologia; sem crítica nem viés político. Honesto sobre fato × hipótese × lacuna de dado.

---
*Documentação viva — regenerada a cada coleta diária. Fontes oficiais: PNCP, SICONFI, FNS, CADPREV, DATASUS, INEP, IBGE, Tesouro.*
