# PNIGP — Documentação do Sistema (gerada automaticamente)

> Gerada em 2026-07-04 por `scripts/gerar_documentacao.mjs`. Reflete o estado real do código e do banco. **Não editar à mão.**

## 1. Banco de dados (Neon)

| Tabela | Registros | Colunas |
|---|---|---|
| `_legado_emendas_sc` | 906 | 15 (id_proposta, nr_emenda, cod_ibge, municipio, parlamentar, tipo_parlamentar, impositivo, programa…) |
| `acesso_financeiro_sc` | 295 | 13 (cod_ibge, competencia, n_agencias, n_bancos, n_postos_coop, n_cooperativas, n_postos_outros, n_correspondentes…) |
| `acompanhamento_funcao_sc` | 4.178 | 7 (cod_ibge, ano, bimestre, funcao, dotacao, empenhado, atualizado) |
| `acompanhamento_sc` | 244 | 8 (cod_ibge, ano, bimestre, receita_prevista, receita_realizada, despesa_dotacao, despesa_empenhada, atualizado) |
| `agropecuaria_sc` | 295 | 9 (cod_ibge, ano, estab_total, estab_familiar, estab_nao_familiar, area_total_ha, area_familiar_ha, area_nao_familiar_ha…) |
| `anp_precos_sc` | 3.369 | 7 (cod_ibge, ano, semestre, produto, preco_medio, n_coletas, atualizado) |
| `ans_cobertura_sc` | 295 | 8 (cod_ibge, ano, benef_medica, benef_total, populacao, taxa_cobertura, atualizado, pop_ano) |
| `assistencia_repasse_sc` | 6.177 | 7 (cod_ibge, ano, fnas_total, fnas_psb, fnas_pse, meses, atualizado_em) |
| `assistencia_social_sc` | 295 | 24 (cod_ibge, municipio, anomes_ref, populacao, cras, creas, acolhimento, hab_por_cras…) |
| `atas_check` | 757 | 3 (cnpj_orgao, checado, n) |
| `atas_sc` | 40.937 | 12 (numero_controle_ata, cod_ibge, cnpj_orgao, ano_ata, numero_ata, numero_controle_compra, vigencia_inicio, vigencia_fim…) |
| `bancada_estadual_sc` | 40 | 11 (id, nome, partido, votos_total, situacao, atualizado, emendas_total, foto_url…) |
| `bancada_federal_sc` | 19 | 11 (id, casa, cod_externo, nome, partido, uf, email, telefone…) |
| `bndes_sc` | 8.893 | 5 (cod_ibge, ano, desembolso, top_setores, atualizado) |
| `bolsa_atleta_sc` | 88 | 6 (cod_ibge, ano, n_atletas, valor_pago, top_modalidades, atualizado) |
| `caderno_emendas_sc` | 1 | 4 (cod_ibge, escopo, payload, atualizado) |
| `cadprev_dair_aplicacoes_resgate` | 195.336 | 19 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, no_segmeto, tp_ativo…) |
| `cadprev_dair_carteira` | 367.163 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes_bimestre, dt_ano, no_segmento, no_tipo_ativo…) |
| `cadprev_dair_forma_gestao` | 8.599 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, no_objeto_contratacao…) |
| `cadprev_dair_fundo_invest_analisados` | 101.495 | 14 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, nr_cnpj_empresa…) |
| `cadprev_dair_governanca` | 25.607 | 26 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, dt_mes, dt_ano, dt_envio, nr_norma_fundamento…) |
| `cadprev_dair_identificacao` | 9.450 | 13 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, te_finalidade…) |
| `cadprev_dair_instituicao_credenciada` | 500.000 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, nr_cnpj_empresa, no_empresa…) |
| `cadprev_dair_regime_ata` | 19.099 | 11 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, no_orgao…) |
| `cadprev_dipr` | 348.141 | 15 (cod_ibge, idrubrica, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio…) |
| `cadprev_draa_base_calculo_amortizacao` | 838 | 16 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_base_calculo_ente` | 1.620 | 16 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_comparativo_avaliacao` | 47.080 | 14 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_comparativo_receita` | 42.236 | 15 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_contribuicao` | 1.620 | 18 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_custo_normal_benef_capit` | 6.695 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_custo_normal_benef_cob` | 482 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_custo_normal_rep_apos` | 1.313 | 21 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_custo_normal_rep_aux` | 887 | 21 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_dados_consolidados` | 8.599 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, no_objeto_contratacao…) |
| `cadprev_draa_encaminhamento` | 1.114 | 7 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao) |
| `cadprev_draa_estatistica` | 12.514 | 28 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_fluxo_atuarial` | 42.236 | 10 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, tp_plano, tp_massa, dt_exercicio, nr_fluxo…) |
| `cadprev_draa_forma_amortizacao` | 69.077 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_hipotese_atuarial` | 24.811 | 21 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_hipotese_biometrica` | 6.210 | 33 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_notificacao` | 26 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, nr_notificacao, no_tipo_documento, no_item_analise, no_situacao_item_analise…) |
| `cadprev_draa_orgao_entidade` | 6.892 | 14 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_parecer_atuarial` | 14.406 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_plano_amortizacao` | 26.634 | 19 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_plano_amortizacao_deficit` | 838 | 11 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_plano_beneficio` | 9.974 | 18 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_plano_custeio` | 9.240 | 15 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_retificacao_notificacao` | 270 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_draa_segregacao_massa` | 859 | 25 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, tp_massa, te_situacao, tp_plano…) |
| `cadprev_draa_valores_compromissos` | 69.077 | 14 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_exercicio, dt_envio, te_situacao, tp_plano…) |
| `cadprev_rpps_aliquota` | 1.892 | 11 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, ds_plano_segregacao, no_sujeito_passivo, vl_aliquota, dt_inicio_vigencia…) |
| `cadprev_rpps_regime_previdenciario` | 816 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, tp_regime, dt_inicio, dt_fim, no_tipo_legislacao…) |
| `cadprev_sync_log` | 39 | 5 (id, recurso, uf, linhas, ts) |
| `caf_sc` | 295 | 6 (cod_ibge, competencia, caf_fisica, caf_rural, caf_juridica, atualizado) |
| `captacao_transferegov_sc` | 1.277 | 14 (id_plano, cod_ibge, uf, id_programa, situacao, valor_total_repasse, valor_voluntario, valor_total…) |
| `car_sc` | 295 | 4 (cod_ibge, imoveis_total, imoveis_ativos, atualizado) |
| `catalogo_govbr_sc` | 23.686 | 7 (nivel, tipo, cod, nome, classe, grupo, atualizado_em) |
| `cauc_detalhe_sc` | 8.290 | 5 (cod_ibge, codigo, status, validade, atualizado) |
| `cauc_sc` | 296 | 7 (cod_ibge, data_pesquisa, apto, n_pendencias, pendencias, grupos_pendentes, atualizado) |
| `censo_matricula_sc` | 3.256 | 4 (cod_ibge, ano, etapa, matriculas) |
| `cfem_sc` | 1.892 | 5 (cod_ibge, ano, valor, top_substancias, atualizado) |
| `cmed_pmvg` | 25.392 | 11 (ggrem, substancia, laboratorio, produto, apresentacao, classe, regime, pmvg_0…) |
| `cnes_estab_check` | 295 | 2 (cod_ibge, n) |
| `cnes_sc` | 295 | 10 (cod_ibge, total, sus_amb, hospitalar, cirurgico, obstetrico, neonatal, por_tipo…) |
| `cnpj_loc` | 34.615 | 10 (cnpj, razao_social, municipio, uf, atualizado, situacao, situacao_motivo, abertura…) |
| `coleta_heartbeat` | 1 | 6 (id, ts, progresso, etapa, reinicios, msg) |
| `coleta_qa` | 1 | 6 (id, ts, status, suspeitos, alertas, regras) |
| `compras_publicas` | 106 | 11 (ente_tipo, ente_id, ano, valor_contratado_pc, pct_pregao_eletronico, pct_dispensa, economia_pregao, fornecedores_mil…) |
| `compras_sc` | 1.084 | 9 (cod_ibge, ano, n_contratos, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade…) |
| `compras_sc_vazios` | 247 | 1 (cod_ibge) |
| `contratacoes` | 1.035 | 13 (id, ente_tipo, ente_id, numero, objeto, orgao, modalidade, valor_estimado…) |
| `contratos_sc` | 1.230.336 | 14 (id, cod_ibge, numero_controle_compra, cnpj_compra, ano_compra, seq_compra, fornecedor, ni_fornecedor…) |
| `contratos_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `contratos_sc_feitos_inc` | 295 | 2 (cod_ibge, n) |
| `convenios_captados_sc` | 21.484 | 12 (cod_ibge, id, numero, objeto, orgao, situacao, valor, valor_liberado…) |
| `convenios_check` | 295 | 1 (cod_ibge) |
| `convenios_sc` | 13.071 | 10 (nr_convenio, id_proposta, cod_ibge, municipio, ano, situacao, vl_global, vl_repasse…) |
| `crp_alerta_estado` | 296 | 4 (cod_ibge, categoria, dias, atualizado) |
| `crp_alertas` | 247 | 11 (id, cod_ibge, nome, eh_estado, evento, categoria_de, categoria_para, dias…) |
| `despesa_sub_check` | 2.664 | 2 (cod_ibge, ano) |
| `despesa_subfuncao_sc` | 73.245 | 6 (cod_ibge, ano, funcao, subfuncao, empenhado, dotacao) |
| `educacao_especial_sc` | 2.892 | 10 (cod_ibge, ano, total, incluidos, exclusivas, esp_infantil, esp_fundamental, esp_medio…) |
| `eleitorado_sc` | 295 | 4 (cod_ibge, eleitores, ano, atualizado) |
| `emendas_check` | 7 | 2 (ano, n) |
| `emendas_est_objetos_sc` | 4.078 | 6 (id, ano, area, objeto, valor, atualizado) |
| `emendas_estaduais_exec_sc` | 1 | 3 (cod_ibge, valor_pago, atualizado) |
| `emendas_execucao_sc` | 691 | 14 (codigo_emenda, ano, cod_ibge, localidade, tipo, autor, funcao, subfuncao…) |
| `emendas_indicacao_sc` | 9.615 | 19 (id_proposta, nr_emenda, cod_ibge, municipio, parlamentar, tipo_parlamentar, impositivo, programa…) |
| `empenhos_check` | 189 | 5 (cnpj_compra, ano_compra, seq_compra, checado, n) |
| `empenhos_sc` | 0 | 10 (cod_ibge, cnpj_compra, ano_compra, seq_compra, seq_empenho, numero, valor, data…) |
| `entes_sc` | 296 | 14 (cod_ibge, nome, uf, tipo, populacao, pop_indigena, latitude, longitude…) |
| `equipamentos_justica_sc` | 724 | 11 (id, cat, nome, tipo, cod_ibge, municipio, latitude, longitude…) |
| `equipamentos_suas_sc` | 1.669 | 17 (codigo_cadsuas, cod_ibge, nome, tipo, nr_identificador, uf, municipio, atualizado…) |
| `escolas_hist_sc` | 64.566 | 16 (co_entidade, ano, cod_ibge, dependencia, nome, localizacao, matriculas, docentes…) |
| `escolas_sc` | 6.750 | 27 (co_entidade, cod_ibge, ano, nome, dependencia, localizacao, matriculas, tem_agua…) |
| `estabelecimentos_saude_sc` | 35.458 | 17 (codigo_cnes, cod_ibge, nome, tipo_codigo, tipo, gestao, esfera, sus_ambulatorial…) |
| `estado_indicador_valores` | 2.160 | 4 (estado_id, indicador_id, ano, valor) |
| `estados` | 27 | 8 (id, uf, nome, regiao, populacao, capital, governador, pib_per_capita) |
| `estatisticas_vitais_sc` | 5.956 | 5 (cod_ibge, ano, nascidos, obitos, atualizado) |
| `estban_sc` | 6.305 | 11 (cod_ibge, ano_mes, credito, credito_rural, credito_agroind, credito_imob, poupanca, prazo…) |
| `etl_catalogo` | 94 | 10 (id, label, api, max_ano, ultima_exec, ultimo_status, devido, msg…) |
| `fatores_fundeb` | 325 | 6 (ano, segmento, fp_vaaf, fp_vaat, fp_final_vaaf, fp_final_vaat) |
| `financas` | 106 | 19 (ente_tipo, ente_id, ano, receita_total, rec_tributaria, rec_transferencias, rec_outras, despesa_total…) |
| `financas_sc` | 1.970 | 23 (cod_ibge, ano, receita, receita_prevista, tributaria, transferencias, outras, despesa…) |
| `fnde_estado_check` | 27 | 2 (ano, n) |
| `fnde_fundos_check` | 295 | 3 (cod_ibge, n_fundos, n_lib) |
| `fnde_programa_ref` | 25 | 2 (codigo, nome) |
| `fnde_simad_check` | 7.965 | 3 (cod_ibge, ano, n) |
| `fnde_simad_sc` | 207.012 | 12 (cod_ibge, ano, data_pgto, ob, valor, parcela, programa, cnpj_recebedor…) |
| `fns_repasse_sc` | 45.606 | 8 (cod_ibge, ano, bloco_cod, bloco_nome, area_cod, area_nome, vl_total, vl_liquido) |
| `frescor_log` | 4 | 6 (id, rodado_em, total, ok, resumo, problemas) |
| `fundeb_hist_sc` | 1.142 | 8 (cod_ibge, ano, matriculas, ponderadas, receita, vaaf_calc, breakdown, atualizado) |
| `fundeb_matriculas_sc` | 295 | 19 (cod_ibge, ano, creche, creche_int, pre, pre_int, fund_ai, fund_ai_int…) |
| `fundeb_motor_sc` | 590 | 8 (cod_ibge, ano, matriculas, ponderadas, receita, vaaf_calc, breakdown, atualizado) |
| `fundeb_oficial_sc` | 590 | 13 (cod_ibge, ano, total, integral, especial, rural, infantil, fundamental…) |
| `ideb_sc` | 15.250 | 7 (cod_ibge, ano, etapa, rede, ideb, meta, nota_saeb) |
| `iegm_sc` | 4.039 | 6 (cod_ibge, ano, indicador, pct, faixa, atualizado_em) |
| `indicador_valores` | 2.080 | 4 (municipio_id, indicador_id, ano, valor) |
| `indicadores` | 16 | 8 (id, codigo, nome, area, unidade, fonte, direcao_melhor, descricao) |
| `indicadores_inep_escola_sc` | 15.804 | 9 (co_entidade, cod_ibge, ano, indicador, ed_inf, fun_ai, fun_af, medio…) |
| `indicadores_inep_sc` | 1.475 | 8 (cod_ibge, ano, indicador, ed_inf, fun_ai, fun_af, medio, atualizado) |
| `indicadores_sc` | 4.672 | 7 (cod_ibge, ano, codigo, area, valor, unidade, fonte) |
| `indices_pnigp` | 130 | 9 (municipio_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `indices_pnigp_estados` | 135 | 9 (estado_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `itens_classificacao_sc` | 409.501 | 14 (descr_norm, tipo, cat_nivel, cat_cod, cat_nome, cat_classe, shared, cobertura…) |
| `itens_proc_feitos` | 78.481 | 3 (numero_controle, n, feito_em) |
| `itens_sc` | 1.193.373 | 19 (cod_ibge, cnpj, ano, seq, numero, descricao, unidade, quantidade…) |
| `itens_sc_feitos` | 0 | 2 (cod_ibge, ano) |
| `mcmv_sc` | 295 | 7 (cod_ibge, uh_financiadas, vlr_financiamento, vlr_subsidio, ano_min, ano_max, atualizado) |
| `metas` | 130 | 6 (id, municipio_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_estados` | 135 | 6 (id, estado_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_fiscais_feitos` | 2.368 | 2 (cod_ibge, ano) |
| `metas_fiscais_sc` | 1.417 | 12 (cod_ibge, ano, meta_primario, resultado_primario, meta_nominal, resultado_nominal, receita_prim_prev, receita_prim_real…) |
| `mi_social_serie_sc` | 1.238.760 | 4 (cod_ibge, anomes, indicador, valor) |
| `msc_despesa_sc` | 3.435 | 7 (cod_ibge, ano, tipo, categoria, valor, total_rreo, atualizado) |
| `munic_sc` | 14.750 | 8 (cod_ibge, indicador, grupo, label, tem, atualizado, valor, ano) |
| `municipios` | 26 | 9 (id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito…) |
| `notificacao_cadastro` | 1 | 20 (id, cod_ibge, nome, cpf, matricula, cargo, secretaria, perfil…) |
| `notificacao_impacto` | 15 | 7 (id, cod_ibge, alerta_id, tipo_impacto, valor, descricao, registrado_em) |
| `notificacao_log` | 926 | 11 (id, cod_ibge, alerta_id, chave_delta, destinatario_id, canal, severidade, enviado_em…) |
| `notificacao_regras` | 55 | 12 (alerta_id, titulo, secretaria, natureza, severidade, tem_prazo, fonte_dado, solucao_i10…) |
| `orgaos_municipais_sc` | 872 | 2 (cod_ibge, cnpj) |
| `orgaos_sc_feitos` | 295 | 1 (cod_ibge) |
| `pca_sc` | 67 | 6 (cod_ibge, n_itens, valor_total, por_categoria, por_ano, top) |
| `pca_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `pdde_sc` | 1.148 | 5 (cod_ibge, ano, vl_total, n_escolas, qt_alunos) |
| `pix_municipio_sc` | 7.080 | 8 (cod_ibge, ano_mes, vl_recebido, vl_recebido_pj, vl_pago, qt_recebido, n_pes_receb_pj, atualizado) |
| `pnld_reserva_sc` | 7 | 6 (cod_ibge, ano, qtd_demandada, qtd_autorizada, qtd_atendimento, n_volumes) |
| `populacao_idade_sc` | 295 | 8 (cod_ibge, ano, creche_0_3, pre_4_5, fund_6_14, medio_15_17, pop_0_17, idades) |
| `precatorios_entes_sc` | 293 | 7 (cd_entidade, de_entidade, cod_ibge, regime, valor, qtde, atualizado) |
| `precatorios_sc` | 239 | 5 (cod_ibge, total_valor, total_qtde, n_entes, atualizado) |
| `precos_referencia_sc` | 369 | 7 (chave, unidade, mediana, p25, p75, n_itens, n_munis) |
| `previne_sc` | 5.310 | 7 (cod_ibge, competencia, indicador, ind_nome, numerador, denominador, pct) |
| `processos_ata_sc` | 12.566 | 3 (cnpj, seq, ano) |
| `processos_feitos` | 54 | 4 (modalidade, ano, n, concluido_em) |
| `processos_sc` | 79.531 | 12 (numero_controle, cod_ibge, cnpj_orgao, ano, sequencial, modalidade_id, modalidade, objeto…) |
| `programa_beneficiario_sc` | 1.582 | 9 (id_beneficiario, id_programa, cod_ibge, nome, uf, tipo, valor, numero_emenda…) |
| `programas_catalogo` | 2.081 | 10 (id_programa, nome_programa, orgao, modalidade, natureza, uf, ano, dt_ini_prop…) |
| `programas_federais_sc` | 33 | 10 (id, area, nome, objeto, orgao, fonte, link, elegibilidade…) |
| `programas_transferegov` | 306 | 23 (id_programa, modulo, nome, orgao, modalidade, situacao, valor_global, uf…) |
| `pronaf_sc` | 0 | 8 (cod_ibge, ano, qtd_contratos, vl_total, vl_custeio, vl_investimento, area_ha, atualizado) |
| `queimadas_sc` | 4.217 | 7 (cod_ibge, ano, mes, focos, risco_medio, bioma, atualizado) |
| `radar_captacao_sc` | 4.590 | 8 (cod_ibge, id_programa, nome_programa, orgao, modalidade, dt_ini_prop, dt_fim_prop, situacao) |
| `receitas_det_check` | 1.480 | 2 (cod_ibge, ano) |
| `receitas_detalhe_sc` | 15.160 | 4 (cod_ibge, ano, item, valor) |
| `red_flags_fornecedores_sc` | 23.339 | 12 (cod_ibge, ni, fornecedor, n_contratos, valor_total, share_pct, sancionado, sanc_tipo…) |
| `rgf_sc` | 2.472 | 10 (cod_ibge, ano, pessoal_pct, pessoal_valor, limite_pct, rcl_ajustada, dcl_valor, dcl_pct…) |
| `rpps_atuarial_sc` | 418 | 5 (cod_ibge, exercicio, deficit_atuarial, ativos, no_ente) |
| `rpps_check` | 1.480 | 2 (cod_ibge, ano) |
| `rpps_crp_sc` | 14.302 | 9 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, nr_crp, ds_situacao, tp_crp, dt_emissao…) |
| `rpps_sc` | 329 | 9 (cod_ibge, ano, receita, despesa, resultado, contrib_segurados, contrib_patronais, aposentadorias…) |
| `rreo_const_sc` | 1.268 | 9 (cod_ibge, ano, educacao_pct, educacao_min, educacao_valor, fundeb_pct, rcl, saude_pct…) |
| `sancoes` | 24.754 | 11 (id, fonte, ni, tipo_pessoa, nome, tipo_sancao, orgao, data_inicio…) |
| `saneamento_sc` | 885 | 9 (cod_ibge, indicador, label, domicilios, atendidos, pct, fonte, ano…) |
| `saude_producao_sc` | 1.463 | 6 (cod_ibge, ano, internacoes, valor_internacoes, sia_qtd, sia_valor) |
| `sazonalidade_preco_sc` | 96 | 4 (categoria, mes, indice, n) |
| `serie_anotacao` | 0 | 6 (id, escopo, cod_ibge, ano, texto, criado) |
| `simad_municipio` | 294 | 3 (cod_ibge, cod_simad, nome) |
| `siop_acoes` | 5.609 | 17 (exercicio, esfera, uo, funcao, subfuncao, programa, acao, titulo…) |
| `siops_sc` | 1.475 | 9 (cod_ibge, ano, saude_pct, saude_valor, saude_min, transf_saude_pct, transf_uniao_pct, transf_saude_valor…) |
| `snis_residuos_sc` | 0 | 9 (cod_ibge, ano, cod_psv, prestador, sigla, abrangencia, natureza, indicadores…) |
| `snis_sc` | 2.427 | 17 (cod_ibge, ano, cod_psv, prestador, sigla, abrangencia, natureza, servico…) |
| `sobrepreco_compras_sc` | 2.162 | 11 (cod_ibge, chave, unidade, descricao, ano, quantidade, unit_pago, unit_ref…) |
| `sobrepreco_medicamentos_sc` | 339 | 11 (id, cod_ibge, descricao, dose, paga, teto, excesso_pct, quantidade…) |
| `suas_sc` | 295 | 10 (cod_ibge, municipio, anomes, cras, creas, acolhimento, populacao, hab_por_cras…) |
| `transferencias_sc` | 264 | 8 (cod_ibge, n_instrumentos, valor_total, valor_liberado, por_situacao, por_orgao, top, por_ano) |
| `transferencias_stn_sc` | 165.466 | 6 (cod_ibge, item, ano, mes, valor, fonte) |
| `vaar_fundeb_sc` | 295 | 5 (cod_ibge, ano, habilitado, beneficiario, atualizado) |
| `vaat_fundeb_sc` | 290 | 7 (cod_ibge, ano, vaat, vaat_min, compl_vaat, recebe_vaat, atualizado) |
| `variacao_interna_sc` | 2.235 | 10 (cod_ibge, descricao, unidade, n_compras, menor, maior, razao, qtd_total…) |
| `votos_bancada_sc` | 5.458 | 4 (bancada_id, cod_ibge, votos, atualizado) |
| `votos_estadual_sc` | 9.434 | 3 (bancada_id, cod_ibge, votos) |

## 2. Coleta (ETLs e scripts)

| Script | O que faz |
|---|---|
| `scripts/_armando.mjs` | — |
| `scripts/_audit_296.mjs` | — |
| `scripts/_audit_estado.mjs` | — |
| `scripts/_cadprev.mjs` | Helpers compartilhados dos ETLs CADPREV (apicadprev.trabalho.gov.br). Padrão "puxa a UF inteira e casa no_ente → cod_ibge" (extraído de ingest_rpps_atuarial_sc.mjs). |
| `scripts/_capt.mjs` | — |
| `scripts/_cf.mjs` | — |
| `scripts/_check_entes.mjs` | — |
| `scripts/_check_geo.mjs` | — |
| `scripts/_check_granularidade.mjs` | — |
| `scripts/_chk_pronaf.mjs` | — |
| `scripts/_cobertura_material_v2.mjs` | #2+#3 — MATERIAL com o motor v2 (fuzzy prefixo + head livre + limiar de especificidade) contra CATMAT (PDMs). |
| `scripts/_cobertura_servico_item.mjs` | #1 — casa SERVIÇOS a nível de ITEM (CATSER 6_consultarItemServico, ~3091) com fallback p/ Classe (313). Mede ganho de cobertura vs baseline (17,6% valor) e imprime amostra dos serv |
| `scripts/_cobertura_servico_v2.mjs` | #1 refino — SERVIÇO nível item com matching fuzzy por prefixo + head em qualquer posição + limiar de especificidade. |
| `scripts/_cobertura_universo.mjs` | Mede a COBERTURA do matcher lexical (CATMAT+CATSER) sobre o universo TODO de itens_sc, quebrada por tipo (Material×Serviço) e por faixa de valor. node scripts/_cobertura_universo.m |
| `scripts/_diag_conv.mjs` | — |
| `scripts/_diag_tg.mjs` | — |
| `scripts/_diag_tg2.mjs` | — |
| `scripts/_diag_tg3.mjs` | — |
| `scripts/_em_anos.mjs` | — |
| `scripts/_emendas_recon.mjs` | — |
| `scripts/_emtest.mjs` | — |
| `scripts/_peca.mjs` | — |
| `scripts/_prog.mjs` | — |
| `scripts/_prog_caderno.mjs` | — |
| `scripts/_prog_diag.mjs` | — |
| `scripts/_rank_check.mjs` | — |
| `scripts/_reset_pca_feitos.mjs` | Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT). |
| `scripts/_schema_itens.mjs` | — |
| `scripts/_simad_map.mjs` | — |
| `scripts/_uf.mjs` | Config central de UF para os ETLs. Define o estado-alvo da coleta via env UF (padrão SC). Para coletar outro estado: UF=PR node scripts/ingest_*.mjs |
| `scripts/_universo_catmat.mjs` | — |
| `scripts/alerta_crp.mjs` | ALERTA de CRP — varre o último CRP de cada ente (rpps_crp_sc), classifica por urgência e detecta TRANSIÇÕES desde a última varredura (entrou em vencido / ≤30d / ≤90d, ou regularizo |
| `scripts/auditoria_dados_sc.mjs` | Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada). Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_ |
| `scripts/backup_neon.mjs` | Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored). Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump |
| `scripts/build_precos_compras.mjs` | ANÁLISE DE COMPRAS POR PREÇO UNITÁRIO (SOBREPREÇO vs SC) — tudo em SQL (rápido). Monta o livro de preços de referência de SC (mediana/quartis por item) e as constatações de sobrepr |
| `scripts/build_red_flags_fornecedores.mjs` | RED FLAGS DE FORNECEDORES — sinais de risco de integridade por (município, fornecedor): CONCENTRAÇÃO (fatia do total contratado), SANCIONADO (CEIS/CNEP vigente) e SOBREPREÇO (itens |
| `scripts/build_sobrepreco_medicamentos.mjs` | Indícios de sobrepreço em MEDICAMENTOS vs o teto legal (CMED/PMVG). Conservador: casa por SUBSTÂNCIA + DOSAGEM, compara o preço/comprimido pago ao MAIOR PMVG/comprimido daquela dos |
| `scripts/build_variacao_interna.mjs` | VARIAÇÃO INTERNA DE PREÇOS — itens que o MESMO município comprou a preços unitários diferentes (incoerência interna). Economia = padronizar pelo MENOR preço que o próprio município |
| `scripts/coleta_diaria_pncp.mjs` | BUSCA DIÁRIA DO PNCP — roda todo dia os coletores do PNCP do ano corrente (compras, contratos, atas), que são idempotentes (upsert). Captura as contratações novas publicadas. Seque |
| `scripts/diagnostico_gestor.mjs` | MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis. Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso). Regras ancoradas e |
| `scripts/enrich_equipamentos_suas_endereco.mjs` | ETL fase 2 — endereço/telefone de cada equipamento do SUAS (CadSUAS, página de detalhe por código). A página de detalhe (aba=endereco_contatos) responde a HTTP simples (≠ da busca, |
| `scripts/enviar_notificacoes.mjs` | CARTEIRO das notificações — pega os deltas pendentes (status='detectado'), resolve os destinatários no cadastro (verificados, ativos, válidos, canal e-mail, secretaria/áreas casand |
| `scripts/enviar_notificacoes_whatsapp.mjs` | CARTEIRO WhatsApp — envia os deltas pendentes aos destinatários com canal_pref='whatsapp'. Usa a Meta WhatsApp Cloud API. IMPORTANTE: mensagem PROATIVA (iniciada pela empresa) exig |
| `scripts/etl_orquestrador.mjs` | ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental, idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrado |
| `scripts/etl_pagina_sync.mjs` | Sincroniza a PÁGINA DE COLETA (/etl) com a realidade do banco: conta registros reais por fonte, reflete progresso ao vivo do harvest (processos/itens) e atualiza etl_catalogo (msg/ |
| `scripts/gen_docx_competitiva.mjs` | Gera o .docx da Análise Competitiva (Node puro, sem dependência). node scripts/gen_docx_competitiva.mjs |
| `scripts/geocode_equipamentos_cep.mjs` | Fallback de geocodificação por CEP — para os equipamentos do SUAS cujo endereço completo o Nominatim não encontrou. CEP→coordenada via AwesomeAPI (cep.awesomeapi.com.br). Marca geo |
| `scripts/geocode_equipamentos_suas.mjs` | Geocodifica os equipamentos do SUAS (CadSUAS só tem endereço, não lat/lon) via Nominatim/OSM. Respeita a política do Nominatim: 1 req/seg, User-Agent identificado. Idempotente/resu |
| `scripts/gerar_documentacao.mjs` | Gerador de documentação automática do sistema PNIGP. Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta e tarefas agendadas  |
| `scripts/ingest_acesso_financeiro_sc.mjs` | ETL — Acesso e movimento financeiro por município (BCB Olinda). SÉRIE HISTÓRICA. 4 camadas: AGÊNCIAS + POSTOS (inc. COOPERATIVAS) + CORRESPONDENTES (snapshot por COMPETÊNCIA, acumu |
| `scripts/ingest_acompanhamento_funcao_sc.mjs` | ETL — ACOMPANHAMENTO por FUNÇÃO (intra-anual): orçado (dotação) × realizado (empenhado) ATÉ O BIMESTRE vigente, por função, por município. Tabela SEPARADA da anual (despesa_subfunc |
| `scripts/ingest_acompanhamento_sc.mjs` | ETL — ACOMPANHAMENTO intra-anual da execução orçamentária (RREO do bimestre vigente, SICONFI). Receita prevista × arrecadada e despesa orçada × empenhada ATÉ O BIMESTRE, por municí |
| `scripts/ingest_agropecuaria_sc.mjs` | ETL — AGRICULTURA e AGRICULTURA FAMILIAR por município (Censo Agropecuário 2017, IBGE/SIDRA). Recorte de agricultura familiar (Lei 11.326): nº de estabelecimentos (t/6778) + área ( |
| `scripts/ingest_alesc_contatos_sc.mjs` | ETL — Foto, partido, página, e-mail e telefone dos deputados estaduais (ALESC), p/ os cards da aba Estaduais. Fonte: ALESC admin-ajax (post_type=post_team) — HTML dos cards. Casa p |
| `scripts/ingest_anp_sc.mjs` | ETL — ANP preços de combustíveis por município. Fonte: gov.br/anp .../shpc/dsas/ca/ca-YYYY-SS.csv (semestral, latin1, ;). Agrega preço médio de venda por (município, ano, semestre, |
| `scripts/ingest_ans_cobertura_sc.mjs` | ETL — ANS cobertura de planos de saúde por município. Fonte: dadosabertos.ans.gov.br (taxa_de_cobertura, CSV 21MB, latin1, ;). Agrega beneficiários (assistência médica) + população |
| `scripts/ingest_assistencia_social_sc.mjs` | ETL — Assistência social COMPLETA por município de SC (MDS · MI Social Solr). (1) assistencia_repasse_sc: SÉRIE ANUAL do repasse FNAS/SUAS recebido (2005→atual · total/PSB/PSE) — " |
| `scripts/ingest_atas_sc.mjs` | ETL — Atas de Registro de Preço (PNCP, API de Consulta /v1/atas) por órgão de SC. Traz preços registrados + vínculo à compra (numeroControlePNCPCompra). Idempotente/resumível por ó |
| `scripts/ingest_bancada_estadual_sc.mjs` | ETL — Bancada ESTADUAL (deputados estaduais eleitos, ALESC) + votos por município, do TSE 2022 (cargo 7). Roster = candidatos cargo 7 com situação "ELEITO ..." (QP/Média). Votos po |
| `scripts/ingest_bancada_federal_sc.mjs` | ETL — Bancada federal do estado (deputados federais + senadores) para o módulo de Captação de Emendas. Fontes abertas: Câmara (dadosabertos.camara.leg.br) e Senado (legis.senado.le |
| `scripts/ingest_bndes_sc.mjs` | ETL — BNDES desembolsos por município (crédito produtivo). Fonte: dadosabertos.bndes.gov.br (CSV ~135MB, latin1). Agrega desembolsos_reais por (município, ano) + guarda os 3 maiore |
| `scripts/ingest_bolsa_atleta_sc.mjs` | ETL — Bolsa Atleta por município. Fonte: Ministério do Esporte (dados abertos, XLSX no SharePoint mdsgov). Download via SharePoint _layouts/15/download.aspx?share={token}. Agrega n |
| `scripts/ingest_bpc_sc.mjs` | ETL — BPC (Benefício de Prestação Continuada) por município, via MI Social (SAGI/MDS), API Solr pública. Idosos e pessoas com deficiência de baixa renda (1 salário mínimo). Fecha a |
| `scripts/ingest_cadprev.mjs` | ETL GENÉRICO — espelha (mirror raw) os demais recursos do CADPREV, fielmente, por UF. Captura "tudo que a API expõe": cria cadprev_<recurso> com todas as colunas da fonte + cod_ibg |
| `scripts/ingest_caf_sc.mjs` | ETL — CAF (Cadastro Nacional da Agricultura Familiar, ex-DAP): agricultores familiares por município de SC. Fonte: MDA — Transparência da CAF (XLSX mensal, nacional). Aba GERAL: bl |
| `scripts/ingest_car_sc.mjs` | ETL — CAR (Cadastro Ambiental Rural): nº de imóveis rurais por município de SC. Fonte: SICAR GeoServer WFS público (sicar:sicar_imoveis_sc), contagem via resultType=hits (sem shape |
| `scripts/ingest_catalogo_govbr_sc.mjs` | ETL — Catálogo oficial do governo federal (CATMAT + CATSER) do Compras.gov.br: espinha dorsal p/ classificar os itens de compra. Snapshot completo (rebuild idempotente). node scrip |
| `scripts/ingest_cauc_sc.mjs` | ETL — CAUC (Sistema de Informações sobre Requisitos Fiscais) por município/Estado de SC. Fonte: CSV oficial do Tesouro Transparente (CAUC lê o CADIN diariamente). Mostra se o ente  |
| `scripts/ingest_censo_especial_sc.mjs` | ETL — Educação Especial por município (INEP Censo Escolar, Tabela_Matricula). Detalhe do ano corrente: total (QT_MAT_ESP), INCLUÍDOS em classes comuns (QT_MAT_ESP_CC → inclusão), e |
| `scripts/ingest_censo_hist_sc.mjs` | ETL — Censo Escolar ESCOLA A ESCOLA, ANO A ANO (SC, TODAS as dependências), 2007→atual. Grão máximo p/ B2G e estudos B2B. Por (co_entidade, ano): matrículas + modalidade (tipo de a |
| `scripts/ingest_censo_sc.mjs` | ETL — Censo Escolar (INEP): matrículas por município/etapa. Fonte: Sinopse Estatística da Educação Básica. Tabela 1.1 (sheet7): Matrículas da Educação Básica por Etapa, segundo UF  |
| `scripts/ingest_cfem_sc.mjs` | ETL — CFEM (royalty de mineração) distribuído por município. Fonte: dadosabertos.anm.gov.br/CFEM/CFEM_Distribuicao.csv (~128MB, latin1, campos entre aspas). Agrega Valor por (munic |
| `scripts/ingest_classificacao_itens_sc.mjs` | ETL — Classificação dos itens de compra → CATMAT/CATSER. Dicionário por descritivo normalizado distinto (matcher léxico v2: fuzzy-prefixo + head livre + limiar de especificidade).  |
| `scripts/ingest_cmed_pmvg.mjs` | ETL — CMED/Anvisa PMVG (Preço Máximo de Venda ao Governo): o TETO LEGAL de preço de medicamentos. Referência nacional p/ detectar sobrepreço em compras de saúde. SC = alíquota ICMS |
| `scripts/ingest_cnes_estab_sc.mjs` | ETL — Estabelecimentos de saúde por município (CNES, API DEMAS). Rede PÚBLICA (municipal/estadual/federal): cada unidade com tipo, gestão, esfera, SUS, centro cirúrgico/obstétrico, |
| `scripts/ingest_cnes_sc.mjs` | ETL — CNES (rede de saúde instalada) por município de SC. Fonte: API dados abertos do Min. Saúde. Agrega por município: nº de estabelecimentos, atende SUS, atendimento hospitalar,  |
| `scripts/ingest_cnpj_loc.mjs` | ETL — resolve UF/município dos FORNECEDORES vencedores (PNCP não fornece; usamos o CNPJ). Fonte: minhareceita.org (base Receita Federal). Cache em cnpj_loc, idempotente/resumível,  |
| `scripts/ingest_compras_sc.mjs` | Fase 2 — Compras OFICIAIS (PNCP) de Santa Catarina, agregadas por ente no banco. Para cada ente de entes_sc: contratações 2024 (PNCP), esfera municipal (ou estadual), principais mo |
| `scripts/ingest_contratos_sc.mjs` | ETL — Contratos ASSINADOS do PNCP por município de SC, conectados ao processo licitatório. Descobre os CNPJs dos órgãos municipais (via contratações esfera M) e puxa /contratos?cnp |
| `scripts/ingest_convenios_sc.mjs` | ETL — Convênios captados pelos municípios (Portal da Transparência, dado do Transferegov). "Quanto cada prefeitura captou" → base p/ benchmark vs pares (o ponto cego da captação).  |
| `scripts/ingest_convenios_siconv_sc.mjs` | ETL — Convênios/Contratos de Repasse por município SC (SICONV/Transferegov, repositório detru). Lê os CSVs já extraídos em $CLAUDE_JOB_DIR/tmp via readline (streaming, sem OOM). pr |
| `scripts/ingest_despesa_subfuncao_sc.mjs` | ETL — Despesa por FUNÇÃO → SUBFUNÇÃO (drill real: Atenção Básica, Ensino Fundamental…) via SICONFI RREO Anexo 02. Hierarquia é por ordem: linha de função (lista oficial) e depois s |
| `scripts/ingest_eleitorado_sc.mjs` | ETL — Número de ELEITORES (aptos) por município de SC, p/ o % dos votos de cada parlamentar sobre o eleitorado. Fonte: TSE perfil_comparecimento_abstencao 2022 (QT_APTOS por municí |
| `scripts/ingest_emendas_est_objetos_sc.mjs` | ETL — Catálogo REAL de objetos de emendas parlamentares ESTADUAIS de SC (ano 2026), do Power BI da SEF. Cada objeto (finalidade real de uma emenda) + valor, classificado por área.  |
| `scripts/ingest_emendas_estaduais_sc.mjs` | ETL — Execução das emendas parlamentares ESTADUAIS por município (SEF-SC), extraída do painel Power BI (endpoint público querydata; tabela ExecucaoEmendasParlamentares). Parser do  |
| `scripts/ingest_emendas_sc.mjs` | ETL — Emendas parlamentares por município de SC: EXECUÇÃO orçamentária federal (Portal da Transparência, API de Dados). Autoritativo: empenhado×liquidado×pago×resto por emenda, aut |
| `scripts/ingest_emendas_siconv_sc.mjs` | ETL — Emendas parlamentares por município SC: INDICAÇÃO (SICONV/Transferegov, repositório público detru). Quem destinou e quanto: parlamentar, impositivo, valor (+ execução do conv |
| `scripts/ingest_empenhos_sc.mjs` | ETL — Empenhos por contrato (PNCP, Lei 14.133). Endpoint /contratos/{ano}/{seq}/empenhos. Hoje a cobertura em SC é ~0 (municípios ainda não publicam o ciclo), mas o coletor "acende |
| `scripts/ingest_entes_uf.mjs` | ETL — carrega os ENTES (municípios + governo estadual) de qualquer UF na tabela entes_sc. Fonte: IBGE (localidades + população estimada). Pré-requisito para coletar um novo estado. |
| `scripts/ingest_equipamentos_justica.mjs` | ETL — Equipamentos de SEGURANÇA, JUSTIÇA e DEFESA CIVIL de SC, georreferenciados. Fonte principal: OpenStreetMap/Overpass (amenity=prison/police/fire_station + nome "Defesa Civil") |
| `scripts/ingest_equipamentos_suas.mjs` | ETL — Equipamentos da Assistência Social (unidades CRAS/CREAS/Centro POP/Acolhimento…) por município. Fonte: CadSUAS (Cadastro Nacional do SUAS) — consulta pública. App JSF/statefu |
| `scripts/ingest_escolas_sc.mjs` | ETL — Escolas por município (INEP Censo Escolar microdados, arquivo ed_basica). Cada escola: identificação, dependência, matrículas e INFRAESTRUTURA (água/energia/esgoto/internet/b |
| `scripts/ingest_escolas_series_sc.mjs` | ETL — Nível SÉRIE por escola (SC): matrículas + turmas por série (1º-9º ano, médio, creche/pré, EJA), Censo 2025. Permite o drill série a série com turmas. Grava JSONB escolas_sc.s |
| `scripts/ingest_estatisticas_vitais_sc.mjs` | ETL — Estatísticas vitais por município (nascidos vivos + óbitos). Fonte: IBGE Registro Civil via SIDRA (t2679 v217 nascidos, t2681 v343 óbitos). Substituto limpo do SIM/SINASC (DA |
| `scripts/ingest_estban_sc.mjs` | ETL — ESTBAN (Estatística Bancária Mensal por município, BCB) — SÉRIE HISTÓRICA. Volumes bancários por município. Verbetes-chave: crédito total(160)/rural(163)/agroindustrial(167)/ |
| `scripts/ingest_fnde_estado.mjs` | ETL — FNDE/SIMAD do ESTADO (SC): recursos federais da educação ao Governo do Estado / Secretaria de Estado da Educação / Fundo Estadual. As entidades estaduais ficam na capital → c |
| `scripts/ingest_fnde_fundos.mjs` | ETL — FNDE/SIMAD: FUNDOS de educação (municipal/estadual) — versão RÁPIDA. Por município: sonda 2 anos recentes p/ achar CNPJs de FUNDO/MUNICÍPIO (exclui escolas/APPs). Se achar, c |
| `scripts/ingest_fnde_simad.mjs` | ETL — FNDE/SIMAD liberações por município (educação). Browser-only (WAF F5 bloqueia curl) → Playwright headless. Fluxo: form (tp vazio) → LISTA DE ENTIDADES → enviarFormulario(cnpj |
| `scripts/ingest_fns_sc.mjs` | ETL — Repasses federais fundo-a-fundo do FNS por bloco/área, por município de SC. Fonte: API REST da Consulta Consolidada do FNS (consultafns.saude.gov.br) — descoberta via app Ang |
| `scripts/ingest_fundeb_matriculas_sc.mjs` | ETL — Matrículas por SEGMENTO FUNDEB da REDE MUNICIPAL (INEP Censo, Tabela_Matricula) por município. Base do "Painel FUNDEB Retrato": segmentos ativos, tempo integral, educação esp |
| `scripts/ingest_fundeb_oficial_sc.mjs` | ETL — Matrículas FUNDEB OFICIAIS por município (FNDE, Plataforma Antonieta de Barros, produto 36 "Matriculas - FUNDEB"). Classificação oficial do FUNDEB (tipo_educacao/ensino/turma |
| `scripts/ingest_fundeb_parametros.mjs` | ETL — Parâmetros oficiais do FUNDEB 2026 (FNDE): fatores de ponderação + VAAT por ente + VAAR habilitados. Fonte: gov.br/fnde .../financiamento/fundeb/2026 (CSV latin1, formato Exc |
| `scripts/ingest_geo_entes_sc.mjs` | ETL — Georreferência dos entes: centroide (lat/long), área (km²) e recortes regionais (meso/micro/região) por município. Fonte: IBGE (malhas v4 /metadados + localidades). Base p/ a |
| `scripts/ingest_ideb_sc.mjs` | ETL — IDEB por município (INEP) — série histórica + observado × meta (projeção) + nota SAEB. Fonte oficial: download.inep.gov.br/ideb/resultados/  (XLSX dentro de ZIP). Parser XLSX |
| `scripts/ingest_iegm_sc.mjs` | ETL — IEGM (Índice de Efetividade da Gestão Municipal) do TCE-SC, por município, via IRB. Fonte: iegm.irbcontas.org.br/dados_abertos/{ano}/calculo/calculo_iegm_{ano}_TCESC_completo |
| `scripts/ingest_indicadores_inep_escola_sc.mjs` | ETL — Indicadores educacionais INEP POR ESCOLA (CO_ENTIDADE): AFD/TDI/ATU. Casa com escolas_sc (georreferenciado) → detalhe por escola no mapa + desigualdade INTRAMUNICIPAL. Fonte: |
| `scripts/ingest_indicadores_inep_sc.mjs` | ETL — Indicadores educacionais INEP por município (rede MUNICIPAL): AFD (formação docente adequada, CAT_1), TDI (distorção idade-série, CAT_0), ATU (alunos por turma, CAT_0). Por e |
| `scripts/ingest_indicadores_sc.mjs` | ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita). Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, un |
| `scripts/ingest_indigena_sc.mjs` | ETL — população indígena por município de SC (IBGE Censo 2022, SIDRA tabela 9605, cor/raça Indígena). Fonte sólida e agregada por município (a saúde indígena é responsabilidade com |
| `scripts/ingest_infra_esporte_sc.mjs` | ETL — Infraestrutura esportiva por município (equipamentos, georreferenciados). Fonte: Ministério do Esporte (dados abertos, XLSX SharePoint mdsgov). Guarda cada equipamento (nome/ |
| `scripts/ingest_itens_sc.mjs` | ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon. Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd, unitário |
| `scripts/ingest_mcmv_sc.mjs` | ETL — HABITAÇÃO via MCMV (Minha Casa Minha Vida), base de dados oficial do Ministério das Cidades (gov.br/cidades). Unidades habitacionais financiadas por município (FGTS sintético |
| `scripts/ingest_metas_fiscais_sc.mjs` | ETL — Metas Fiscais (LDO) REAIS via SICONFI (RREO Anexo 06: Resultado Primário e Nominal). Meta fixada no Anexo de Metas Fiscais da LDO × resultado realizado, por ente e ano. node  |
| `scripts/ingest_mi_social_serie_sc.mjs` | ETL — MI SOCIAL série histórica COMPLETA por município (SAGI/MDS, API Solr pública). Formato longo (cod, anomes, indicador, valor). Insumo do moat (granular + série + demografia).  |
| `scripts/ingest_msc_despesa_sc.mjs` | ETL — MSC ANCORADA AO RREO. A MSC dá a FORMA (distribuição do empenhado por natureza e por fonte de recursos); o RREO dá a MAGNITUDE (total oficial exato). Ancoramos a forma ao tot |
| `scripts/ingest_munic_basedados.mjs` | ETL — IBGE MUNIC via BASE DE DADOS OFICIAL (xlsx), não SIDRA. Fonte completa e fidedigna: cada município × cada pergunta. Auto-cura os indicadores de PLANO/CONSELHO/FUNDO/INSTRUMEN |
| `scripts/ingest_munic_sc.mjs` | ETL — IBGE MUNIC (Pesquisa de Informações Básicas Municipais): instrumentos de gestão por município. "tem/não tem" planos e conselhos municipais (vários são pré-requisito p/ transf |
| `scripts/ingest_nf_sc.mjs` | ETL — Notas Fiscais / Instrumentos de Cobrança (PNCP, API de Consulta /v1/instrumentoscobranca). Traz chave NFe + vínculo ao contrato. Hoje cobertura em SC ~0 (municípios não publi |
| `scripts/ingest_pca_sc.mjs` | ETL — PCA (Plano Anual de Contratações) do PNCP por município de SC. Descobre os CNPJs dos órgãos municipais (contratações esfera M) e puxa /pca/atualizacao?cnpj= de cada (o filtro |
| `scripts/ingest_pdde_sc.mjs` | ETL — PDDE (Programa Dinheiro Direto na Escola) por MUNICÍPIO de SC (rede municipal). Fonte: FNDE, Plataforma Antonieta de Barros, produto "Execução Financeira PDDE Básico - Públic |
| `scripts/ingest_pnld_sc.mjs` | ETL — PNLD reserva técnica (remanejamento de livros) por MUNICÍPIO de SC (rede municipal). Fonte: FNDE, Plataforma Antonieta de Barros, produto "PDA_PNLD" (id 48) — oferta/demanda  |
| `scripts/ingest_populacao_idade_sc.mjs` | ETL — População por idade (0-17) por município de SC, IBGE Censo 2022 via SIDRA (tabela 9514). Habilita os indicadores de DEMANDA/déficit: vagas de creche (0-3), pré-escola (4-5),  |
| `scripts/ingest_precatorios_sc.mjs` | ETL — Precatórios por município de SC, via API do TJSC (sistema de Regime Especial de Precatórios). Lista entes devedores → soma/qtde de precatórios por ente → agrega por município |
| `scripts/ingest_precos_referencia_sc.mjs` | ETL — Preço de REFERÊNCIA por item (descritivo canônico + unidade) entre municípios de SC, a partir de itens_sc (PNCP). Base da análise de VARIAÇÃO DE PREÇOS / sobrepreço (não há C |
| `scripts/ingest_previne_sc.mjs` | ETL — Previne Brasil (indicadores de desempenho da APS / SISAB) por município de SC. Fonte: CSV oficial por quadrimestre (Portal de Dados Abertos do SUS, S3). Agrega numerador/deno |
| `scripts/ingest_processos_sc.mjs` | ETL — TODOS os processos de contratação do PNCP em SC (todas as modalidades, todos os anos). Fonte: API Consulta /v1/contratacoes/publicacao (exige codigoModalidadeContratacao; lim |
| `scripts/ingest_programa_beneficiario_sc.mjs` | ETL — ELEGIBILIDADE: quem pode captar cada programa (Transferegov fundoafundo/programa_beneficiario, API viva). Responde "quais municípios são elegíveis" — base do casamento oportu |
| `scripts/ingest_programas_agil.mjs` | ETL — programas "gestão ágil" do Transferegov (fundoafundo/programa_gestao_agil), somados ao catálogo programas_transferegov. Complementa fundoafundo/programa. node scripts/ingest_ |
| `scripts/ingest_programas_federais_curados.mjs` | ETL — REGISTRO CURADO de programas federais de infraestrutura (saúde/educação) que o município pode pleitear. FNS/FNDE não expõem "janela aberta" por API limpa (SISMOB/Habilita são |
| `scripts/ingest_pronaf_sc.mjs` | ETL — PRONAF / Crédito Rural por município de SC. Fonte: BCB SICOR (Olinda OData v2). Entitysets agregados CusteioMunicipioProduto (VlCusteio+codIbge) e InvestMunicipioProduto (VlI |
| `scripts/ingest_queimadas_sc.mjs` | ETL — INPE queimadas (focos de calor) por município. Fonte: dataserver-coids.inpe.br (CSVs mensais Brasil). Download via CURL (timeout confiável — o fetch do Node pendura na conexã |
| `scripts/ingest_radar_captacao_sc.mjs` | ETL — Radar de Captação (Transferegov/SICONV): PROGRAMAS que cada município pode captar (elegibilidade) + janela de proposta aberta. Fonte: repositorio.dados.gov.br/seges/detru (CS |
| `scripts/ingest_receitas_detalhe_sc.mjs` | ETL — Receitas DETALHADAS por item nominal (IPTU, ISS, FPM, ICMS, IPVA, ITR, FUNDEB) via SICONFI RREO Anexo 03 (Demonstrativo da RCL). Soma os 12 meses (colunas <MR-11..MR>) = tota |
| `scripts/ingest_rgf_sc.mjs` | ETL — RGF (Relatório de Gestão Fiscal, SICONFI): número OFICIAL de pessoal por Poder (Executivo) e Dívida Consolidada Líquida. Anexo 01 = DTP % sobre RCL Ajustada (limites LRF); An |
| `scripts/ingest_rpps_atuarial_sc.mjs` | ETL — Déficit ATUARIAL dos RPPS (projeção de longo prazo) via CADPREV (SPREV). Fonte: apicadprev.trabalho.gov.br /DRAA_VALORES_COMPROMISSOS (item "Déficit Atuarial" + ativos garant |
| `scripts/ingest_rpps_crp.mjs` | ETL — CRP (Certificado de Regularidade Previdenciária) dos RPPS via CADPREV (SPREV). Fonte: apicadprev.trabalho.gov.br /RPPS_CRP. É o mesmo dado da tela "Consultas Públicas → Pesqu |
| `scripts/ingest_rpps_sc.mjs` | ETL — Previdência (RPPS) por município/Estado de SC. Fonte: SICONFI RREO Anexo 04. Receitas × despesas previdenciárias, resultado do fundo, contribuições e benefícios. Só entes COM |
| `scripts/ingest_rreo_constitucional_sc.mjs` | ETL — RREO constitucional (SICONFI): Educação MDE (Anexo 14, % aplicado real), RCL (Anexo 03, TOTAL últimos 12 meses → base legal do limite de pessoal da LRF) e tentativa de Saúde  |
| `scripts/ingest_sancoes.mjs` | ETL — Sanções a empresas/pessoas (CEIS + CNEP) via API do Portal da Transparência (CGU). CEIS = Empresas Inidôneas e Suspensas · CNEP = Empresas Punidas. Nacional, paginado (15/pág |
| `scripts/ingest_saneamento_sc.mjs` | ETL — Saneamento por município (SC), Censo 2022 IBGE via SIDRA: % de domicílios com água (rede geral), esgotamento adequado (rede/pluvial/fossa ligada) e lixo coletado. Casa com dé |
| `scripts/ingest_sazonalidade_preco_sc.mjs` | ETL — Sazonalidade de PREÇO por categoria de produto (SC). Índice relativo: preço do mês ÷ mediana anual do MESMO item canônico (normaliza itens diferentes). Identifica o melhor mê |
| `scripts/ingest_sc.mjs` | Ingestão de dados OFICIAIS de Santa Catarina (SICONFI/Tesouro) para o banco. 295 municípios (lista IBGE) + Estado de SC. Anos 2021–2024. RREO Anexos 01 e 02. Idempotente (UPSERT).  |
| `scripts/ingest_sia_sc.mjs` | ETL — PRODUÇÃO ambulatorial (SIA/SUS) por município de SC, via TabNet/DATASUS. Qtd. aprovada e valor aprovado, por ano. Mesma técnica do SIH (tabcgi.exe, latin1, filtros TODAS_AS_C |
| `scripts/ingest_sih_sc.mjs` | ETL — PRODUÇÃO hospitalar (SIH/SUS) por município de SC, via TabNet/DATASUS. Internações e valor total, por ano (soma das 12 competências). 1 requisição traz todos os municípios. F |
| `scripts/ingest_siop_acoes.mjs` | ETL — Catálogo de Ações Orçamentárias do Governo Federal (SIOP, dados abertos, CSV público, sem auth). É o catálogo-mãe do que uma emenda pode financiar, por setor (Função). Nacion |
| `scripts/ingest_siops_sc.mjs` | ETL — SIOPS (Saúde): % da receita própria aplicada em ASPS conforme LC 141 (mínimo constitucional 15%). Fonte oficial: API pública SIOPS/Min. Saúde (indicador 3.2). co_municipio =  |
| `scripts/ingest_snis_residuos_sc.mjs` | ETL — SNIS RESÍDUOS SÓLIDOS por município, via app do Ministério das Cidades (mesmo wizard Yii/jqGrid da água/esgoto, módulo "Agrupamento dinâmico de indicadores"). Entrada pelo li |
| `scripts/ingest_snis_sc.mjs` | ETL — SNIS Água e Esgoto por município (desagregado por prestador), via app do Ministério das Cidades. Dirige o wizard Yii/jqGrid (app4.cidades.gov.br) e lê o grid completo. State- |
| `scripts/ingest_suas_sc.mjs` | ETL — Assistência social / FNAS por município de SC (MDS · MI Social / CadSUAS). Quantidade de CRAS, CREAS e unidades de acolhimento + população + repasse FNAS fundo-a-fundo. Base  |
| `scripts/ingest_transferegov_api.mjs` | ETL — Transferegov API VIVA (PostgREST, fonte original autoritativa). Substitui o dump histórico do SICONV. 1) programas_transferegov: catálogo de programas + janela de proposta vo |
| `scripts/ingest_transferencias_sc.mjs` | Ingestão de Transferências da União / Convênios (Transferegov) via Portal da Transparência (CGU). Requer PORTAL_TRANSPARENCIA_KEY no .env.local. Idempotente (UPSERT por município). |
| `scripts/ingest_transferencias_stn.mjs` | ETL — Transferências obrigatórias da União por município (OFICIAL, STN/Tesouro Transparente CSV). FPM, FUNDEB, ITR, Lei Kandir (LC 87/96), CIDE, FEX, IOF-Ouro, LC 176. Soma os 12 m |
| `scripts/ingest_votos_bancada_sc.mjs` | ETL — Votos de cada parlamentar da BANCADA por município (TSE, eleição 2022) p/ o targeting de emendas. Fonte: TSE votação nominal por município/zona 2022 (zip nacional; extrai só  |
| `scripts/ingest_votos_senadores_sc.mjs` | ETL — Votos dos SENADORES da bancada por município. Senador é eleito por eleição própria (2018/2022) e os SUPLENTES em exercício não têm votos próprios → usamos os votos do TITULAR |
| `scripts/motor_fundeb_sc.mjs` | MOTOR FUNDEB — calcula matrículas PONDERADAS por município aplicando os fatores oficiais (fatores_fundeb) às matrículas FUNDEB (dataset FNDE), e o VAAF = receita ÷ ponderadas. Guar |
| `scripts/motor_notificacoes.mjs` | MOTOR DE DELTA das notificações — computa os alertas ATUAIS por município (SQL direto sobre as bases), gera uma chave_delta que captura o ESTADO do fato, e registra em notificacao_ |
| `scripts/probe_cadprev.mjs` | PROBE (read-only) — cataloga a superfície da API CADPREV (apicadprev.trabalho.gov.br). Para cada recurso: status HTTP, se exige dt_exercicio, nomes dos campos e o campo identificad |
| `scripts/prova_completude_emendas_fed.mjs` | PROVA DE COMPLETUDE (FONTE→BASE) — Emendas federais EXECUÇÃO (Portal da Transparência). Risco: o coletor só captura localidadeDoGasto no padrão "Cidade - SC"; emendas de SC com loc |
| `scripts/prova_real_emendas_fed.mjs` | PROVA REAL — o motor federal (getCaptacaoEmendasSC) não "esquece" dado? Concilia a BASE (emendas_execucao_sc / emendas_indicacao_sc) com o que o MOTOR projeta, linha a linha e valo |
| `scripts/prova_real_notificacoes.mjs` | PROVA REAL dos motores de notificação/risco — concilia o que o MOTOR gera (notificacao_log) com uma consulta INDEPENDENTE na base. Foco: (a) false-positive (motor flagou quem não d |
| `scripts/recover_dca.mjs` | Recuperação dos municípios SC sem RREO: usa a DCA (Declaração de Contas Anuais) do SICONFI. DCA-Anexo I-C (receita), I-D (despesa por categoria), I-E (despesa por função). node scr |
| `scripts/scrape_simad_programas.mjs` | Raspa a tabela oficial código→nome do dropdown p_programa do SIMAD (FNDE), para decodificar/agrupar os repasses. node scripts/scrape_simad_programas.mjs |
| `scripts/seed.mjs` | PNIGP — Seed de dados simulados realistas (Painel do Prefeito) Gera municípios, indicadores setoriais, série histórica, índices e metas. Uso: node scripts/seed.mjs   (lê DATABASE_U |
| `scripts/seed_compras.mjs` | PNIGP — Seed de Compras Públicas (municípios + estados). Métricas inspiradas no PNCP / Compras Gov, correlacionadas ao ICEB do ente. Uso: node scripts/seed_compras.mjs |
| `scripts/seed_contratacoes.mjs` | PNIGP — Seed de Contratações Públicas (estilo PNCP) — municípios + estados. Gera licitações/contratos individuais por ente. Uso: node scripts/seed_contratacoes.mjs |
| `scripts/seed_estados.mjs` | PNIGP — Seed de dados estaduais simulados (Painel do Governador) Reutiliza as definições da tabela `indicadores`. Uso: node scripts/seed_estados.mjs |
| `scripts/seed_financas.mjs` | PNIGP — Seed de Finanças Públicas (receitas e despesas) — municípios + estados. Inspirado no SICONFI/FINBRA. Valores em R$, correlacionados ao ICEB e à população. Uso: node scripts |
| `scripts/setup_notificacoes.mjs` | Fundação do sistema de NOTIFICAÇÕES — cria as 4 tabelas e popula a notificacao_regras com o catálogo (Secretaria × Natureza × Prazo). Idempotente (UPSERT). Tabelas NOVAS — não alte |
| `scripts/snis_explore.mjs` | EXPLORAÇÃO do SNIS desagregado (água/esgoto) — captura como as opções carregam + os códigos. node scripts/snis_explore.mjs |
| `scripts/stn_capture.mjs` | Captura as chamadas à API ARIA do Tesouro feitas pelo dashboard de Transferências Constitucionais. Objetivo: descobrir o endpoint de VALORES por município. node scripts/stn_capture |
| `scripts/supervisor_coleta.mjs` | SUPERVISOR auto-recuperável da coleta PNCP/SC. Um único processo é dono do ciclo de vida: roda cada ETL como filho, monitora o PROGRESSO REAL no Neon e, se estagnar (sem avanço por |
| `scripts/validacao_continua.mjs` | VALIDAÇÃO CONTÍNUA — auditor independente do coletor (só lê + flaga, nunca atrapalha a coleta). A cada INTERVALO: aplica regras de integridade, marca anomalias IMPOSSÍVEIS como sus |
| `scripts/validacao_estado_vazamento.mjs` | VALIDAÇÃO DE INTEGRIDADE — premissa: Estado e municípios NUNCA na mesma comparação municipal. O Estado de SC existe no banco (cod_ibge='42', tipo='E', p/ o motor de peças e futura  |
| `scripts/validar_consistencia.mjs` | Validação de consistência/integridade dos dados oficiais (SC) após os ETLs. Cobertura por base, duplicatas (vazamento de CNPJ compartilhado), conexões, e amostra planejado × contra |
| `scripts/validate_msc.mjs` | FASE 1 — validação MSC↔RREO. Baixa a MSC orçamentária completa de um ente/ano e procura a agregação que reproduz o empenhado/dotação do RREO. node scripts/validate_msc.mjs |
| `scripts/validate_msc_40.mjs` | VALIDAÇÃO — 40 municípios aleatórios: compara o total de despesa empenhada do SICONFI (RREO ao vivo) com o gerado pelo sistema (MSC ancorada). Também confere se a soma das partes ( |
| `scripts/validate_msc_multi.mjs` | FASE 1 (validação multi-município) — confirma que MSC conta 6.2.2.1.3.04 (empenhado) reconcilia com o RREO. |
| `scripts/validate_subfuncao_db.mjs` | VALIDAÇÃO pós-reingestão — confirma que o despesa_subfuncao_sc GRAVADO (anos fechados) bate com o RREO oficial ao vivo. node scripts/validate_subfuncao_db.mjs   (N combos município |
| `scripts/varredura_frescor.mjs` | Varredura de FRESCOR + SÉRIE HISTÓRICA — consulta as PRÓPRIAS tabelas (não o max_ano do catálogo, que engana): para cada tabela com coluna de ano/competência, calcula a série (min– |
| `scripts/warm_compras.mjs` | Pré-aquece o cache de compras (PNCP) das maiores cidades de SC + Estado, chamando a API de produção sequencialmente (usa o IP do Vercel). node scripts/warm_compras.mjs |

## 2b. Componentes (visões e molde do produto)

| Componente | O que faz |
|---|---|
| `accountability-aps.tsx` | Calendário legal de prestação de contas (obrigações reais — base neutra, sem juízo). |
| `acesso-financeiro-sc.tsx` | Aba Sistema Financeiro — infraestrutura de acesso (agências/cooperativas/correspondentes) + movimento (Pix). |
| `acompanhamento-funcao.tsx` | ACOMPANHAMENTO por FUNÇÃO — orçado (dotação) × realizado (empenhado) até o bimestre vigente, por função. |
| `acompanhamento.tsx` | ACOMPANHAMENTO intra-anual — execução do orçamento até o bimestre vigente vs ritmo esperado (proporcional). |
| `alertas-notificacao.tsx` | Modelos de NOTIFICAÇÃO de alertas — e-mail, SMS e WhatsApp — gerados a partir dos alertas REAIS do município. |
| `analise-compras-itens.tsx` | Análise de compras por ITEM (descritivo, sem CATMAT): onde o município paga acima dos pares de SC (economia potencial) |
| `analise-educacao.tsx` | Análise #80 — cruza o GARGALO (IDEB abaixo da meta) com o RECURSO (FNDE recebido) e sugere a AÇÃO/pleito. |
| `analise-saude.tsx` | Análise #80 (saúde) — cruza GARGALO (indicadores de APS abaixo dos pares / mínimo de 15%) com RECURSO (FNS) e AÇÃO. |
| `assunto-atencao-primaria.tsx` | o que o numerador conta (a "produção" de cada indicador) |
| `assunto-captacao.tsx` | índice de criticidade da oportunidade por prazo até o fim da janela (urgência de agir) |
| `assunto-iegm.tsx` | conhecimento de cada dimensão (o que mede + como melhorar + cruzamento com nossos dados) |
| `atas-painel.tsx` | Atas de Registro de Preço — visão própria (preço registrado + quantidade máxima; gasto real = empenhos contra a ata). |
| `auditoria-lazy.tsx` | Auditoria sob demanda: o `diag` (~2,6 MB) é buscado via API ao abrir a aba (não vai no HTML inicial), |
| `baixar-csv.tsx` | Botão reutilizável de exportação CSV — leva o dado para a LOA/LDO, requerimentos, planilhas (recomendação do |
| `base-metodologica.tsx` | Base metodológica de uma área: marcos legais + biblioteca de materiais oficiais (modelo de Compras). |
| `boletim-gestao.tsx` | Boletim de Gestão — o "resumo de tudo para TODOS" (periódico), que mantém a equipe inteira informada do quadro |
| `brand.tsx` | Marca PNIGP — monograma próprio (arcos concêntricos = inteligência/radar territorial 360°). |
| `cabecalho-area.tsx` | Cabeçalho FRACTAL de área: repete o padrão de camadas (Estratégico→Tático→Operacional) dentro do bloco. |
| `cadastro-servidor.tsx` | Ficha cadastral do servidor para notificação — quem recebe o quê (secretaria + perfil + área), por qual canal, |
| `calendario-obrigacoes.tsx` | Calendário de obrigações — a camada PROATIVA das notificações: avisa ANTES dos prazos legais recorrentes |
| `carimbo.tsx` | Carimbo de proveniência reusável — "fonte · competência · extraído em". |
| `catalogo-boas-praticas.tsx` | Catálogo de boas práticas por área — ações comprovadas (o que fazer · impacto · base legal). Aditivo, não substitui nada. |
| `censo-tendencias.tsx` | Tendência histórica da rede municipal (Censo escola×ano) — mini-gráficos de linha por métrica. Tom neutro. |
| `charts/area-empilhada.tsx` | Área empilhada — leitura de COMPOSIÇÃO ao longo do tempo (distinta da linha, que mostra trajetória). |
| `charts/orcado-executado.tsx` | Orçado × Executado por função — formato barra de progresso (executado preenchendo o orçado), com % e valores |
| `cmed-consulta.tsx` | Consulta do preço-teto legal de medicamentos (CMED/Anvisa PMVG) — referência para compras de saúde. |
| `comparador.tsx` | Comparador dinâmico — escolha 2 a 5 municípios e as ÁREAS (Fiscal/Saúde/Educação/Assistência/Compras/Captação). |
| `compras-categorias.tsx` | Gasto efetivado por categoria oficial CATMAT/CATSER — para onde vai o dinheiro, no eixo do catálogo federal. |
| `compras-extra.tsx` | Curva ABC (concentração do gasto) + dispersão de preço entre municípios (onde o "preço único" mais falha). Tom didático. |
| `contratos-gestao.tsx` | Índice de criticidade do vencimento — combina URGÊNCIA do prazo (70%) e MAGNITUDE do valor (30%). |
| `convenios-card.tsx` | Convênios e contratos de repasse recebidos (SICONV/Transferegov). Tom neutro: captado, executado e situação. |
| `crp-historico.tsx` | Histórico completo da CRP do ente (todos os certificados) — o vigente em destaque + a série completa. |
| `divida-panel.tsx` | Painel de Dívida do município — Dívida Consolidada Líquida (DCL) oficial do RGF/SICONFI: valor, % da RCL vs limite |
| `eficiencia-educacao.tsx` | Índice de Eficiência (Educação) — custo por aluno × IDEB vs pares. Quadrante + leitura/ação. Tom neutro. |
| `eficiencia-saude.tsx` | Índice de Eficiência (Saúde) — gasto/hab × resultado da APS (média Previne) vs pares. Quadrante + leitura. Tom neutro. |
| `emendas-card.tsx` | Emendas parlamentares recebidas (SICONV/Transferegov — via convênio). Tom NEUTRO: só valores e autor, sem leitura |
| `equipamentos-suas-drill.tsx` | rótulo/cor por tipo de unidade do SUAS |
| `escolas-drill.tsx` | Drill escola a escola (rede municipal): lista com infraestrutura + quadro de pessoal; cada escola EXPANDE para |
| `estab-saude-drill.tsx` | Equipamentos públicos de saúde — rede CNES estabelecimento a estabelecimento. Foco em regulação: composição da rede, |
| `estab-saude-lazy.tsx` | Defere o RENDER dos Equipamentos de Saúde (~2,4MB de HTML, todos os estabelecimentos) para o cliente. |
| `fnde-educacao-card.tsx` | Recursos federais da educação (FNDE/SIMAD) recebidos pelo município — PNAE, PNATE, FUNDEB, salário-educação… |
| `folha-sc.tsx` | Limites LRF do Executivo (% sobre a RCL): alerta 48,6 · prudencial 51,3 · máximo 54 |
| `fornecedores-card.tsx` | Fornecedores do município (PNCP): concentração, ME/EPP (fomento local), de fora (vazamento), recorrentes. Tom neutro. |
| `fornecedores-sancionados.tsx` | CEIS/CNEP × FORNECEDORES — controle: fornecedores do município com sanção VIGENTE, com o órgão sancionador e o motivo. |
| `fundeb-painel.tsx` | Painel FUNDEB — retrato NEUTRO (7 indicadores) + "como chegamos" (passo-a-passo da ponderação, didático p/ ensinar |
| `geolocalizacao-lazy.tsx` | Wrapper que carrega o mapa SOB DEMANDA (client-fetch ao montar) — tira ~846 KB do HTML inicial do painel. |
| `geolocalizacao.tsx` | Aba GEOLOCALIZAÇÃO — o ÚNICO mapa da aplicação, por camadas. Para "ligar" uma nova camada |
| `ideb-painel.tsx` | Painel do IDEB — observado × meta + série histórica. Exibição neutra e pedagógica. |
| `indicadores-inep.tsx` | Indicadores educacionais INEP (rede municipal) — AFD (formação docente), TDI (distorção idade-série), ATU (alunos/turma). |
| `infraestrutura-sc.tsx` | Aba INFRAESTRUTURA — começa pelo Saneamento (Censo 2022 IBGE). Extensível: SNIS (índices operacionais), |
| `mapa-leaflet.tsx` | Renderizador do mapa (Leaflet). Client-only — carregado via next/dynamic(ssr:false) pelo wrapper, |
| `mapa-maplibre.tsx` | Renderizador do mapa (MapLibre GL — WebGL/GPU). Client-only (via next/dynamic ssr:false). |
| `matriculas-card.tsx` | Matrículas (Censo Escolar) — a "produção" da cadeia da educação (💰 financiamento → 🏭 matrículas → ❤️ IDEB). |
| `metodologia-itens.tsx` | Nota metodológica ÚNICA (fonte de verdade) sobre como os itens de compra são tratados: |
| `minuta-loa.tsx` | MINUTA DA LOA — apresenta a sugestão do motor no formato OFICIAL (articulado + anexos da Lei 4.320/64 + LRF), |
| `msc-despesa.tsx` | MSC ANCORADA AO RREO — despesa empenhada por natureza (pessoal/custeio/investimento) e por fonte (livres×vinculados). |
| `munic-gestao.tsx` | IBGE MUNIC — instrumentos de gestão do município (planos, conselhos, fundos, instrumentos legais). |
| `nota-tecnica-indice.tsx` | Nota Técnica pública e versionada do Índice de Gestão Fiscal — torna a metodologia auditável (recomendação do |
| `novas-fontes.tsx` | Painéis das novas fontes (eixos econômico/ambiental/social/saúde). Server components, compactos. |
| `otimizador-receita.tsx` | Otimizador de Receitas Próprias — quanto o município poderia arrecadar a mais (IPTU/ISS/ITBI) vs pares de mesmo |
| `painel-impacto.tsx` | Painel de impacto + escalonamento — o ROI do serviço de notificação: alertas ativos, o que escalou (crítico sem |
| `panel-tabs.tsx` | ao trocar de grupo, abre a 1ª sub-aba dele |
| `peca-completa.tsx` | PEÇA ORÇAMENTÁRIA COMPLETA (sugestão) — síntese do motor: receita projetada → despesa por função |
| `perfil-educacao.tsx` | Perfil da rede municipal de educação — quem é atendido (equidade, inclusão, idade), turmas e transporte. Tom neutro. |
| `perfil-saude.tsx` | Perfil da rede de saúde — estrutura por nível de atenção, público×privado e cobertura per capita. Tom neutro/didático. |
| `pesquisa-preco.tsx` | Pesquisa de preço de referência (Lei 14.133): o gestor digita o item e recebe o preço justo (mediana SC + faixa) |
| `placar-estrategico.tsx` | liga a ação (Estratégico) ao lugar onde ela se executa (Tático/Operacional) — coordenação visível |
| `plano-evolucao-i10.tsx` | "Evoluir a gestão com o Instituto i10" — a plataforma IDENTIFICA a necessidade (diagnóstico data-driven) e o |
| `ppa-programa.tsx` | PPA por programa — detalhamento da despesa por FUNÇÃO → SUBFUNÇÃO (orçado×executado), o nível programático |
| `projetos-elegiveis.tsx` | Motor de projetos elegíveis — cruza os programas federais curados (programas_federais_sc) com as áreas em que o |
| `radar-crp-sc.tsx` | Bloco dedicado do Governo do Estado (ente próprio, com RPPS/CRP própria) — separado dos municípios. |
| `red-flags-fornecedores.tsx` | RED FLAGS DE FORNECEDORES — sinais de risco de integridade por fornecedor: concentração de mercado, sanção vigente |
| `repasses-saude-ficha.tsx` | Programas/repasses da saúde no MOLDE do Previne: o que é · por que importa · série · como melhorar. |
| `repasses-stn.tsx` | Repasses da União por município — matriz MENSAL + total anual por repasse + soma de todos (STN/Tesouro). |
| `resolver-alertas.tsx` | Resolver alertas — fecha o ciclo do serviço: o gestor marca um alerta como resolvido (e informa o impacto: |
| `resumo-compras.tsx` | Resumo executivo da aba Compras — 4 números-chave para o gestor leigo bater o olho. Tom neutro. |
| `resumo-executivo.tsx` | separa conformidade (legal) de desempenho (relativo): conformidade OK + posição ruim NÃO é "tudo bem" |
| `sazonalidade-preco.tsx` | Melhor mês de compra por grupo de produtos (SC). Índice relativo: 100 = preço típico; <100 = mais barato que o normal. |
| `sobrepreco-compras.tsx` | COMPRAS POR PREÇO UNITÁRIO — itens em que o município pagou acima da mediana de SC para o mesmo item. |
| `termo.tsx` | Glossário central — explica siglas/jargão para o gestor não-técnico (público-alvo do PNIGP). |
| `variacao-interna.tsx` | VARIAÇÃO INTERNA DE PREÇOS — o próprio município comprou o mesmo item a preços diferentes. |
| `vies-previsao.tsx` | PROTÓTIPO — Viés de previsão de receita (semente do motor de sugestão de peças orçamentárias). |

## 3. Fontes de dados (catálogo de coleta)

| Fonte | Provedor | Ano + recente | Última coleta | Situação |
|---|---|---|---|---|
| CFEM — royalties de mineração por município (ANM, distribuição) | anm | 2022 | há 0h | em dia |
| Preços de combustíveis por município (ANP, semestral, série 2004+) | anp | 2021 | há 0h | em dia |
| Cobertura de planos de saúde por município (ANS — pressão sobre o SUS) | ans | 2026 | nunca | pendente |
| CMED/Anvisa PMVG — preço-teto legal de medicamentos (Conformidade Gov, auto-descobre URL); referência nacional p/ sobrepreço em saúde (SC = ICMS 17%) | anvisa | 2025 | há 3d | em dia |
| Sistema financeiro por município (BCB Olinda — agências/cooperativas/correspondentes + Pix série) | bcb | — | há 0h | em dia |
| ESTBAN — volumes bancários por município (BCB, crédito/poupança, série) | bcb | — | há 0h | em dia |
| PRONAF / Crédito Rural por município — valor contratado por ano (BCB SICOR/Matriz do Crédito Rural, OData; cdEstado=25) | bcb | 2025 | há 0h | pendente |
| BNDES desembolsos por município (crédito produtivo, série 1995+) | bndes | 2026 | há 0h | pendente |
| Espelho completo CADPREV (37 recursos: DAIR/DIPR/DRAA/RPPS_*) | cadprev | — | há 7d | em dia |
| Alertas de CRP (transições vencido/a vencer — varredura) | cadprev | — | há 7d | em dia |
| Déficit atuarial RPPS (CADPREV/DRAA) | cadprev | — | há 14d | em dia |
| Regularidade previdenciária CRP (CADPREV — Consulta Pública) | cadprev | — | há 7d | em dia |
| Equipamentos SUAS — fallback de geo por CEP (AwesomeAPI) | cadsuas | — | há 0h | pendente |
| Equipamentos SUAS — endereço/telefone (CadSUAS detalhe, HTTP) | cadsuas | — | nunca | em dia |
| Equipamentos SUAS — geocodificação (Nominatim/OSM por endereço) | cadsuas | — | nunca | em dia |
| Equipamentos SUAS por unidade (CadSUAS, Playwright): CRAS/CREAS/Centro POP/Acolhimento + nome/nº | cadsuas | — | nunca | em dia |
| Transferências (CGU) | cgu | — | há 14d | em dia |
| Habitação — MCMV (Minha Casa Minha Vida), unidades financiadas por município (Min. Cidades, gov.br/cidades — sem WAF); alimenta o casamento oportunidade×necessidade | cidades | 2025 | há 4d | em dia |
| CNES — rede de saúde (Min. Saúde) | cnes | 2026 | há 14d | em dia |
| Catálogo oficial CATMAT/CATSER (Compras.gov.br) — espinha de classificação | compras | — | há 9d | em dia |
| Bancada federal do estado (deputados + senadores) p/ módulo de Captação de Emendas — APIs Câmara + Senado | congresso | 2025 | há 2d | em dia |
| Estabelecimentos de saúde por município (CNES — rede p/ regulação, API DEMAS) | datasus | 2025 | há 11d | em dia |
| Previne Brasil — indicadores APS (SISAB) | datasus | — | há 14d | em dia |
| SIA — produção ambulatorial (DATASUS) | datasus | 2025 | há 14d | em dia |
| SIH — produção hospitalar (DATASUS) | datasus | 2025 | há 14d | em dia |
| Análise de compras por PREÇO UNITÁRIO — livro de preços de referência de SC + sobrepreço por município (derivado de itens_sc, via SQL) | derivado | 2025 | há 4d | em dia |
| Red flags de fornecedores — concentração + sanção (CEIS/CNEP) + sobrepreço por fornecedor (derivado de contratos/itens/sancoes, via SQL) | derivado | 2025 | há 4d | em dia |
| Indícios de sobrepreço em medicamentos (compras do município vs teto legal PMVG, por substância+dosagem); derivado de cmed_pmvg + itens_sc | derivado | 2025 | há 3d | em dia |
| Variação INTERNA de preços — mesmo município comprou o mesmo item a preços diferentes (derivado de itens_sc, via SQL) | derivado | 2025 | há 4d | em dia |
| Bolsa Atleta por município (Min. Esporte — atletas + valor) | esporte | 2025 | há 0h | pendente |
| Matrículas FUNDEB oficiais (FNDE Antonieta de Barros) | fnde | 2026 | há 0h | em dia |
| Parâmetros FUNDEB — fatores/VAAT/VAAR (FNDE) | fnde | 2026 | há 0h | em dia |
| PDDE por município (FNDE — Plataforma Antonieta de Barros) | fnde | 2024 | há 1d | em dia |
| PNLD reserva técnica — demanda de livros (FNDE — Antonieta de Barros) | fnde | 2025 | há 0h | em dia |
| Repasses federais FNS por bloco (Consulta Consolidada) | fns | 2026 | há 14d | em dia |
| Agricultura e agricultura familiar por município — Censo Agropecuário 2017 (IBGE/SIDRA t/6778+6883): estabelecimentos + área, familiar vs não-familiar | ibge | 2025 | há 3d | em dia |
| Georreferência dos entes (centroide/área/região — IBGE malhas; base p/ frete e variação de preço) | ibge | 2025 | há 9d | em dia |
| Indicadores (IBGE/CGU) | ibge | 2024 | há 14d | em dia |
| População indígena (IBGE Censo 2022) | ibge | — | há 14d | em dia |
| IBGE MUNIC — instrumentos de gestão (planos/conselhos/fundos/instrumentos legais) por município, da BASE DE DADOS oficial (xlsx), não SIDRA | ibge | 2025 | há 4d | em dia |
| Saneamento por município (água/esgoto/lixo) — IBGE Censo 2022 via SIDRA (cobertura por domicílio) | ibge | 2025 | há 7d | em dia |
| Censo Escolar — matrículas (INEP Sinopse) | inep | 2025 | há 12d | em dia |
| Educação especial/AEE por município (INEP Censo microdata) | inep | 2025 | há 0h | em dia |
| Escolas por município + infraestrutura (INEP Censo Escolar) | inep | 2025 | há 11d | em dia |
| FNDE liberações por município (SIMAD, Playwright) | inep | 2025 | há 11d | em dia |
| IDEB — indicadores educacionais (INEP) | inep | 2025 | há 12d | em dia |
| Indicadores educacionais INEP (AFD/TDI/ATU/rendimento por município) | inep | 2025 | há 0h | em dia |
| Indicadores INEP por escola (georreferenciado) | inep | 2025 | há 0h | em dia |
| Focos de calor por município (INPE BDQueimadas, mensal) | inpe | 2026 | há 0h | em dia |
| IEGM — qualidade da gestão (TCE-SC/IRB, dados abertos) | irb | 2025 | há 2d | em dia |
| CAF — Cadastro Nacional da Agricultura Familiar (ex-DAP) por município: nº de agricultores familiares (MDA, XLSX mensal) | mda | 2025 | há 3d | em dia |
| Guardião de frescor (série + última competência) | meta | — | há 0h | em dia |
| Equipamentos segurança/justiça/defesa civil georreferenciados (OSM + SAP/SC): polícia, bombeiros, defesa civil, prisional, socioeducativo | osm | — | há 7d | em dia |
| Atas de Registro de Preço (PNCP Consulta) | pncp | — | há 14d | em dia |
| Classificação dos itens → CATMAT/CATSER (dicionário, matcher v2) | pncp | — | há 9d | em dia |
| Busca diária do PNCP (compras/contratos/atas — ano corrente) | pncp | — | há 15h | em dia |
| Compras (PNCP ano corrente) | pncp | 2026 | há 14d | em dia |
| Contratos (PNCP ano corrente, append) | pncp | 2026 | há 14d | em dia |
| Empenhos por contrato (PNCP Lei 14.133 — acende quando publicarem) | pncp | — | há 14d | em dia |
| Itens de TODOS os processos (preço unitário) | pncp | 2025 | há 13d | em dia |
| Notas fiscais / instrumentos de cobrança (PNCP — acende quando publicarem) | pncp | — | há 13d | em dia |
| PCA (PNCP) | pncp | — | há 14d | em dia |
| Preço de referência por item (mediana SC) + classificação ata/efetivada — base da análise de preços | pncp | 2025 | há 11d | em dia |
| Processos PNCP — TODOS (todas modalidades/anos) | pncp | 2025 | há 14d | em dia |
| Sazonalidade de preço por categoria (melhor mês de compra, SC) | pncp | 2025 | há 9d | em dia |
| Localidade dos fornecedores (CNPJ→UF/município) | receita | — | há 14d | em dia |
| CAR — Cadastro Ambiental Rural: nº de imóveis rurais por município (SICAR GeoServer WFS, contagem por município) | sicar | 2025 | há 3d | em dia |
| Acompanhamento intra-anual da execução (RREO do bimestre vigente) — receita prevista×realizada e despesa orçada×empenhada por município | siconfi | 2025 | há 4d | em dia |
| Acompanhamento por função (intra-anual) — orçado×realizado por função até o bimestre vigente (RREO Anexo 02 parcial) | siconfi | 2025 | há 4d | em dia |
| Despesa por subfunção (RREO an.2 — drill) | siconfi | 2025 | há 13d | em dia |
| Finanças (SICONFI RREO an.1/2) | siconfi | 2025 | há 14d | em dia |
| Metas Fiscais LDO (RREO an.6) | siconfi | 2025 | há 14d | em dia |
| MSC ancorada ao RREO — despesa empenhada por natureza e fonte (forma da MSC × total exato do RREO; reconcilia por construção) | siconfi | 2025 | há 4d | em dia |
| Receitas detalhadas (ICMS/FPM/IPTU/FUNDEB — RREO an.3) | siconfi | 2025 | há 13d | em dia |
| Pessoal/DCL (RGF) | siconfi | 2025 | há 14d | em dia |
| Previdência RPPS (RREO Anexo 04) | siconfi | 2025 | há 14d | em dia |
| Educação/RCL (RREO an.14/3) | siconfi | 2025 | há 14d | em dia |
| Estatísticas vitais por município (IBGE Registro Civil — nascidos/óbitos, série) | sidra | 2023 | há 0h | pendente |
| Catálogo de Ações Orçamentárias Federais (SIOP dados abertos) — o que emenda financia por setor; cruza com acao_orcamentaria da indicação | siop | 2025 | há 2d | em dia |
| Saúde ASPS (SIOPS) | siops | 2025 | há 14d | em dia |
| SNIS Água/Esgoto por município e prestador (atendimento, perdas, tratamento) — app Ministério das Cidades via Playwright; state-agnostic (UF/ANO) | snis | 2025 | há 7d | em dia |
| Regularidade fiscal CAUC/CADIN (Tesouro) | tesouro | — | há 7d | em dia |
| Transferências da União por município, MENSAL (FPM/FUNDEB/ITR/Lei Kandir/CIDE/FEX/IOF/LC176) — CSV oficial STN/Tesouro Transparente; NACIONAL, state-agnostic (UF env) | tesouro | 2025 | há 7d | em dia |
| Precatórios por município (estoque e quantidade) — API do TJSC, Regime Especial de Precatórios; replicável por UF (CNJ Res. 303) | tjsc | 2025 | há 7d | em dia |
| Assistência social COMPLETA (MDS MI Social): série anual de repasse FNAS 2005→ + CadÚnico + Bolsa Família | transferegov | 2025 | há 7d | em dia |
| Convênios e contratos de repasse por município (SICONV/Transferegov, repositório detru — proposta+convenio) | transferegov | 2025 | há 7d | em dia |
| Emendas — INDICAÇÃO (SICONV/Transferegov, repositório detru: parlamentar, impositivo, valor destinado) | transferegov | 2025 | há 9d | em dia |
| Emendas — EXECUÇÃO orçamentária federal (Portal da Transparência: empenhado×pago → recurso na mesa) | transferegov | 2026 | há 9d | em dia |
| Elegibilidade dos programas (Transferegov: quem pode captar cada programa — base do casamento oportunidade×necessidade) | transferegov | 2025 | há 9d | em dia |
| Catálogo de programas Transferegov — gestão ágil (fundoafundo/programa_gestao_agil); complementa o catálogo unificado de 335 programas | transferegov | 2025 | há 0h | em dia |
| Programas federais curados de saúde/educação (Novo PAC, Requalifica UBS, Proinfância — casamento com carência; FNS/FNDE sem feed) | transferegov | 2025 | há 9d | em dia |
| Radar de Captação — programas + planos (Transferegov fundo a fundo, API viva) | transferegov | 2025 | há 0h | em dia |
| Assistência social / FNAS por município (MDS · MI Social/CadSUAS: CRAS, CREAS — déficit p/ casamento) | transferegov | 2025 | há 9d | em dia |
| Sanções a empresas/pessoas (CEIS + CNEP) — API Portal da Transparência; cruza com fornecedores (fornecedor sancionado) | transparencia | 2025 | há 7d | em dia |

## 4. Rotas e APIs (Next.js)

- `/`
- `/api/auditoria-diag/[codigo]`
- `/api/caderno-emendas`
- `/api/cmed-pmvg`
- `/api/coleta-status`
- `/api/comparar`
- `/api/compras-item/[cnpj]/[ano]/[seq]`
- `/api/compras-sc/[codigo]`
- `/api/contratos-processo/[cnpj]/[ano]/[seq]`
- `/api/equipamentos-geo/[codigo]`
- `/api/etl-catalogo`
- `/api/modelo`
- `/api/notificacao-acao`
- `/api/notificacao-cadastro`
- `/api/plano-trabalho`
- `/api/preco-referencia/[q]`
- `/api/serie-anotacao`
- `/api/transferencias-sc/[codigo]`
- `/catalogo-dados`
- `/cidadao`
- `/cidadao/[codigo]`
- `/coleta`
- `/comparar`
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
