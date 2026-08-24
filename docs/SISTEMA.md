# PNIGP — Documentação do Sistema (gerada automaticamente)

> Gerada em 2026-08-23 07:13 -03 por `scripts/gerar_documentacao.mjs`. Reflete o estado real do código e do banco. **Não editar à mão.**

## 1. Banco de dados (Neon)

| Tabela | Registros | Colunas |
|---|---|---|
| `_ata_check` | 80 | 6 (cnpj, ano, seq, status, uri, checado_em) |
| `_legado_emendas_sc` | 906 | 15 (id_proposta, nr_emenda, cod_ibge, municipio, parlamentar, tipo_parlamentar, impositivo, programa…) |
| `_raiox_janela` | 936 | 6 (mod, ano, mes, n, feito_em, uf) |
| `_unidade_janela` | 624 | 6 (uf, mod, ano, mes, n, feito_em) |
| `acesso_financeiro_sc` | 590 | 13 (cod_ibge, competencia, n_agencias, n_bancos, n_postos_coop, n_cooperativas, n_postos_outros, n_correspondentes…) |
| `acompanhamento_funcao_sc` | 4.304 | 7 (cod_ibge, ano, bimestre, funcao, dotacao, empenhado, atualizado) |
| `acompanhamento_sc` | 251 | 8 (cod_ibge, ano, bimestre, receita_prevista, receita_realizada, despesa_dotacao, despesa_empenhada, atualizado) |
| `agropecuaria_sc` | 295 | 9 (cod_ibge, ano, estab_total, estab_familiar, estab_nao_familiar, area_total_ha, area_familiar_ha, area_nao_familiar_ha…) |
| `alfabetizacao_sc` | 295 | 3 (cod_ibge, taxa, atualizado) |
| `am_aam_ente` | 44 | 12 (slug, tipo, nome_portal, cod_ibge, municipio, tem_menu_pessoal, anos_com_folha, ultimo_ano…) |
| `am_aam_levantamento` | 224 | 13 (slug, ente, tipo, cod_ibge, municipio, tema, ano, mes…) |
| `am_anc_ente` | 19 | 7 (ancid, pasta, tipo, cod_ibge, municipio, uf, em) |
| `ana_outorgas_sc` | 265 | 9 (cod_ibge, n_outorgas, vazao_total, volume_total, atualizado, n_superficial, n_subterranea, por_finalidade…) |
| `anatel_bl_sc` | 295 | 5 (cod_ibge, ano_atual, acessos, serie, atualizado) |
| `aneel_gd_sc` | 295 | 6 (cod_ibge, n_empreendimentos, potencia_kw, top_fontes, serie, atualizado) |
| `anp_precos_sc` | 3.370 | 7 (cod_ibge, ano, semestre, produto, preco_medio, n_coletas, atualizado) |
| `anp_vendas_sc` | 28.841 | 5 (cod_ibge, ano, produto, vendas, atualizado) |
| `ans_cobertura_sc` | 295 | 8 (cod_ibge, ano, benef_medica, benef_total, populacao, taxa_cobertura, atualizado, pop_ano) |
| `apac_sc` | 294 | 7 (cod_ibge, periodo, onco_apac, onco_valor, dialise_apac, dialise_valor, atualizado) |
| `arboviroses_sc` | 5.900 | 7 (cod_ibge, doenca, ano, casos, incidencia_100k, nivel_max, atualizado) |
| `arquivo_binario_sc` | 0 | 14 (cnpj, ano, seq, sequencial_documento, cod_ibge, numero_controle, tipo_documento, storage…) |
| `arquivo_texto_sc` | 652.877 | 17 (cnpj, ano, seq, sequencial_documento, cod_ibge, tipo_documento, titulo, texto…) |
| `arquivos_proc_feitos` | 252.178 | 3 (numero_controle, n, feito_em) |
| `arquivos_sc` | 663.594 | 14 (cnpj, ano, seq, sequencial_documento, cod_ibge, tipo_documento_id, tipo_documento, titulo…) |
| `aspec_diretorio` | 629 | 8 (uf, cid_id, ent_id, municipio_gt, cod_ibge, acessoinfo_id, situacao, em) |
| `aspec_folha_externa` | 70 | 8 (cod_ibge, municipio, uf, acessoinfo_id, folha_url, erp, leio_nominal, em) |
| `assistencia_repasse_sc` | 6.177 | 7 (cod_ibge, ano, fnas_total, fnas_psb, fnas_pse, meses, atualizado_em) |
| `assistencia_social_sc` | 295 | 24 (cod_ibge, municipio, anomes_ref, populacao, cras, creas, acolhimento, hab_por_cras…) |
| `atas_check` | 882 | 3 (cnpj_orgao, checado, n) |
| `atas_sc` | 123.401 | 12 (numero_controle_ata, cod_ibge, cnpj_orgao, ano_ata, numero_ata, numero_controle_compra, vigencia_inicio, vigencia_fim…) |
| `aux_camara_com_folha` | 5.570 | 12 (cod_ibge, uf, municipio, linhas, pessoas, linhas_com_valor, competencia, fontes…) |
| `aux_mun_com_folha` | 4.347 | 1 (cod_ibge) |
| `aux_subcoleta` | 326 | 5 (cod_ibge, municipio, fonte, competencia, n) |
| `bancada_estadual_sc` | 40 | 11 (id, nome, partido, votos_total, situacao, atualizado, emendas_total, foto_url…) |
| `bancada_federal_sc` | 19 | 11 (id, casa, cod_externo, nome, partido, uf, email, telefone…) |
| `barragens_sc` | 129 | 5 (cod_ibge, total, dano_alto, risco_alto, atualizado) |
| `betha_portal` | 1.272 | 8 (id, nome, municipio, uf, cod_ibge, hash, entidades, _coletado_em) |
| `bkp_app_az_feitas_sc_20260806` | 4.415 | 7 (cnpj, ano, seq, status, n, estrutura, atualizado) |
| `bkp_app_bb_feitas_sc_20260806` | 91 | 7 (cnpj, ano, seq, modalidade_id, status, n, atualizado) |
| `bkp_app_bbmnet_feitas_sc_20260806` | 240 | 6 (cnpj, ano, seq, status, n, atualizado) |
| `bkp_app_comprasgov_termo_feitas_sc_20260806` | 174 | 6 (cnpj, ano, seq, status, n, atualizado) |
| `bkp_app_doc_tem_marca_20260806` | 11.763 | 6 (cnpj, ano, seq, sequencial_documento, padrao, atualizado) |
| `bkp_app_enriq_marca_feitas_sc_20260806` | 443 | 8 (cnpj, ano, seq, portal, arquetipo, status, n, atualizado) |
| `bkp_app_estado_sc_elic_feitas_sc_20260806` | 1.682 | 7 (cnpj, ano, seq, edital_id, status, n, atualizado) |
| `bkp_app_item_marca_candidata_sc_20260806` | 2.253 | 10 (cnpj, ano, seq, numero, descricao_item, marca, foi_vencedora, menor_valor…) |
| `bkp_app_item_marca_conferida_sc_20260805` | 225.368 | 18 (cnpj, ano, seq, numero, marca, modelo, fornecedor_cnpj, valor…) |
| `bkp_app_item_marca_padrao_sc_20260805` | 43.071 | 7 (cnpj, ano, seq, marca, valor, padrao, atualizado) |
| `bkp_app_item_marca_participante_sc_20260806` | 4.088 | 14 (cnpj, ano, seq, numero, descricao_item, fornecedor_cnpj, fornecedor, marca…) |
| `bkp_app_item_marca_visao_sc_20260805` | 161 | 16 (cnpj, ano, seq, sd, numero, descricao, fornecedor, marca…) |
| `bkp_app_marca_conferida_feitas_20260806` | 96 | 7 (cnpj, ano, seq, status, itens_doc, conferidos, atualizado) |
| `bkp_app_marca_padrao_feitas_20260806` | 6.415 | 3 (cnpj, ano, seq) |
| `bkp_app_marca_part_feitas_20260806` | 104 | 5 (cnpj, ano, seq, n_part, atualizado) |
| `bkp_app_marca_proposta_feitas_sc_20260806` | 866 | 3 (cnpj, ano, seq) |
| `bkp_app_marca_visao_feitas_20260806` | 230 | 8 (cnpj, ano, seq, sd, status, n_itens, msg, atualizado) |
| `bkp_contratacao_disputa_sc_20260805` | 4.421 | 10 (cod_ibge, cnpj, ano, seq, n_licitantes, n_lances, n_itens_marca, atualizado…) |
| `bkp_convenios_captados_sc_20260810` | 43.238 | 12 (cod_ibge, id, numero, objeto, orgao, situacao, valor, valor_liberado…) |
| `bkp_item_marca_sc_20260805` | 246.720 | 12 (cod_ibge, cnpj, ano, seq, numero, descricao, produto_ata, modelo…) |
| `bkp_lances_sc_20260805` | 27.765 | 10 (cnpj, ano, seq, numero, cod_ibge, ordem, fornecedor, valor…) |
| `bkp_marca_dicionario_sc_20260807` | 3.764 | 7 (marca, n_itens, n_orgaos, n_com_modelo, n_venceu, confianca, atualizado) |
| `bkp_propostas_sc_20260805` | 27.769 | 19 (cnpj, ano, seq, numero, cod_ibge, descricao, fornecedor, marca…) |
| `bndes_sc` | 8.893 | 5 (cod_ibge, ano, desembolso, top_setores, atualizado) |
| `bolsa_atleta_sc` | 88 | 6 (cod_ibge, ano, n_atletas, valor_pago, top_modalidades, atualizado) |
| `bps_precos_ref` | 12.658 | 6 (cod_catmat, descricao, mediana, media, minimo, atualizado) |
| `caderno_emendas_sc` | 1 | 4 (cod_ibge, escopo, payload, atualizado) |
| `cadprev_dair_aplicacoes_resgate` | 198.163 | 19 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, no_segmeto, tp_ativo…) |
| `cadprev_dair_carteira` | 373.591 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes_bimestre, dt_ano, no_segmento, no_tipo_ativo…) |
| `cadprev_dair_forma_gestao` | 8.703 | 17 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, no_objeto_contratacao…) |
| `cadprev_dair_fundo_invest_analisados` | 102.352 | 14 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, nr_cnpj_empresa…) |
| `cadprev_dair_governanca` | 25.882 | 26 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, dt_mes, dt_ano, dt_envio, nr_norma_fundamento…) |
| `cadprev_dair_identificacao` | 9.556 | 13 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, dt_mes, dt_ano, dt_envio, te_finalidade…) |
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
| `cadprev_rpps_aliquota` | 1.907 | 11 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, ds_plano_segregacao, no_sujeito_passivo, vl_aliquota, dt_inicio_vigencia…) |
| `cadprev_rpps_regime_previdenciario` | 816 | 12 (cod_ibge, nr_cnpj_entidade, sg_uf, no_ente, tp_regime, dt_inicio, dt_fim, no_tipo_legislacao…) |
| `cadprev_sync_log` | 94 | 5 (id, recurso, uf, linhas, ts) |
| `caf_sc` | 295 | 6 (cod_ibge, competencia, caf_fisica, caf_rural, caf_juridica, atualizado) |
| `caged_sc` | 5.014 | 7 (cod_ibge, ano, mes, saldo, admissoes, desligamentos, atualizado) |
| `capag_sc` | 271 | 9 (cod_ibge, nota, endividamento, endiv_nota, poupanca, poup_nota, liquidez, liq_nota…) |
| `capital_portal` | 27 | 11 (cod_ibge, municipio, uf, site, url_transparencia, url_pessoal, produto, detalhe…) |
| `capital_recon` | 16 | 10 (cod_ibge, municipio, uf, ckan, rota_pessoal, xhr, selects, tabela…) |
| `captacao_transferegov_sc` | 1.277 | 14 (id_plano, cod_ibge, uf, id_programa, situacao, valor_total_repasse, valor_voluntario, valor_total…) |
| `car_sc` | 295 | 4 (cod_ibge, imoveis_total, imoveis_ativos, atualizado) |
| `catalogo_govbr_sc` | 23.468 | 7 (nivel, tipo, cod, nome, classe, grupo, atualizado_em) |
| `catmat_catalogo` | 343.323 | 8 (codigo_item, nome_pdm, nome_classe, descricao, codigo_pdm, codigo_classe, ncm, atualizado) |
| `catmat_pdm` | 20.332 | 5 (codigo_pdm, nome_pdm, nome_classe, n_itens, item_ex) |
| `cauc_detalhe_sc` | 8.290 | 5 (cod_ibge, codigo, status, validade, atualizado) |
| `cauc_sc` | 296 | 7 (cod_ibge, data_pesquisa, apto, n_pendencias, pendencias, grupos_pendentes, atualizado) |
| `cemaden_sc` | 174 | 4 (cod_ibge, estacoes, ativas, atualizado) |
| `censo_corraca_sc` | 295 | 8 (cod_ibge, total, branca, preta, amarela, parda, indigena, atualizado) |
| `censo_matricula_sc` | 6.512 | 4 (cod_ibge, ano, etapa, matriculas) |
| `cfem_sc` | 3.644 | 5 (cod_ibge, ano, valor, top_substancias, atualizado) |
| `cmed_pmvg` | 25.702 | 11 (ggrem, substancia, laboratorio, produto, apresentacao, classe, regime, pmvg_0…) |
| `cnes_equipamentos_estab` | 11.736 | 6 (codigo_cnes, total, imagem, vida, sus, atualizado) |
| `cnes_equipamentos_sc` | 885 | 7 (cod_ibge, ano, total, imagem, vida, sus, atualizado) |
| `cnes_equipes_estab` | 1.726 | 4 (codigo_cnes, n_equipes, n_esf, atualizado) |
| `cnes_equipes_sc` | 1.769 | 5 (cod_ibge, ano, n_equipes, n_esf, atualizado) |
| `cnes_estab_check` | 295 | 2 (cod_ibge, n) |
| `cnes_leitos_estab` | 309 | 5 (codigo_cnes, total, sus, uti, atualizado) |
| `cnes_leitos_sc` | 473 | 6 (cod_ibge, ano, total, sus, uti, atualizado) |
| `cnes_profissionais_estab` | 18.546 | 3 (codigo_cnes, profissionais, atualizado) |
| `cnes_profissionais_sc` | 885 | 8 (cod_ibge, ano, medicos, enfermeiros, dentistas, tec_enf, acs, atualizado) |
| `cnes_sc` | 295 | 10 (cod_ibge, total, sus_amb, hospitalar, cirurgico, obstetrico, neonatal, por_tipo…) |
| `cnpj_loc` | 56.133 | 10 (cnpj, razao_social, municipio, uf, atualizado, situacao, situacao_motivo, abertura…) |
| `cnpj_municipal_sc` | 930 | 6 (cod_ibge, cnpj, razao_social, tipo, fonte, atualizado) |
| `cobertura_aps_sc` | 295 | 6 (cod_ibge, populacao, esf, cobertura, competencia, atualizado) |
| `cobertura_vacinal_sc` | 37.290 | 5 (cod_ibge, ano, vacina, cobertura, atualizado) |
| `coleta_heartbeat` | 1 | 6 (id, ts, progresso, etapa, reinicios, msg) |
| `coleta_incremental_log` | 30 | 9 (rodada_em, uf, janela_ini, janela_fim, vistos, mudaram, iguais, novos…) |
| `coleta_qa` | 1 | 6 (id, ts, status, suspeitos, alertas, regras) |
| `compras_publicas` | 106 | 11 (ente_tipo, ente_id, ano, valor_contratado_pc, pct_pregao_eletronico, pct_dispensa, economia_pregao, fornecedores_mil…) |
| `compras_sc` | 1.118 | 10 (cod_ibge, ano, n_contratos, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade…) |
| `compras_sc_vazios` | 247 | 1 (cod_ibge) |
| `contratacao_disputa_sc` | 994 | 10 (cod_ibge, cnpj, ano, seq, n_licitantes, n_lances, n_itens_marca, atualizado…) |
| `contratacoes` | 1.035 | 13 (id, ente_tipo, ente_id, numero, objeto, orgao, modalidade, valor_estimado…) |
| `contratacoes_sc` | 252.178 | 35 (cod_ibge, cnpj, ano, seq, esfera, plataforma, modalidade_id, modalidade…) |
| `contrato_sc` | 10.559 | 30 (cnpj, ano, seq, cod_ibge, uf, municipio_nome, numero_controle_pncp, numero_controle_compra…) |
| `contratos_sc` | 4.818.154 | 14 (id, cod_ibge, numero_controle_compra, cnpj_compra, ano_compra, seq_compra, fornecedor, ni_fornecedor…) |
| `contratos_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `contratos_sc_feitos_inc` | 295 | 2 (cod_ibge, n) |
| `convenios_captados_sc` | 22.138 | 13 (cod_ibge, id, numero, objeto, orgao, situacao, valor, valor_liberado…) |
| `convenios_check` | 295 | 2 (cod_ibge, atualizado) |
| `convenios_sc` | 13.071 | 10 (nr_convenio, id_proposta, cod_ibge, municipio, ano, situacao, vl_global, vl_repasse…) |
| `crp_alerta_estado` | 296 | 4 (cod_ibge, categoria, dias, atualizado) |
| `crp_alertas` | 643 | 11 (id, cod_ibge, nome, eh_estado, evento, categoria_de, categoria_para, dias…) |
| `cvat_aps_sc` | 1.038 | 9 (cod_ibge, quadrimestre, equipe, otimo, bom, suficiente, regular, total…) |
| `datatran_sc` | 1.280 | 6 (cod_ibge, ano, n_acidentes, mortos, feridos, atualizado) |
| `dbseller_portal` | 10 | 6 (cod_ibge, municipio, uf, base, atualizado_em, achado_em) |
| `desastres_sc` | 295 | 10 (cod_ibge, n_desastres, n_recentes, mortos, afetados, desalojados, ano_ultimo, top_tipos…) |
| `despesa_sub_check` | 2.664 | 2 (cod_ibge, ano) |
| `despesa_subfuncao_sc` | 73.245 | 6 (cod_ibge, ano, funcao, subfuncao, empenhado, dotacao) |
| `domicilios_sc` | 295 | 5 (cod_ibge, domicilios, moradores, densidade, atualizado) |
| `eddydata_portal` | 777 | 12 (cod_ibge, municipio, uf, host, caminho, tenant, orgao, cidade…) |
| `educacao_especial_sc` | 2.892 | 10 (cod_ibge, ano, total, incluidos, exclusivas, esp_infantil, esp_fundamental, esp_medio…) |
| `eleitorado_sc` | 295 | 4 (cod_ibge, eleitores, ano, atualizado) |
| `elmar_ctx_catalogo` | 171 | 9 (ctx, entidade, tipo, cod_ibge, municipio, uf, em, cnpj…) |
| `elotech_portal` | 99 | 7 (cod_ibge, municipio, uf, slug, host, entidades, achado_em) |
| `emendas_check` | 7 | 2 (ano, n) |
| `emendas_est_objetos_sc` | 4.078 | 6 (id, ano, area, objeto, valor, atualizado) |
| `emendas_estaduais_exec_sc` | 1 | 3 (cod_ibge, valor_pago, atualizado) |
| `emendas_execucao_sc` | 691 | 14 (codigo_emenda, ano, cod_ibge, localidade, tipo, autor, funcao, subfuncao…) |
| `emendas_indicacao_sc` | 9.633 | 19 (id_proposta, nr_emenda, cod_ibge, municipio, parlamentar, tipo_parlamentar, impositivo, programa…) |
| `empenho_sc` | 73 | 10 (cnpj, ano, seq, sequencial_empenho, cod_ibge, numero_empenho, valor, data_emissao…) |
| `empenhos_check` | 28.764 | 6 (cnpj_compra, ano_compra, seq_compra, checado, n, tentativas) |
| `empenhos_sc` | 0 | 10 (cod_ibge, cnpj_compra, ano_compra, seq_compra, seq_empenho, numero, valor, data…) |
| `entes_sc` | 296 | 14 (cod_ibge, nome, uf, tipo, populacao, pop_indigena, latitude, longitude…) |
| `equipamentos_esporte_sc` | 7.213 | 10 (id, cat, nome, tipo, cod_ibge, municipio, latitude, longitude…) |
| `equipamentos_justica_sc` | 729 | 11 (id, cat, nome, tipo, cod_ibge, municipio, latitude, longitude…) |
| `equipamentos_suas_sc` | 1.669 | 17 (codigo_cadsuas, cod_ibge, nome, tipo, nr_identificador, uf, municipio, atualizado…) |
| `equiplano_cloud_portal` | 0 | 9 (cod_ibge, municipio, uf, slug, entidade_uuid, cliente_uuid, county_uuid, acao_uuid…) |
| `equiplano_portal` | 78 | 6 (cod_ibge, municipio, uf, base_url, detalhe, em) |
| `erp_portal_municipal` | 902 | 6 (cod_ibge, erp, slug, url, titulo, achado_em) |
| `erp_varredura` | 33.689 | 4 (cod_ibge, erp, testado_em, achou) |
| `escola_turmas_sc` | 6.541 | 14 (co_entidade, cod_ibge, ano, nome, rede, tur_total, tur_creche, tur_pre…) |
| `escolas_hist_sc` | 64.566 | 16 (co_entidade, ano, cod_ibge, dependencia, nome, localizacao, matriculas, docentes…) |
| `escolas_sc` | 6.750 | 27 (co_entidade, cod_ibge, ano, nome, dependencia, localizacao, matriculas, tem_agua…) |
| `estabelecimentos_saude_sc` | 35.458 | 17 (codigo_cnes, cod_ibge, nome, tipo_codigo, tipo, gestao, esfera, sus_ambulatorial…) |
| `estado_indicador_valores` | 2.160 | 4 (estado_id, indicador_id, ano, valor) |
| `estados` | 27 | 8 (id, uf, nome, regiao, populacao, capital, governador, pib_per_capita) |
| `estatisticas_vitais_sc` | 6.250 | 5 (cod_ibge, ano, nascidos, obitos, atualizado) |
| `estban_sc` | 6.305 | 11 (cod_ibge, ano_mes, credito, credito_rural, credito_agroind, credito_imob, poupanca, prazo…) |
| `etl_catalogo` | 172 | 14 (id, label, api, max_ano, ultima_exec, ultimo_status, devido, msg…) |
| `farmacia_popular_sc` | 295 | 3 (cod_ibge, n_farmacias, atualizado) |
| `fatores_fundeb` | 325 | 6 (ano, segmento, fp_vaaf, fp_vaat, fp_final_vaaf, fp_final_vaat) |
| `financas` | 106 | 19 (ente_tipo, ente_id, ano, receita_total, rec_tributaria, rec_transferencias, rec_outras, despesa_total…) |
| `financas_sc` | 1.971 | 23 (cod_ibge, ano, receita, receita_prevista, tributaria, transferencias, outras, despesa…) |
| `financiamento_aps_sc` | 295 | 9 (cod_ibge, custeio_mensal, parcela, atualizado, esf, emulti, bucal, acs…) |
| `fiorilli_portal` | 297 | 10 (cod_ibge, municipio, uf, url_portal, base_url, padrao, entidade, situacao…) |
| `fnde_estado_check` | 27 | 2 (ano, n) |
| `fnde_fundos_check` | 295 | 3 (cod_ibge, n_fundos, n_lib) |
| `fnde_programa_ref` | 25 | 2 (codigo, nome) |
| `fnde_simad_check` | 7.965 | 3 (cod_ibge, ano, n) |
| `fnde_simad_sc` | 207.012 | 12 (cod_ibge, ano, data_pgto, ob, valor, parcela, programa, cnpj_recebedor…) |
| `fns_repasse_sc` | 45.630 | 8 (cod_ibge, ano, bloco_cod, bloco_nome, area_cod, area_nome, vl_total, vl_liquido) |
| `folha_7focus_coleta` | 19 | 9 (cod_ibge, municipio, uf, slug, competencia, linhas, situacao, detalhe…) |
| `folha_abase_coleta` | 48 | 11 (cod_ibge, municipio, uf, token, competencia, linhas, declarado, situacao…) |
| `folha_abo_mg_coleta` | 1 | 9 (cod_ibge, municipio, uf, url, situacao, detalhe, linhas, competencia…) |
| `folha_admrh_coleta` | 12 | 11 (cod_ibge, municipio, uf, host, competencia, servidores, com_valor, declarado…) |
| `folha_admrh_portal` | 5 | 8 (cod_ibge, municipio, uf, host, caminho, url, competencias, achado_em) |
| `folha_admtransp_coleta` | 180 | 10 (cod_ibge, municipio, host, p, competencia, linhas, linhas_normal, situacao…) |
| `folha_agape_coleta` | 4 | 8 (cod_ibge, ano, municipio, linhas, com_valor, situacao, detalhe, em) |
| `folha_agape_portal` | 4 | 5 (cod_ibge, municipio, uf, base_url, ativo) |
| `folha_agili_coleta` | 4 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_agiliblue_coleta` | 19 | 9 (cod_ibge, municipio, uf, slug, linhas, declarado, situacao, detalhe…) |
| `folha_agregada_aspec` | 4.099 | 15 (cod_fonte, cod_ibge, municipio, uf, entidade, competencia, dimensao, cod…) |
| `folha_algov_coleta` | 23 | 9 (cod_ibge, municipio, uf, base_url, competencia, linhas, situacao, detalhe…) |
| `folha_amaam_coleta` | 35 | 10 (cod_ibge, slug, municipio, competencia, arquivos, servidores, situacao, detalhe…) |
| `folha_amanc_coleta` | 6 | 8 (cod_ibge, ancid, municipio, competencia, servidores, situacao, detalhe, em) |
| `folha_ancweb_coleta` | 8 | 10 (cod_ibge, poder, municipio, uf, arquivo, competencia, linhas, situacao…) |
| `folha_apitransp_coleta` | 73 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_aplpessoal_coleta` | 38 | 9 (cod_ibge, municipio, host, competencia, entidades, linhas, situacao, detalhe…) |
| `folha_area_cargo` | 23.343 | 2 (cargo, area) |
| `folha_area_lotacao` | 12.232 | 2 (lotacao, area) |
| `folha_aspec_coleta` | 76 | 9 (cod_ibge, municipio, uf, acessoinfo_id, linhas, secretarias, situacao, detalhe…) |
| `folha_aspec_nom_coleta` | 506 | 10 (cod_ibge, municipio, uf, folha_id, competencia, servidores, situacao, detalhe…) |
| `folha_aspec_pessoal_coleta` | 59 | 14 (cod_fonte, cod_ibge, municipio, uf, entidade, competencia, orgaos, cargos…) |
| `folha_aspec_secretaria` | 1.464 | 14 (cod_ibge, municipio, uf, acessoinfo_id, exercicio, unidade_gestora, natureza_codigo, natureza_desc…) |
| `folha_betha_coleta` | 1.273 | 10 (portal_id, cod_ibge, municipio, uf, consulta_id, competencia, linhas, situacao…) |
| `folha_betha_egov_coleta` | 3 | 9 (cod_ibge, municipio, uf, competencia, servidores, com_valor, situacao, detalhe…) |
| `folha_bsit_coleta` | 84 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_camara_fila` | 3.383 | 18 (cod_ibge, uf, municipio, situacao, pessoas, rais_legislativo, url_camara, erp…) |
| `folha_campinas_coleta` | 1 | 6 (cod_ibge, competencia, linhas, situacao, detalhe, em) |
| `folha_campogrande_coleta` | 1 | 6 (competencia, linhas, com_valor, situacao, detalhe, em) |
| `folha_canoas_coleta` | 1 | 10 (cod_ibge, municipio, uf, competencia, servidores, com_valor, paginas, situacao…) |
| `folha_capital_coleta` | 28 | 8 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em) |
| `folha_catalogo_rnr` | 699 | 14 (id, ano, descricao, link, host, produto, cod_fonte, cod_ibge…) |
| `folha_cerh_coleta` | 123 | 8 (cod_ibge, municipio, host, competencia, linhas, situacao, detalhe, em) |
| `folha_cgmal_coleta` | 102 | 9 (cod_ibge, municipio, uf, base_url, competencia, linhas, situacao, detalhe…) |
| `folha_cidadesmg_coleta` | 112 | 9 (cod_ibge, municipio, uf, base_url, competencia, linhas, situacao, detalhe…) |
| `folha_citta_coleta` | 28 | 11 (cod_ibge, municipio, uf, host, competencia, linhas, com_lotacao, com_cargo…) |
| `folha_consfolha_coleta` | 1 | 10 (cod_ibge, municipio, uf, competencia, servidores, com_valor, declarado, situacao…) |
| `folha_contass_coleta` | 8 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_cr2_coleta` | 59 | 7 (foff_id, entidade, competencia, linhas, situacao, detalhe, em) |
| `folha_crtsh_host` | 4 | 7 (cod_ibge, municipio, uf, host, produto, prova, achado_em) |
| `folha_datapublic_coleta` | 2 | 10 (cod_ibge, municipio, uf, base, referencia, linhas, declarado, situacao…) |
| `folha_dbseller_coleta` | 25 | 10 (cod_ibge, instituicao, municipio, uf, competencia, servidores, com_valor, situacao…) |
| `folha_dd_coleta` | 10 | 10 (cod_ibge, slug, municipio, competencia, edicoes, servidores, layout, situacao…) |
| `folha_diagnostico_camara` | 2.428 | 13 (cod_ibge, municipio, uf, url_visitada, url_pessoal, produto, tem_menu_pessoal, tem_dados…) |
| `folha_diagnostico_faltante` | 1.391 | 13 (cod_ibge, municipio, uf, url_visitada, url_pessoal, produto, tem_menu_pessoal, tem_dados…) |
| `folha_digifred_coleta` | 22 | 10 (cod_ibge, municipio, uf, slug, url, linhas, cargos, situacao…) |
| `folha_eddydata_coleta` | 6 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_elotech_coleta` | 563 | 10 (slug, entidade_id, cod_ibge, municipio, uf, exercicio, linhas, situacao…) |
| `folha_elotech_ficha_coleta` | 28 | 7 (cod_ibge, municipio, fichas, linhas, situacao, detalhe, em) |
| `folha_empenho_rs` | 1.071.169 | 15 (ano, mes, ente, secretaria, unidade, elemento, rubrica, credor…) |
| `folha_entidade_legislativo` | 58 | 9 (cod_ibge, fonte, municipio, uf, linhas, linhas_legislativo, pct, amostra_unidade…) |
| `folha_epublica_coleta` | 30 | 8 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em) |
| `folha_equiplano_coleta` | 75 | 8 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em) |
| `folha_folhamensal_coleta` | 82 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_garimpo_uf` | 428 | 14 (uf, cod_ibge, municipio, url, url_pai, rotulo, nivel, http…) |
| `folha_genexus_coleta` | 46 | 9 (cod_ibge, municipio, uf, base_url, versao, linhas, situacao, detalhe…) |
| `folha_genexus_wwp_coleta` | 52 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_geosiap_coleta` | 40 | 9 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em…) |
| `folha_govbrda_coleta` | 341 | 11 (cod_ibge, poder, municipio, uf, host, entidade, exercicio, linhas…) |
| `folha_gpecloud_coleta` | 6 | 10 (cod_ibge, municipio, uf, url, situacao, detalhe, linhas, competencia…) |
| `folha_gwtransp_coleta` | 1 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_gxrh_coleta` | 10 | 9 (cod_ibge, municipio, uf, base_url, competencia, linhas, situacao, detalhe…) |
| `folha_hardsoft_coleta` | 1 | 10 (cod_ibge, municipio, uf, host, competencia, servidores, com_valor, situacao…) |
| `folha_host_candidato` | 346 | 8 (cod_ibge, municipio, uf, produto, host, url, achado_via, em) |
| `folha_iframe_descoberto` | 14 | 8 (cod_ibge, municipio, uf, url_visitada, iframe_src, host_iframe, produto, em) |
| `folha_ipm_coleta` | 272 | 9 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em…) |
| `folha_itsolucoes_coleta` | 46 | 9 (p_i, cod_ibge, entidade, uf, competencia, linhas, situacao, detalhe…) |
| `folha_lai_pendencia` | 22 | 9 (cod_ibge, municipio, uf, rais, classe, produto, url, evidencia…) |
| `folha_layout_coleta` | 186 | 10 (entidade_id, codigo, cod_ibge, municipio, uf, competencia, linhas, situacao…) |
| `folha_megasoft_coleta` | 348 | 9 (slug, cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe…) |
| `folha_memory_coleta` | 187 | 9 (cod_ibge, municipio, uf, entidade, linhas, situacao, detalhe, em…) |
| `folha_minastransp_coleta` | 2 | 11 (cod_ibge, municipio, uf, slug, site, competencia, servidores, com_valor…) |
| `folha_mo_coleta` | 120 | 10 (cod_ibge, municipio, uf, competencia, linhas, com_valor, entidades, situacao…) |
| `folha_mo_portal` | 120 | 6 (cod_ibge, municipio, uf, base_url, ativo, descoberto_em) |
| `folha_multi24_coleta` | 75 | 9 (cod_ibge, municipio, uf, url, competencia, linhas, situacao, detalhe…) |
| `folha_nucleogov_coleta` | 297 | 9 (cod_ibge, municipio, uf, host, linhas, situacao, detalhe, em…) |
| `folha_parintins_coleta` | 1 | 7 (cod_ibge, competencia, paginas, servidores, situacao, detalhe, em) |
| `folha_pdfrelacao_coleta` | 1 | 11 (cod_ibge, municipio, uf, competencia, linhas, declarado, soma, soma_declarada…) |
| `folha_pdtinfo_coleta` | 1 | 9 (cod_ibge, municipio, uf, url, situacao, detalhe, linhas, competencia…) |
| `folha_pelotas_coleta` | 1 | 7 (ano, competencia, servidores, linhas_csv, situacao, detalhe, em) |
| `folha_pitransp_coleta` | 8 | 10 (cod_ibge, municipio, url, competencia, linhas, total_declarado, total_somado, situacao…) |
| `folha_piv2_coleta` | 13 | 9 (cod_ibge, municipio, url, competencia, linhas, esperado, situacao, detalhe…) |
| `folha_pjf_coleta` | 11 | 6 (orgao, competencia, linhas, situacao, detalhe, em) |
| `folha_poa_fila` | 34.191 | 16 (chave, competencia, nome, cargo, orgao, referencia, matricula, bruto…) |
| `folha_portal_candidato` | 409 | 7 (cod_ibge, municipio, uf, produto, url, achado_via, achado_em) |
| `folha_portalfacil_api_coleta` | 257 | 10 (id_cliente, cod_ibge, municipio, uf, situacao, detalhe, pessoas, linhas…) |
| `folha_portalfacil_catalogo` | 675 | 12 (id_cliente, nome, tipo, cod_ibge, municipio, uf, competencia_ref, atualizado_em…) |
| `folha_portalfacil_coleta` | 57 | 10 (cod_ibge, municipio, uf, url, situacao, detalhe, linhas, competencia…) |
| `folha_portalnovo_coleta` | 26 | 9 (cod_ibge, municipio, host, competencia, entidades, linhas, situacao, detalhe…) |
| `folha_portaltp_coleta` | 315 | 9 (cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe, em…) |
| `folha_portaltransp_coleta` | 2 | 10 (cod_ibge, municipio, uf, codigo, competencia, servidores, com_valor, situacao…) |
| `folha_portovelho_coleta` | 2 | 7 (portal, competencia, listados, com_valor, situacao, detalhe, em) |
| `folha_pronimgrade_coleta` | 1 | 11 (cod_ibge, municipio, uf, competencia, unidades, servidores, com_valor, paginas…) |
| `folha_prova_real` | 4.146 | 12 (cod_ibge, municipio, uf, coletado, rais, razao, fonte_principal, fontes…) |
| `folha_publicsoft_coleta` | 150 | 8 (cod_ibge, municipio, uf, ctx, linhas, situacao, detalhe, em) |
| `folha_quality_coleta` | 19 | 10 (cod_ibge, municipio, uf, slug, competencia, linhas, situacao, detalhe…) |
| `folha_rais_carga` | 7 | 5 (ano, regiao, linhas_lidas, linhas_gravadas, terminado_em) |
| `folha_rais_municipal` | 10.014.594 | 20 (id, ano, regiao_arquivo, cod_ibge6, cod_ibge6_trab, natureza_cod, natureza_desc, esfera_grupo…) |
| `folha_rais_natureza` | 421 | 4 (ano, regiao, natureza_cod, linhas) |
| `folha_receita_achada` | 43 | 7 (cod_ibge, municipio, uf, host, receita, evidencia, em) |
| `folha_remuneracoes_coleta` | 1 | 11 (cod_ibge, municipio, uf, competencia, categorias, servidores, com_valor, declarado…) |
| `folha_rhsys_coleta` | 1 | 10 (cod_ibge, municipio, uf, host, competencia, servidores, com_valor, situacao…) |
| `folha_rota_aprofundada` | 79 | 9 (cod_ibge, municipio, uf, url_origem, url_com_dado, linhas, situacao, detalhe…) |
| `folha_rpm_coleta` | 88 | 9 (cnpj, cod_ibge, municipio, uf, competencia, linhas, situacao, detalhe…) |
| `folha_rs_secretaria` | 6.900 | 10 (cod_ibge, municipio, uf, tipo_ente, secretaria, ano, meses, folha_paga…) |
| `folha_saiio_coleta` | 102 | 10 (cod_ibge, municipio, uf, cod_orgao, orgao, linhas, com_valor, situacao…) |
| `folha_scpi_coleta` | 694 | 9 (cod_ibge, municipio, uf, host, linhas, situacao, detalhe, em…) |
| `folha_scpi_competencia_principal` | 368 | 6 (cod_ibge, municipio, mes, pessoas, meses_na_tabela, em) |
| `folha_scpicsv_coleta` | 194 | 11 (host, cod_ibge, municipio, uf, base, competencia, linhas, meses…) |
| `folha_scriptcase_coleta` | 1 | 9 (cod_ibge, poder, municipio, uf, competencia, linhas, situacao, detalhe…) |
| `folha_servidores_7focus` | 7.007 | 18 (cod_ibge, municipio, uf, slug, orgao, competencia, matricula, nome…) |
| `folha_servidores_abase` | 18.887 | 17 (cod_ibge, municipio, uf, entidade, competencia, matricula, nome, cargo…) |
| `folha_servidores_abo_mg` | 548 | 14 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, tipo_cargo…) |
| `folha_servidores_admrh` | 26.618 | 19 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, secretaria…) |
| `folha_servidores_admtransp` | 10.961 | 26 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_agape` | 31.866 | 23 (cod_ibge, municipio, uf, entidade, competencia, matricula, nome, secretaria…) |
| `folha_servidores_agili` | 3.154 | 18 (cod_ibge, municipio, uf, host, competencia, nome, cpf_masc, cargo…) |
| `folha_servidores_agiliblue` | 9.833 | 22 (cod_ibge, municipio, uf, host, slug, competencia, unidade_gestora, secretaria…) |
| `folha_servidores_algov` | 8.730 | 14 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao…) |
| `folha_servidores_amaam` | 139.495 | 21 (cod_ibge, municipio, uf, entidade, competencia, secretaria, vinculo, matricula…) |
| `folha_servidores_amanc` | 6.814 | 16 (cod_ibge, municipio, uf, entidade, competencia, matricula, nome, cargo…) |
| `folha_servidores_ancweb` | 54 | 19 (cod_ibge, municipio, uf, poder, entidade, competencia, matricula, nome…) |
| `folha_servidores_apitransp` | 956 | 21 (cod_ibge, municipio, uf, host, orgao, competencia, matricula, nome…) |
| `folha_servidores_aplpessoal` | 8.283 | 27 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_aspec` | 60.790 | 18 (cod_ibge, municipio, uf, folha_id, competencia, matricula, nome, orgao…) |
| `folha_servidores_betha` | 533.283 | 21 (cod_ibge, municipio, uf, entidade, competencia, nome, cargo, classificacao_cargo…) |
| `folha_servidores_betha_egov` | 0 | 15 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao…) |
| `folha_servidores_bsit` | 12.182 | 18 (cod_ibge, municipio, uf, host, entidade, competencia, matricula, nome…) |
| `folha_servidores_campinas` | 16.023 | 18 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, secretaria…) |
| `folha_servidores_campogrande` | 40.000 | 22 (cod_ibge, municipio, uf, competencia, nome, cpf_masc, matricula, vinculo_num…) |
| `folha_servidores_canoas` | 4.293 | 18 (cod_ibge, municipio, uf, competencia, pessoa_id, nome, cargo, tipo…) |
| `folha_servidores_capital` | 1.336.107 | 16 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, secretaria…) |
| `folha_servidores_cerh` | 172.043 | 18 (cod_ibge, municipio, uf, host, competencia, nome, matricula, cargo…) |
| `folha_servidores_cgmal` | 1.912 | 15 (cod_ibge, municipio, uf, base_url, competencia, matricula, nome, cargo…) |
| `folha_servidores_cidadesmg` | 75.798 | 21 (cod_ibge, municipio, uf, base_url, competencia, matricula, nome, cargo…) |
| `folha_servidores_citta` | 6.188 | 16 (cod_ibge, municipio, uf, unidade_gestora, competencia, matricula, nome, cpf_masc…) |
| `folha_servidores_consfolha` | 4.607 | 14 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, departamento…) |
| `folha_servidores_contass` | 4.453 | 22 (cod_ibge, municipio, uf, host, competencia, matricula, nome, cargo…) |
| `folha_servidores_cr2` | 53.975 | 21 (foff_id, entidade, cod_ibge, municipio, uf, competencia, matricula, cpf_masc…) |
| `folha_servidores_datapublic` | 645 | 17 (cod_ibge, municipio, uf, base, referencia, unidade_gestora, tipo_folha, poder…) |
| `folha_servidores_dbseller` | 20.859 | 20 (cod_ibge, municipio, uf, instituicao, competencia, matricula, nome, cargo…) |
| `folha_servidores_dd` | 13.765 | 18 (cod_ibge, municipio, uf, slug, competencia, secretaria, vinculo, matricula…) |
| `folha_servidores_digifred` | 6.954 | 12 (cod_ibge, municipio, uf, competencia, nome, cargo, admissao, piso…) |
| `folha_servidores_eddydata` | 3.882 | 23 (cod_ibge, municipio, uf, host, tenant, orgao, competencia, matricula…) |
| `folha_servidores_elotech` | 146.751 | 20 (cod_ibge, municipio, uf, slug, entidade_id, entidade, exercicio, matricula…) |
| `folha_servidores_elotech_mensal` | 236.725 | 18 (cod_ibge, municipio, uf, entidade_id, competencia, matricula, nome, cargo…) |
| `folha_servidores_epublica` | 35.916 | 24 (cod_ibge, municipio, uf, unidade_gestora, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_equiplano` | 71.630 | 19 (cod_ibge, municipio, uf, base_url, entidade, entidade_nome, competencia, matricula…) |
| `folha_servidores_folhamensal` | 4.378 | 19 (cod_ibge, municipio, uf, host, entidade, competencia, matricula, nome…) |
| `folha_servidores_genexus` | 43.844 | 17 (cod_ibge, municipio, uf, base_url, versao, competencia, matricula, nome…) |
| `folha_servidores_genexus_wwp` | 38.447 | 17 (cod_ibge, municipio, uf, host, orgao, cnpj, competencia, matricula…) |
| `folha_servidores_geosiap` | 44.922 | 19 (cod_ibge, municipio, uf, entidade, competencia, cpf_masc, chapa, nome…) |
| `folha_servidores_govbr` | 802.710 | 16 (cod_ibge, municipio, uf, competencia, lotacao, secretaria, cargo, nome…) |
| `folha_servidores_govbrda` | 274.330 | 19 (cod_ibge, municipio, uf, poder, entidade, competencia, matricula, cpf_masc…) |
| `folha_servidores_gpecloud` | 3.597 | 15 (cod_ibge, municipio, uf, competencia, matricula, nome, cpf_masc, cargo…) |
| `folha_servidores_gwtransp` | 625 | 19 (cod_ibge, municipio, uf, host, competencia, matricula, nome, documento…) |
| `folha_servidores_gxrh` | 11.636 | 19 (cod_ibge, municipio, uf, base_url, competencia, orgao, matricula, nome…) |
| `folha_servidores_hardsoft` | 792 | 14 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao…) |
| `folha_servidores_ipm` | 376.911 | 19 (cod_ibge, municipio, uf, entidade, competencia, nome, cargo, lotacao…) |
| `folha_servidores_itsolucoes` | 5.513 | 18 (cod_ibge, municipio, uf, poder, entidade, p_i, competencia, matricula…) |
| `folha_servidores_layout` | 227.404 | 22 (cod_ibge, municipio, uf, entidade_id, codigo, competencia, matricula, nome…) |
| `folha_servidores_ma` | 324.452 | 24 (ano, mes, cnpj, ente_id, ente, unidade, poder, matricula…) |
| `folha_servidores_megasoft` | 104.373 | 21 (cod_ibge, municipio, uf, slug, competencia, matricula, nome, cpf_masc…) |
| `folha_servidores_memory` | 65.217 | 14 (cod_ibge, municipio, uf, entidade, competencia, matricula, nome, cargo…) |
| `folha_servidores_minastransp` | 425 | 17 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao…) |
| `folha_servidores_montenegro` | 165 | 16 (cod_ibge, municipio, uf, entidade, competencia, nome, matricula, cargo…) |
| `folha_servidores_multi24` | 41.556 | 13 (cod_ibge, municipio, uf, grupo, competencia, nome, cargo, tipo…) |
| `folha_servidores_municipioonline` | 109.658 | 18 (cod_ibge, municipio, uf, entidade, cnpj, competencia, matricula, nome…) |
| `folha_servidores_nucleogov` | 246.532 | 21 (cod_ibge, municipio, uf, host, competencia, matricula, nome, cpf_masc…) |
| `folha_servidores_parintins` | 6.561 | 15 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, vinculo…) |
| `folha_servidores_pdfrelacao` | 279 | 15 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, classe…) |
| `folha_servidores_pdtinfo` | 509 | 11 (cod_ibge, municipio, uf, competencia, matricula, nome, funcao, lotacao…) |
| `folha_servidores_pe` | 1.912.330 | 20 (exercicio, uj_codigo, uj_nome, municipio_cod, municipio, natureza_orgao, nome, cpf_masc…) |
| `folha_servidores_pelotas` | 11.972 | 18 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, regime…) |
| `folha_servidores_pitransp` | 3.458 | 25 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_piv2` | 5.879 | 25 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_pjf` | 12.509 | 19 (cod_ibge, municipio, uf, orgao, competencia, matricula, nome, cargo…) |
| `folha_servidores_portalfacil` | 25.047 | 20 (cod_ibge, municipio, uf, competencia, entidade, matricula, nome, unidade…) |
| `folha_servidores_portalfacil_api` | 124.289 | 21 (cod_ibge, municipio, uf, competencia, id_cliente, entidade, matricula, nome…) |
| `folha_servidores_portalnovo` | 19.392 | 27 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_portaltp` | 209.292 | 29 (cod_ibge, municipio, uf, unidade_gestora, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_portaltransp` | 3.669 | 16 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, cpf_masc…) |
| `folha_servidores_portovelho` | 15.827 | 27 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_pronimgrade` | 1.300 | 18 (cod_ibge, municipio, uf, competencia, unidade, matricula, tipo_folha, nome…) |
| `folha_servidores_publicsoft` | 54.746 | 17 (cod_ibge, municipio, uf, ctx, competencia, nome, cpf_masc, cargo…) |
| `folha_servidores_quality` | 7.824 | 26 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_remuneracoes` | 7.800 | 17 (cod_ibge, municipio, uf, competencia, categoria, nome, cargo, padrao_cargo…) |
| `folha_servidores_rhsys` | 4.034 | 17 (cod_ibge, municipio, uf, host, competencia, matricula, nome, cargo…) |
| `folha_servidores_rpm` | 99.800 | 20 (cod_ibge, municipio, uf, cnpj, competencia, matricula, nome, cpf_masc…) |
| `folha_servidores_saiio` | 2.941 | 18 (cod_ibge, municipio, uf, cod_orgao, competencia, matricula, nome, cpf_masc…) |
| `folha_servidores_sc` | 5.491.765 | 17 (anomes, cod_ibge, municipio, orgao, poder, lotacao, cargo, tipo_cargo…) |
| `folha_servidores_scpi` | 280.472 | 19 (cod_ibge, municipio, uf, host, referencia, matricula, contrato, data_admissao…) |
| `folha_servidores_scpicsv` | 294.788 | 21 (cod_ibge, municipio, uf, host, competencia, referencia, matricula, contrato…) |
| `folha_servidores_scriptcase` | 2.242 | 12 (cod_ibge, municipio, uf, poder, competencia, nome, vinculo, simbolo…) |
| `folha_servidores_siapapi` | 39.954 | 15 (cod_ibge, municipio, uf, host, entidade, competencia, matricula, nome…) |
| `folha_servidores_sigafi` | 2.154 | 18 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao…) |
| `folha_servidores_sinsoft` | 8.477 | 19 (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, horas…) |
| `folha_servidores_siplanweb` | 38.001 | 19 (cod_ibge, municipio, uf, host, competencia, matricula, nome, secretaria…) |
| `folha_servidores_smarapd` | 121.858 | 16 (cod_ibge, municipio, uf, host, competencia, matricula, nome, cargo…) |
| `folha_servidores_spapublico` | 36.199 | 21 (cod_ibge, municipio, uf, host, competencia, matricula, nome, cargo…) |
| `folha_servidores_ss` | 131.234 | 16 (cod_ibge, municipio, uf, entcod, entidade, poder, competencia, secretaria…) |
| `folha_servidores_sys523` | 9.855 | 14 (cod_ibge, municipio, uf, entidade, competencia, nome, cargo, lotacao…) |
| `folha_servidores_tcemt` | 181.229 | 18 (cod_ibge, municipio, uf, entidade, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_tcepb` | 1.519.456 | 16 (cod_ibge, municipio, uf, competencia, unidade_gestora, codigo_unidade, secretaria, nome…) |
| `folha_servidores_tcepta` | 17.651 | 18 (cod_ibge, municipio, uf, host, competencia, referencia, matricula_cpf, nome…) |
| `folha_servidores_tcgestao` | 1.854 | 15 (cod_ibge, municipio, uf, base, competencia, orgao, nome, cpf_masc…) |
| `folha_servidores_tche` | 11.248 | 19 (cod_ibge, municipio, uf, competencia, nome, ente, departamento, cargo…) |
| `folha_servidores_tcidadao` | 4.319 | 16 (cod_ibge, municipio, uf, id_cidade, entidade, competencia, tipo_folha, matricula…) |
| `folha_servidores_tcmba` | 681.891 | 20 (cod_ibge, municipio, uf, cd_entidade, entidade, competencia, nome, matricula…) |
| `folha_servidores_tenosoft` | 35.727 | 17 (cod_ibge, municipio, uf, entidade, competencia, matricula, nome, cargo…) |
| `folha_servidores_topsolutions` | 51.477 | 21 (cod_ibge, municipio, uf, host, competencia, nome, cpf_masc, matricula…) |
| `folha_servidores_transpal` | 2.321 | 14 (cod_ibge, municipio, uf, base, competencia, orgao, matricula, nome…) |
| `folha_servidores_transparenciaweb` | 61.580 | 18 (cod_ibge, municipio, uf, unidade_gestora, competencia, matricula, nome, secretaria…) |
| `folha_servidores_transpcidadao` | 11.381 | 22 (cod_ibge, municipio, uf, id_cidade, entidade, competencia, matricula, nome…) |
| `folha_servidores_transpfacil` | 12.570 | 14 (cod_ibge, municipio, uf, database_id, competencia, matricula, nome, secretaria…) |
| `folha_servidores_transphd` | 1.203 | 18 (cod_ibge, municipio, uf, cod_empre, competencia, matricula, nome, cargo…) |
| `folha_siapapi_coleta` | 40 | 10 (cod_ibge, municipio, uf, host, entidade, competencia, linhas, situacao…) |
| `folha_sigafi_coleta` | 3 | 9 (cod_ibge, municipio, uf, url, situacao, detalhe, linhas, competencia…) |
| `folha_sinsoft_coleta` | 28 | 11 (cod_ibge, municipio, uf, slug, competencia, arquivo, linhas, confere…) |
| `folha_siplanweb_coleta` | 56 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_smarapd_coleta` | 50 | 9 (cod_ibge, municipio, uf, host, linhas, situacao, detalhe, em…) |
| `folha_sonda_municipal` | 517 | 19 (cod_ibge, municipio, uf, url_base, origem_url, url_pessoal, erp, ckan_host…) |
| `folha_spapublico_coleta` | 15 | 9 (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe…) |
| `folha_ss_coleta` | 128 | 10 (entcod, cod_ibge, municipio, uf, entidade, competencia, linhas, situacao…) |
| `folha_sys523_coleta` | 23 | 9 (cod_ibge, municipio, uf, url, competencia, linhas, situacao, detalhe…) |
| `folha_tcemt_coleta` | 1 | 5 (chave, linhas, situacao, detalhe, em) |
| `folha_tcemt_nominal_coleta` | 1 | 6 (chave, offset_final, linhas, situacao, detalhe, em) |
| `folha_tcemt_radar` | 24.947 | 12 (cod_ibge, municipio, entidade, esfera, categoria, tipo_vinculo, situacao, ano_folha…) |
| `folha_tcepb_coleta` | 223 | 9 (cod_tce, cod_ibge, municipio, ano, competencia, linhas, situacao, detalhe…) |
| `folha_tcepta_coleta` | 20 | 10 (cod_ibge, municipio, uf, host, competencia, linhas, mensais, situacao…) |
| `folha_tcgestao_coleta` | 5 | 9 (cod_ibge, municipio, uf, base, competencia, linhas, situacao, detalhe…) |
| `folha_tche_coleta` | 13 | 10 (cod_ibge, municipio, uf, url, competencia, servidores, com_valor, situacao…) |
| `folha_tcidadao_coleta` | 14 | 10 (cod_ibge, municipio, uf, id_cidade, entidade, competencia, linhas, situacao…) |
| `folha_tcmba_coleta` | 997 | 7 (cod_ibge, cd_entidade, competencia, linhas, situacao, detalhe, em) |
| `folha_tenosoft_coleta` | 29 | 9 (cod_ibge, municipio, uf, entidade, competencia, linhas, situacao, detalhe…) |
| `folha_topsolutions_coleta` | 57 | 8 (cod_ibge, municipio, host, competencia, linhas, situacao, detalhe, em) |
| `folha_transpal_coleta` | 2 | 9 (cod_ibge, municipio, uf, base, competencia, linhas, situacao, detalhe…) |
| `folha_transpcidadao_coleta` | 23 | 9 (cod_ibge, municipio, uf, id_cidade, competencia, linhas, situacao, detalhe…) |
| `folha_transpfacil_coleta` | 24 | 9 (cod_ibge, municipio, uf, database_id, competencia, linhas, situacao, detalhe…) |
| `folha_transphd_coleta` | 10 | 9 (cod_ibge, municipio, uf, cod_empre, competencia, linhas, situacao, detalhe…) |
| `folha_tw_coleta` | 19 | 9 (cod_ibge, ug, municipio, uf, competencia, linhas, situacao, detalhe…) |
| `folha_tw_portal` | 6 | 5 (cod_ibge, municipio, uf, base_url, ativo) |
| `folha_verificacao_municipal` | 541 | 11 (cod_ibge, municipio, uf, host, rota_com_dados, linhas, tem_valor, rotas_testadas…) |
| `folha_verificacao_site` | 1.551 | 19 (cod_ibge, municipio, uf, site, site_status, url_transparencia, url_pessoal, rotulo_pessoal…) |
| `frescor_log` | 58 | 6 (id, rodado_em, total, ok, resumo, problemas) |
| `frota_sc` | 289 | 6 (cod_ibge, ano, total, automovel, motocicleta, atualizado) |
| `fundeb_hist_sc` | 1.142 | 8 (cod_ibge, ano, matriculas, ponderadas, receita, vaaf_calc, breakdown, atualizado) |
| `fundeb_matriculas_sc` | 295 | 19 (cod_ibge, ano, creche, creche_int, pre, pre_int, fund_ai, fund_ai_int…) |
| `fundeb_motor_sc` | 590 | 8 (cod_ibge, ano, matriculas, ponderadas, receita, vaaf_calc, breakdown, atualizado) |
| `fundeb_oficial_sc` | 590 | 13 (cod_ibge, ano, total, integral, especial, rural, infantil, fundamental…) |
| `genexus_srvbr_portal` | 491 | 11 (cod_ibge, municipio, uf, rotulo_radar, url_portal, base_url, home_servlet, versao…) |
| `genexus_wwp_portal` | 1.515 | 8 (cod_ibge, municipio, uf, host, url_rh, situacao, detalhe, em) |
| `geography_columns` | 0 | 7 (f_table_catalog, f_table_schema, f_table_name, f_geography_column, coord_dimension, srid, type) |
| `geometry_columns` | 1 | 7 (f_table_catalog, f_table_schema, f_table_name, f_geometry_column, coord_dimension, srid, type) |
| `govbr_coleta` | 622 | 6 (cod_ibge, periodo, linhas, situacao, detalhe, em) |
| `govbr_descoberta` | 2.873 | 7 (cod_ibge, municipio, uf, url_portal, host, situacao, em) |
| `govbr_gp_coleta` | 57 | 6 (cod_ibge, competencia, linhas, situacao, detalhe, em) |
| `govbr_portal` | 270 | 9 (cod_ibge, municipio, uf, host, banco, situacao, linhas, detalhe…) |
| `govbr_probe` | 5.570 | 6 (cod_ibge, municipio, uf, host, achou, em) |
| `host_censo_uf` | 106 | 12 (uf, cod_ibge, municipio, host, familia, rota, http, linhas…) |
| `ibama_autos_sc` | 292 | 6 (cod_ibge, n_autos, valor_total, n_recentes, serie, atualizado) |
| `ibama_embargos_sc` | 189 | 6 (cod_ibge, n_embargos, area_ha, n_recentes, serie, atualizado) |
| `ibge_producao_sc` | 295 | 13 (cod_ibge, vbp_agricola, area_colhida_ha, efetivo_bovino, efetivo_suino, efetivo_aves, n_empresas, pessoal_ocupado…) |
| `icmbio_uc_sc` | 119 | 6 (cod_ibge, n_ucs, area_uc_ha, pct_territorio, maior_uc, atualizado) |
| `ideb_sc` | 17.187 | 7 (cod_ibge, ano, etapa, rede, ideb, meta, nota_saeb) |
| `idhm_sc` | 293 | 7 (cod_ibge, ano, idhm, idhm_renda, idhm_long, idhm_educ, atualizado) |
| `iegm_sc` | 4.039 | 6 (cod_ibge, ano, indicador, pct, faixa, atualizado_em) |
| `igdm_sc` | 295 | 7 (cod_ibge, anomes, igdm, freq_escolar, agenda_saude, atual_cadastral, atualizado) |
| `incra_assentamentos_sc` | 63 | 6 (cod_ibge, n_assentamentos, familias, area_ha, serie, atualizado) |
| `indicador_valores` | 2.080 | 4 (municipio_id, indicador_id, ano, valor) |
| `indicadores` | 16 | 8 (id, codigo, nome, area, unidade, fonte, direcao_melhor, descricao) |
| `indicadores_aps_sc` | 2.950 | 11 (cod_ibge, quadrimestre, ind1, ind2, ind3, ind4, ind5, ind6…) |
| `indicadores_inep_escola_sc` | 15.804 | 9 (co_entidade, cod_ibge, ano, indicador, ed_inf, fun_ai, fun_af, medio…) |
| `indicadores_inep_sc` | 1.770 | 8 (cod_ibge, ano, indicador, ed_inf, fun_ai, fun_af, medio, atualizado) |
| `indicadores_sc` | 5.003 | 7 (cod_ibge, ano, codigo, area, valor, unidade, fonte) |
| `indices_pnigp` | 130 | 9 (municipio_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `indices_pnigp_estados` | 135 | 9 (estado_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao…) |
| `instrumento_cobranca_sc` | 2.048 | 25 (cnpj, ano, sequencial_contrato, sequencial_instrumento, cod_ibge, uf, municipio_nome, esfera…) |
| `ipm_item_rotina` | 67 | 10 (cod_ibge, municipio, uf, slug, nome_item, codigo, rot, aca…) |
| `item_apresentacao_desc_sc` | 48.209 | 7 (chave, unidade_basica, fator, conf, metodo, n_itens, atualizado) |
| `item_apresentacao_sc` | 3.061 | 9 (unidade, unidade_basica, fator, forma, dimensao, conf, metodo, n_itens…) |
| `item_catmat_map` | 38.889 | 10 (chave, codigo_pdm, nome_pdm, nome_classe, sim, n_itens, atualizado, aceito…) |
| `item_especificacao_sc` | 2 | 10 (cnpj, ano, seq, numero, descricao_pncp, especificacao, origem_tipo_documento, origem_sequencial…) |
| `item_homologado_sc` | 1.125.941 | 31 (cod_ibge, cnpj, ano, seq, numero, municipio_nome, modalidade, srp…) |
| `item_marca_gabarito_sc` | 1.200 | 12 (cnpj, ano, seq, numero, grupo, modalidade, descricao, tem_marca…) |
| `item_marca_sc` | 13.108 | 12 (cod_ibge, cnpj, ano, seq, numero, descricao, produto_ata, modelo…) |
| `item_nota_fiscal_sc` | 484 | 17 (cnpj, ano, sequencial_contrato, sequencial_instrumento, numero_produto, cod_ibge, chave_nfe, numero_controle_compra…) |
| `item_resultado_sc` | 1.711.603 | 23 (cod_ibge, cnpj, ano, seq, numero, sequencial_resultado, ni_fornecedor, nome_razao_social_fornecedor…) |
| `itens_classificacao_sc` | 741.906 | 14 (descr_norm, tipo, cat_nivel, cat_cod, cat_nome, cat_classe, shared, cobertura…) |
| `itens_proc_feitos` | 252.146 | 4 (numero_controle, n, feito_em, versao) |
| `itens_sc` | 2.301.143 | 49 (cod_ibge, cnpj, ano, seq, numero, descricao, unidade, quantidade…) |
| `itens_sc_feitos` | 0 | 2 (cod_ibge, ano) |
| `itsolucoes_entidade` | 46 | 8 (p_i, entidade, municipio_txt, uf, cod_ibge, tem_remuneracao, linhas_amostra, em) |
| `lances_sc` | 10.948 | 10 (cnpj, ano, seq, numero, cod_ibge, ordem, fornecedor, valor…) |
| `lpg_sc` | 0 | 6 (cod_ibge, transferido, saldo, utilizado, pct_utilizado, atualizado) |
| `marca_ancora_feitas` | 34.407 | 6 (cnpj, ano, seq, n_marca, via_haiku, feito_em) |
| `marca_ata_feitas` | 79.363 | 6 (cnpj, ano, seq, n_marcas, feito_em, n_propostas) |
| `marca_tpl_feitas` | 148.759 | 5 (cnpj, ano, seq, n_marca, feito_em) |
| `mcmv_sc` | 295 | 7 (cod_ibge, uh_financiadas, vlr_financiamento, vlr_subsidio, ano_min, ano_max, atualizado) |
| `medicamentos_alto_custo_sc` | 295 | 6 (cod_ibge, periodo, valor, quantidade, top_meds, atualizado) |
| `memory_entidade` | 146 | 6 (cod_ibge, municipio, uf, entidade, situacao, em) |
| `metas` | 130 | 6 (id, municipio_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_estados` | 135 | 6 (id, estado_id, indicador_id, ano_alvo, valor_alvo, descricao) |
| `metas_fiscais_feitos` | 2.368 | 2 (cod_ibge, ano) |
| `metas_fiscais_sc` | 1.417 | 12 (cod_ibge, ano, meta_primario, resultado_primario, meta_nominal, resultado_nominal, receita_prim_prev, receita_prim_real…) |
| `mi_social_serie_sc` | 1.238.760 | 4 (cod_ibge, anomes, indicador, valor) |
| `mislabel_unidade_sc` | 1.920 | 13 (cod_ibge, nome_pdm, descricao, unidade, unit_homologado, unidade_basica, pub, med…) |
| `msc_despesa_sc` | 3.435 | 7 (cod_ibge, ano, tipo, categoria, valor, total_rreo, atualizado) |
| `munic_sc` | 30.385 | 8 (cod_ibge, indicador, grupo, label, tem, atualizado, valor, ano) |
| `municipios` | 26 | 9 (id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito…) |
| `municipios_br` | 5.570 | 4 (cod_ibge, cod_ibge6, nome, uf) |
| `municipios_geo` | 295 | 2 (cod_ibge, geom) |
| `museus_sc` | 111 | 3 (cod_ibge, museus, atualizado) |
| `nf_check` | 780 | 3 (cnpj_orgao, checado, n) |
| `nf_sc` | 0 | 11 (cod_ibge, cnpj_orgao, ano, seq_contrato, seq_instrumento, tipo, numero, chave_nfe…) |
| `notificacao_cadastro` | 1 | 20 (id, cod_ibge, nome, cpf, matricula, cargo, secretaria, perfil…) |
| `notificacao_impacto` | 380 | 7 (id, cod_ibge, alerta_id, tipo_impacto, valor, descricao, registrado_em) |
| `notificacao_log` | 8.860 | 11 (id, cod_ibge, alerta_id, chave_delta, destinatario_id, canal, severidade, enviado_em…) |
| `notificacao_regras` | 55 | 12 (alerta_id, titulo, secretaria, natureza, severidade, tem_prazo, fonte_dado, solucao_i10…) |
| `novopac_sc` | 277 | 5 (cod_ibge, projetos, valor_previsto, em_andamento, atualizado) |
| `obras_sc` | 2.156 | 14 (id_unico, cod_ibge, nome, situacao, especie, natureza, valor, origem…) |
| `orgaos_municipais_sc` | 874 | 2 (cod_ibge, cnpj) |
| `orgaos_sc_feitos` | 295 | 1 (cod_ibge) |
| `paa_sc` | 57 | 6 (cod_ibge, formalizado, executado, devolvido, ultimo_ano, atualizado) |
| `painel_gold` | 31.725 | 13 (id_compra_item, descricao_item, descricao_detalhada, codigo_item, codigo_pdm, nome_pdm, codigo_classe, nome_classe…) |
| `pca_sc` | 67 | 6 (cod_ibge, n_itens, valor_total, por_categoria, por_ano, top) |
| `pca_sc_feitos` | 295 | 2 (cod_ibge, n) |
| `pdde_saldo_sc` | 295 | 5 (cod_ibge, ano, saldo, escolas, atualizado) |
| `pdde_sc` | 1.148 | 5 (cod_ibge, ano, vl_total, n_escolas, qt_alunos) |
| `pg_stat_statements` | 3.116 | 52 (userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time…) |
| `pg_stat_statements_info` | 1 | 2 (dealloc, stats_reset) |
| `pi_appm_sonda` | 109 | 11 (cod_ibge, municipio, slug, url, competencia, linhas, cabecalho, tem_valor…) |
| `pi_folha_pag_sonda` | 224 | 10 (cod_ibge, municipio, url, linhas, cabecalho, tem_valor, tem_lotacao, situacao…) |
| `pi_host_censo` | 380 | 9 (cod_ibge, municipio, host, familia, v2_json, v2_total, v2_comp, detalhe…) |
| `pi_link_medida` | 97 | 12 (cod_ibge, municipio, rotulo, url, url_final, http, linhas, tem_valor…) |
| `pi_menu_folha` | 74 | 9 (cod_ibge, municipio, entrada, rotulo, url, situacao, linhas, tem_valor…) |
| `pi_servidores_visita` | 200 | 11 (cod_ibge, municipio, url, linhas, cabecalho, tem_valor, situacao, detalhe…) |
| `pi_v2_sonda` | 224 | 10 (cod_ibge, municipio, url_json, total, ano, mes, tem_valor, situacao…) |
| `pib_municipal_sc` | 295 | 8 (cod_ibge, ano, pib, pib_per_capita, atualizado, serie, componentes, componentes_serie) |
| `pix_municipio_sc` | 7.375 | 8 (cod_ibge, ano_mes, vl_recebido, vl_recebido_pj, vl_pago, qt_recebido, n_pes_receb_pj, atualizado) |
| `pnae_agri_sc` | 286 | 6 (cod_ibge, ano, valor_transferido, valor_agri, percentual, atualizado) |
| `pncp_evento` | 162.303 | 22 (cnpj, ano, seq, cod_ibge, categoria, acao, item_numero, resultado_sequencial…) |
| `pnld_reserva_sc` | 7 | 6 (cod_ibge, ano, qtd_demandada, qtd_autorizada, qtd_atendimento, n_volumes) |
| `populacao_faixa_sc` | 295 | 11 (cod_ibge, total, pop_0_14, pop_15_59, pop_60, pop_80, pct_idosos, razao_dependencia…) |
| `populacao_idade_sc` | 295 | 8 (cod_ibge, ano, creche_0_3, pre_4_5, fund_6_14, medio_15_17, pop_0_17, idades) |
| `portal_produto` | 565 | 8 (cod_ibge, municipio, uf, url, produto, evidencia, em, achado_em) |
| `portal_real_descoberto` | 5.239 | 8 (cod_ibge, erp_radar, municipio, uf, url_site, url_portal_real, fornecedor, em) |
| `precatorios_entes_sc` | 301 | 7 (cd_entidade, de_entidade, cod_ibge, regime, valor, qtde, atualizado) |
| `precatorios_sc` | 244 | 5 (cod_ibge, total_valor, total_qtde, n_entes, atualizado) |
| `precos_catmat_map` | 836 | 6 (chave, codigo_pdm, nome_pdm, nome_classe, item_ex, sim) |
| `precos_nacional_ref` | 0 | 11 (codigo_pdm, unidade, forma, mediana, p25, p75, media, desvio…) |
| `precos_referencia_basica_sc` | 4.988 | 12 (codigo_pdm, nome_pdm, nome_classe, unidade_basica, forma, n_compras, n_munis, n_excluidos…) |
| `precos_referencia_sc` | 2.067 | 13 (chave, unidade, mediana, p25, p75, n_itens, n_munis, catmat_pdm…) |
| `prefeitura_de_camara` | 367 | 12 (cod_ibge, municipio, uf, url_camara, url_prefeitura, regra, evidencia, em…) |
| `previne_sc` | 5.310 | 7 (cod_ibge, competencia, indicador, ind_nome, numerador, denominador, pct) |
| `processo_fase_sc` | 239.492 | 17 (cnpj, ano, seq, cod_ibge, municipio_nome, modalidade, modalidade_id, objeto…) |
| `processo_trava` | 3 | 4 (nome, dono, desde, batida) |
| `processos_ata_sc` | 12.566 | 3 (cnpj, seq, ano) |
| `processos_feitos` | 55 | 4 (modalidade, ano, n, concluido_em) |
| `processos_sc` | 252.178 | 11 (cnpj_orgao, ano, sequencial, cod_ibge, numero_controle, modalidade_id, modalidade, objeto…) |
| `prodes_sc` | 4.347 | 5 (cod_ibge, ano, area_km2, n_poligonos, atualizado) |
| `producao_aps_serie_sc` | 19.461 | 5 (cod_ibge, competencia, aprovadas, total, atualizado) |
| `producao_aps_sisab_sc` | 263 | 5 (cod_ibge, fichas_aprovadas, fichas_total, competencia, atualizado) |
| `programa_beneficiario_sc` | 1.583 | 9 (id_beneficiario, id_programa, cod_ibge, nome, uf, tipo, valor, numero_emenda…) |
| `programas_catalogo` | 2.081 | 10 (id_programa, nome_programa, orgao, modalidade, natureza, uf, ano, dt_ini_prop…) |
| `programas_federais_sc` | 33 | 10 (id, area, nome, objeto, orgao, fonte, link, elegibilidade…) |
| `programas_transferegov` | 310 | 23 (id_programa, modulo, nome, orgao, modalidade, situacao, valor_global, uf…) |
| `pronaf_sc` | 875 | 8 (cod_ibge, ano, qtd_contratos, vl_total, vl_custeio, vl_investimento, area_ha, atualizado) |
| `propostas_sc` | 10.948 | 19 (cnpj, ano, seq, numero, cod_ibge, descricao, fornecedor, marca…) |
| `publicsoft_ctx` | 172 | 7 (cod_ibge, municipio, uf, ctx, em, situacao, url_pessoal) |
| `quadro_pessoal_pi` | 28.086 | 17 (cod_ibge, municipio, uf, url, competencia, nome, cpf_masc, cargo…) |
| `quadro_pessoal_pi_coleta` | 188 | 8 (cod_ibge, municipio, url, competencia, linhas, situacao, detalhe, em) |
| `qualidade_aps_sc` | 2.551 | 9 (cod_ibge, quadrimestre, equipe, otimo, bom, suficiente, regular, total…) |
| `qualidade_indicadores_sc` | 12.525 | 10 (cod_ibge, quadrimestre, co_indicador, nome, categoria, otimo, bom, suficiente…) |
| `queimadas_sc` | 5.323 | 7 (cod_ibge, ano, mes, focos, risco_medio, bioma, atualizado) |
| `quilombos_sc` | 12 | 4 (cod_ibge, n_comunidades, comunidades, atualizado) |
| `raas_saude_mental_sc` | 108 | 5 (cod_ibge, periodo, atendimentos, registros, atualizado) |
| `radar_captacao_sc` | 4.590 | 8 (cod_ibge, id_programa, nome_programa, orgao, modalidade, dt_ini_prop, dt_fim_prop, situacao) |
| `radar_portal` | 11.697 | 13 (cod_ibge, municipio, uf, unidade_gestora, site, url_portal, nivel_transparencia, host…) |
| `rais_sc` | 590 | 9 (cod_ibge, ano, estoque, massa_salarial, remun_media, por_setor, estabelecimentos, por_porte…) |
| `ranking_detalhe_sc` | 7.792 | 7 (cod_ibge, ano, verificacao, dimensao, anexo, descricao, atualizado) |
| `ranking_tesouro_sc` | 2.065 | 10 (cod_ibge, ano, nota, posicao, pct_acertos, di, dii, diii…) |
| `receitas_det_check` | 1.480 | 2 (cod_ibge, ano) |
| `receitas_detalhe_sc` | 15.160 | 4 (cod_ibge, ano, item, valor) |
| `red_flags_fornecedores_sc` | 40.244 | 12 (cod_ibge, ni, fornecedor, n_contratos, valor_total, share_pct, sancionado, sanc_tipo…) |
| `rfb_arrecadacao_sc` | 2.044 | 5 (cod_ibge, ano, total, previdenciaria, atualizado) |
| `rgf_sc` | 2.474 | 10 (cod_ibge, ano, pessoal_pct, pessoal_valor, limite_pct, rcl_ajustada, dcl_valor, dcl_pct…) |
| `rpm_catalogo` | 88 | 3 (cnpj, nome_bubble, em) |
| `rpps_atuarial_sc` | 420 | 5 (cod_ibge, exercicio, deficit_atuarial, ativos, no_ente) |
| `rpps_check` | 1.480 | 2 (cod_ibge, ano) |
| `rpps_crp_sc` | 14.400 | 9 (cod_ibge, nr_cnpj_entidade, no_ente, sg_uf, nr_crp, ds_situacao, tp_crp, dt_emissao…) |
| `rpps_sc` | 329 | 9 (cod_ibge, ano, receita, despesa, resultado, contrib_segurados, contrib_patronais, aposentadorias…) |
| `rreo_const_sc` | 1.272 | 9 (cod_ibge, ano, educacao_pct, educacao_min, educacao_valor, fundeb_pct, rcl, saude_pct…) |
| `saeb_sc` | 15.717 | 7 (cod_ibge, ano, etapa, rede, matematica, portugues, atualizado) |
| `salario_educacao_sc` | 566 | 5 (cod_ibge, ano, salario_educacao, fnde_total, atualizado) |
| `salic_sc` | 177 | 6 (cod_ibge, projetos, aprovado, captado, gap, atualizado) |
| `sancoes` | 27.190 | 11 (id, fonte, ni, tipo_pessoa, nome, tipo_sancao, orgao, data_inicio…) |
| `saneamento_sc` | 885 | 9 (cod_ibge, indicador, label, domicilios, atendidos, pct, fonte, ano…) |
| `saude_producao_sc` | 1.463 | 6 (cod_ibge, ano, internacoes, valor_internacoes, sia_qtd, sia_valor) |
| `sazonalidade_preco_sc` | 96 | 4 (categoria, mes, indice, n) |
| `scpi_base_extra` | 2 | 6 (cod_ibge, municipio, uf, base, rotulo, descoberto_em) |
| `scpi_prefeitura_descoberta` | 0 | 7 (cod_ibge, municipio, uf, host_camara, host_prefeitura, evidencia, em) |
| `scpiweb_descoberto` | 2.011 | 8 (cod_ibge, municipio, uf, host, url, situacao, detalhe, em) |
| `serie_anotacao` | 0 | 6 (id, escopo, cod_ibge, ano, texto, criado) |
| `setores_censitarios_sc` | 16.736 | 11 (cod_setor, cod_ibge, bairro, area_km2, populacao, domicilios, densidade_dom, atualizado…) |
| `setores_geo_sc` | 295 | 4 (cod_ibge, n_setores, geojson, atualizado) |
| `sia_producao_sc` | 295 | 10 (cod_ibge, periodo, q_basica, v_basica, q_media, v_media, q_alta, v_alta…) |
| `siapapi_portal` | 6 | 6 (cod_ibge, municipio, uf, host, entidade, em) |
| `sih_sc` | 590 | 6 (cod_ibge, ano, internacoes, valor_total, obitos_hosp, atualizado) |
| `sim_sc` | 2.360 | 8 (cod_ibge, ano, obitos, causas_externas, circulatorio, neoplasias, infantil, atualizado) |
| `simad_municipio` | 294 | 3 (cod_ibge, cod_simad, nome) |
| `sinan_agravos_sc` | 2.181 | 5 (cod_ibge, agravo, ano, casos, atualizado) |
| `sinan_dengue_sc` | 2.065 | 6 (cod_ibge, ano, casos, incidencia_100k, nivel_max, atualizado) |
| `sinasc_sc` | 1.770 | 8 (cod_ibge, ano, nascimentos, baixo_peso, prematuros, prenatal_7mais, mae_adolescente, atualizado) |
| `sinesp_vitimas_sc` | 295 | 6 (cod_ibge, vitimas_total, ano_ini, ano_fim, serie, atualizado) |
| `sinisa_sc` | 295 | 6 (cod_ibge, ano, agua_atend, esgoto_atend, residuos_atend, atualizado) |
| `siop_acoes` | 5.609 | 17 (exercicio, esfera, uo, funcao, subfuncao, programa, acao, titulo…) |
| `siops_sc` | 1.475 | 9 (cod_ibge, ano, saude_pct, saude_valor, saude_min, transf_saude_pct, transf_uniao_pct, transf_saude_valor…) |
| `sisagua_sc` | 287 | 6 (cod_ibge, analisadas, fora_padrao, pct_fora, ano, atualizado) |
| `site_municipal_derivado` | 204 | 9 (cod_ibge, municipio, uf, url_site, origem, erp, url_erp, erp_via…) |
| `site_municipal_links` | 597 | 8 (cod_ibge, municipio, uf, url_lida, links, n_links, situacao, em) |
| `smarapd_probe` | 5.570 | 6 (cod_ibge, municipio, uf, host, achou, em) |
| `snis_residuos_sc` | 0 | 9 (cod_ibge, ano, cod_psv, prestador, sigla, abrangencia, natureza, indicadores…) |
| `snis_sc` | 2.427 | 17 (cod_ibge, ano, cod_psv, prestador, sigla, abrangencia, natureza, servico…) |
| `sobrepreco_compras_sc` | 5.879 | 15 (cod_ibge, chave, unidade, descricao, ano, quantidade, unit_pago, unit_ref…) |
| `sobrepreco_medicamentos_sc` | 401 | 11 (id, cod_ibge, descricao, dose, paga, teto, excesso_pct, quantidade…) |
| `spatial_ref_sys` | 8.500 | 5 (srid, auth_name, auth_srid, srtext, proj4text) |
| `ss_catalogo` | 331 | 8 (entcod, entidade, municipio_nome, uf_nome, cod_ibge, uf, tipo, em) |
| `suas_saldo_sc` | 295 | 5 (cod_ibge, competencia, repasse_mes, saldo, atualizado) |
| `suas_sc` | 295 | 10 (cod_ibge, municipio, anomes, cras, creas, acolhimento, populacao, hab_por_cras…) |
| `taxa_evasao_sc` | 295 | 8 (cod_ibge, periodo, dependencia, ev_fund, ev_fund_ai, ev_fund_af, ev_medio, atualizado) |
| `tc_folha_varredura` | 33 | 9 (sigla, uf, nome, nivel, host, veredito, evidencia, urls_testadas…) |
| `tc_ms_software_house` | 79 | 8 (cod_ibge, municipio, municipio_fonte, razao_social, cnpj, regiao, conselheiro, _coletado_em) |
| `tcesc_contrato` | 798.658 | 10 (linha_hash, idcontrato, numero_contrato, data_assinatura, data_vencimento, descricao_objetivo, codigo_registro_contrato, contrato_com_despesa…) |
| `tcesc_contrato_aditivo` | 368.045 | 9 (linha_hash, idContratoPai, numero_contrato_superior, valor_contrato_superior, data_assinatura_superior, data_vencimento_superior, descricao_objetivo_superior, descricao_tipo_unidade_contrato…) |
| `tcesc_item_contrato` | 1.186.396 | 11 (linha_hash, idcontrato, id_item_contratado, descricao_item_contratado, descricao_unidade_medida_contratado, valor_unitario_contratado, quantidade_item_contratado, valor_total_contratado…) |
| `tcesc_item_participante` | 10.717.930 | 9 (linha_hash, identificador_sfi_processo_licitatorio, nome_ente, nome_participante_rfb, indicativo_vencedor, descricao_item_licitacao, numero_ordem_classificacao, valor_orcado_item…) |
| `tcesc_link_contrato` | 1.863.603 | 5 (linha_hash, identificador_sfi_processo_licitatorio, idcontrato, nome_ente, atualizado) |
| `tcesc_link_participante` | 2.042.859 | 5 (linha_hash, idparticipante, nome_ente, identificador_sfi_processo_licitatorio, atualizado) |
| `tcesc_medicao` | 1.242.388 | 7 (linha_hash, idcontrato, ano_mes, data_medicao, numero_medicao, valor_medicao, atualizado) |
| `tcesc_ocorrencia` | 1.088.937 | 6 (linha_hash, identificador_sfi_processo_licitatorio, data_ocorrencia_licitacao, descricao_tipo_ocorrencia_licitacao, descricao_justificativa_ocorrencia_licitacao, atualizado) |
| `tcesc_processo_licitatorio` | 1.082.343 | 11 (linha_hash, identificador_sfi_processo_licitatorio, nome_ente, numero_edital, numero_processo_licitatorio, descricao_modalidade_licitacao, data_homologacao, descricao_objeto_licitacao…) |
| `tcesc_processo_participante` | 2.709.958 | 5 (linha_hash, identificador_sfi_processo_licitatorio, cpf_cnpj, nome_participante_rfb, atualizado) |
| `tcesc_publicidade` | 2.692.420 | 6 (linha_hash, identificador_sfi_processo_licitatorio, data_publicacao, descricao_tipo_meio_comunicacao, nome_veiculo_comunicacao, atualizado) |
| `tcesc_quadro_participantes` | 4.089.302 | 13 (linha_hash, chave, participante1_cpf_cnpj, participante1_nome, participante1_venceu_itens, participante1_perdeu_itens, participante2_cpf_cnpj, participante2_nome…) |
| `tcesc_situacao_obra` | 997.472 | 6 (linha_hash, idcontrato, ano_mes_situacao, descricao_tipo_situacao_obra_servico_engenharia, ultimo_mes, atualizado) |
| `tcesc_tipologia_contrato` | 809.593 | 9 (linha_hash, idcontrato, tipologia_contrato, numero_tipologia_contrato, observacao_contrato, cpf_cnpj_trilha_contratos, valor_contrato_tipologia, nome_ente_tipologia_contrato…) |
| `tcesc_trilha` | 967.776 | 8 (linha_hash, idparticipante, tipologia, numero_tipologia, observacao, cpf_cnpj_trilha, nome_trilha, atualizado) |
| `tche_portal` | 13 | 5 (cod_ibge, municipio, uf, url, achado_em) |
| `tcmba_entidade` | 1.025 | 6 (cod_ibge, cd_entidade, ds_entidade, municipio, populacao, em) |
| `tenosoft_portal` | 43 | 6 (cod_ibge, municipio, uf, entidade, detalhe, em) |
| `transferencias_cgu_sc` | 87.623 | 7 (cod_ibge, ano_mes, tipo_transferencia, orgao, funcao, valor, atualizado) |
| `transferencias_sc` | 295 | 8 (cod_ibge, n_instrumentos, valor_total, valor_liberado, por_situacao, por_orgao, top, por_ano) |
| `transferencias_stn_sc` | 168.075 | 6 (cod_ibge, item, ano, mes, valor, fonte) |
| `transpcidadao_portal` | 46 | 7 (id_cidade, rotulo, tipo, municipio, cod_ibge, uf, em) |
| `vaar_fundeb_sc` | 295 | 5 (cod_ibge, ano, habilitado, beneficiario, atualizado) |
| `vaat_fundeb_sc` | 290 | 7 (cod_ibge, ano, vaat, vaat_min, compl_vaat, recebe_vaat, atualizado) |
| `variacao_interna_sc` | 3.919 | 10 (cod_ibge, descricao, unidade, n_compras, menor, maior, razao, qtd_total…) |
| `votos_bancada_sc` | 5.458 | 4 (bancada_id, cod_ibge, votos, atualizado) |
| `votos_estadual_sc` | 9.434 | 3 (bancada_id, cod_ibge, votos) |
| `vw_cbo_grande_grupo` | 10 | 2 (cod, nome) |
| `vw_cobertura_uf` | NaN | 7 (uf, municipios_uf, completo, parcial, minimo, sem_dado, pct_completo) |
| `vw_folha_al` | 72.181 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_am` | 214.528 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_camara_brasil` | NaN | 21 (fonte, uf, competencia, cod_ibge, municipio, orgao, secretaria, lotacao_fonte…) |
| `vw_folha_camara_homonimo` | NaN | 7 (cod_ibge, uf, municipio, nome_chave, pessoas_distintas, cpfs, cargos) |
| `vw_folha_camara_pessoa` | NaN | 20 (cod_ibge, uf, municipio, nome_chave, nome, cpf_visivel, cpf_masc, cpf_padrao…) |
| `vw_folha_cobertura` | 253 | 10 (fonte, natureza, uf, linhas, municipios, com_secretaria, com_nome, com_salario…) |
| `vw_folha_es` | 205.608 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_ja_coletada` | 4.249 | 1 (cod_ibge) |
| `vw_folha_ma` | 18.478 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_mg` | 611.065 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_municipal_brasil` | 31.754.031 | 16 (fonte, natureza, uf, competencia, cod_ibge, municipio, orgao, secretaria…) |
| `vw_folha_municipal_sc` | 4.430.699 | 14 (anomes, cod_ibge, municipio, orgao, poder, lotacao_origem, area, cargo…) |
| `vw_folha_municipio_qualidade` | 12.361 | 9 (fonte, uf, cod_ibge, municipio, linhas, tem_cargo, tem_salario, tem_secretaria…) |
| `vw_folha_oficial` | 20.637.500 | 14 (fonte, natureza, uf, competencia, cod_ibge, municipio, orgao, secretaria…) |
| `vw_folha_pi` | 47.609 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_folha_rr` | 18.232 | 7 (fonte, cod_ibge, competencia, nome, cargo, secretaria, valor) |
| `vw_mg_rais` | 853 | 3 (cod_ibge, municipio, ativos) |
| `vw_mg_situacao` | 853 | 11 (cod_ibge, municipio, vinculos, com_valor, tem_cargo, tem_secretaria, fontes, erps…) |

## 2. Coleta (ETLs e scripts)

| Script | O que faz |
|---|---|
| `scripts/_acha_betha_ms.mjs` | Municípios de MS que o TCE diz serem BETHA e não têm portal mapeado em betha_portal: o hash do portal (transparencia.betha.cloud/#/{hash}) costuma estar linkado no site oficial. |
| `scripts/_acha_host_prefeitura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _acha_host_prefeitura.mjs — generaliza a regra descoberta no cidades |
| `scripts/_adm_assuncao.mjs` | — |
| `scripts/_adm_limpa.mjs` | — |
| `scripts/_adm_prog.mjs` | — |
| `scripts/_agili_link.mjs` | — |
| `scripts/_agili_mes.mjs` | O filtro de mês do ÁGILI funciona? Se o grid não recarrega, todo mês devolve o mesmo conjunto — e o rótulo de competência gravado seria falso. |
| `scripts/_agora.mjs` | — |
| `scripts/_agrupa_hosts.mjs` | Agrupa por HOST os links de pessoal dos municípios AINDA sem folha — é o que revela o bloco/produto. Só conta município que continua faltando (o que já foi coletado sai da conta). |
| `scripts/_al.mjs` | — |
| `scripts/_al2.mjs` | — |
| `scripts/_al3.mjs` | — |
| `scripts/_al4.mjs` | — |
| `scripts/_al5.mjs` | — |
| `scripts/_al6.mjs` | — |
| `scripts/_al7.mjs` | Alimenta a fila de `ingest_folha_portal_folhas.mjs` com os municípios de AL cujo portal responde em /transparencia/servidores/folhas/servidores/ — o varredor original só testava o  |
| `scripts/_al_resto.mjs` | Os 18 de AL que sobraram: qual variante e que tamanho? Decide onde vale investir. |
| `scripts/_am_aam_probe.mjs` | _am_aam_probe.mjs (9ª rodada) — caminhar a árvore na ORDEM (ano → tema → mês) e achar onde há arquivo. |
| `scripts/_am_anc_probe.mjs` | _am_anc_probe.mjs (6ª rodada) — por que o XLS de Beruri e Novo Aripuanã não abre. |
| `scripts/_am_baixa_razao.mjs` | _am_baixa_razao.mjs — quem está muito abaixo da RAIS: candidatos a coleta curta, não a município pequeno. |
| `scripts/_am_calibra.mjs` | _am_calibra.mjs — por que o coletor vê 2 arquivos onde o levantamento viu 14 (Alvarães, 03/2026)? |
| `scripts/_am_dd_probe.mjs` | _am_dd_probe.mjs — o bloco "Diretório Digital" (transparencia.diretoriodigital.inf.br + space-dd1 na DigitalOcean) aparece em Barreirinha, Careiro da Várzea, Nhamundá, Carauari e J |
| `scripts/_am_descobre.mjs` | _am_descobre.mjs — diagnóstico profundo dos municípios do AM que NÃO estão no portal da AAM: portal da prefeitura → link de transparência → tem item de pessoal? → que produto é? 🚨 |
| `scripts/_am_fecha_diagnostico.mjs` | _am_fecha_diagnostico.mjs — o fechamento do Amazonas: veredito MEDIDO de cada município que não tem folha. A lista serve de insumo direto para o pedido por LAI ([[pnigp-diagnostico |
| `scripts/_am_fecha_dois.mjs` | _am_fecha_dois.mjs — veredito medido dos dois que estavam com a AAM fora do ar na varredura. |
| `scripts/_am_layouts.mjs` | _am_layouts.mjs — classifica o LAYOUT do PDF de cada município que ficou em zero, para escrever parser por GRUPO e não um por município. Imprime a assinatura (primeira linha útil + |
| `scripts/_am_mapa.mjs` | _am_mapa.mjs — o mapa do Amazonas: quem já tem folha no banco, quem está no portal da AAM, quem sobra. |
| `scripts/_am_pdf_probe.mjs` | _am_pdf_probe.mjs — layouts de PDF que o parser #1 não pegou (cada município usa um sistema de folha). |
| `scripts/_am_registra_diagnostico.mjs` | _am_registra_diagnostico.mjs — grava POR QUE cada município do AM que resta não fecha. Sem isso, "faltam 22" vira backlog cego de engenharia quando metade é ausência de publicação  |
| `scripts/_am_registra_diagnostico2.mjs` | _am_registra_diagnostico2.mjs — vereditos dos maiores buracos do AM fora da AAM, medidos em 16/ago. |
| `scripts/_am_residuais.mjs` | _am_residuais.mjs — os 7 que entram no placar com quase nada: qual fonte, quais competências, quanto em cada uma. A vw_folha_es é a união montada pelo relatorio_folha_uf.mjs (rodar |
| `scripts/_am_tonantins_verdade.mjs` | _am_tonantins_verdade.mjs — Tonantins publica, mas PAROU em 2021: registrar isso é diferente de "coleta curta". |
| `scripts/_am_top5.mjs` | _am_top5.mjs (5ª rodada) — Coari: descobrir as classes/endpoints do portal (Adianti) por tentativa dirigida. |
| `scripts/_am_ultimos.mjs` | _am_ultimos.mjs — os que sobraram fora dos três blocos: Manicoré, Autazes, Ipixuna, Tabatinga, Borba. |
| `scripts/_am_varre_resto.mjs` | _am_varre_resto.mjs — varre os municípios do AM que ainda não têm folha: acha a URL (o Radar não tem para todos), abre o portal de transparência e responde as três perguntas do dia |
| `scripts/_anauri.mjs` | — |
| `scripts/_anauri2.mjs` | — |
| `scripts/_appm_fundo.mjs` | antes de declarar "não publica": a tela vazia em 2026/2025 pode ter dado em ano anterior. ⚠️ mas se tiver, cai na lei do dado antigo — serve para SABER, não necessariamente para co |
| `scripts/_appm_prog.mjs` | — |
| `scripts/_aquidauana.mjs` | — |
| `scripts/_arquivo_ml_catmat/_diag_catmat.mjs` | — |
| `scripts/_arquivo_ml_catmat/export_catmat_train.mjs` | Exporta o corpus rotulado (catmat_catalogo: descrição→PDM/classe) + as chaves distintas de bens de SC, p/ o treino do classificador TF-IDF+SVM (train_classify_catmat.py). Ponte por |
| `scripts/_aspec_remapeia_municipio.mjs` | _aspec_remapeia_municipio.mjs — o município do ente ASPEC vem do NOME DA ENTIDADE, não do prefixo da rota. 🚨 No Amapá a rota NÃO é IBGE+entidade: `160010506` prefixa 1600105 (muni |
| `scripts/_atafull.mjs` | — |
| `scripts/_ba_consolida.mjs` | Consolidado da folha da BAHIA — uma linha por fonte, contando SALÁRIO de verdade. |
| `scripts/_ba_contamina.mjs` | Mede a contaminação da fila `erp_portal_municipal`: URL cujo domínio declara uma UF diferente da UF do cod_ibge. Causa: o slug vem do NOME do município, e nomes se repetem entre es |
| `scripts/_ba_duplicata.mjs` | Detecta ENTIDADE-ESPELHO por homônimo: o mesmo portal ({slug}.dominio) coletado sob dois cod_ibge diferentes porque o slug vem do NOME do município e nomes se repetem entre estados |
| `scripts/_ba_levanta.mjs` | — |
| `scripts/_ba_levanta2.mjs` | — |
| `scripts/_ba_limpa_fantasma.mjs` | Remove registros PROVADOS falsos na Bahia, por chave explícita (nunca wildcard).  1) Sobradinho/BA (2930774) em folha_servidores_ipm: 854 linhas idênticas às de    Sobradinho/RS (4 |
| `scripts/_ba_subcoleta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _ba_subcoleta.mjs — reabre no livro-razão do TCM-BA as PREFEITURAS  |
| `scripts/_betha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _betha.mjs — acesso ao Portal da Transparência Betha (transparencia. |
| `scripts/_betha_aqui.mjs` | — |
| `scripts/_betha_catalogo_vivo.mjs` | O diretório nacional Betha ao VIVO: Aquidauana entrou depois da última carga do catálogo? |
| `scripts/_blast_dbc.mjs` | _blast_dbc.mjs — DESCOMPRESSOR DBC (DATASUS). Um .dbc é um .dbf cujos REGISTROS estão comprimidos por PKWARE DCL "implode"; o cabeçalho DBF fica intacto. Descompressão = algoritmo  |
| `scripts/_blocos.mjs` | — |
| `scripts/_bsit_probe_xls.mjs` | Sonda: nos municípios cujo CSV vem SEM valor (Caturaí, Palminópolis, Orizona), o "Gerar XLS" traz o salário? Baixa os dois e compara o cabeçalho + a 1ª linha. Barato, e decide se v |
| `scripts/_cadprev.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _cadprev.mjs — infraestrutura compartilhada dos ETLs do CADPREV/SPRE |
| `scripts/_camp.mjs` | — |
| `scripts/_camp2.mjs` | — |
| `scripts/_camp3.mjs` | — |
| `scripts/_camp4.mjs` | — |
| `scripts/_cand_ms.mjs` | — |
| `scripts/_cap_chk.mjs` | — |
| `scripts/_ce.mjs` | — |
| `scripts/_ce2.mjs` | — |
| `scripts/_ce3.mjs` | — |
| `scripts/_ce4.mjs` | — |
| `scripts/_ce5.mjs` | — |
| `scripts/_ce6.mjs` | — |
| `scripts/_ce7.mjs` | — |
| `scripts/_ce_acessoinfo.mjs` | O padrão `{municipio}.ce.gov.br/acessoainformacao.php` se repete no CE — é um produto único? E tem FOLHA (não só contracheque com login)? |
| `scripts/_ce_cobertura.mjs` | Quantos dos faltantes do CE têm o padrão {municipio}.ce.gov.br/recursoshumanos.php ? |
| `scripts/_ce_debug.mjs` | — |
| `scripts/_ce_debug2.mjs` | — |
| `scripts/_ce_debug3.mjs` | — |
| `scripts/_ce_folha.mjs` | — |
| `scripts/_ce_layout.mjs` | Por que o coletor Layout devolve "vazio" nos 10 municípios do CE? Ler o livro-razão e o diretório. |
| `scripts/_ce_mais.mjs` | Sugestão 2: o botão "Mais" do folhadepagamento.php do CE leva ao grão NOMINAL? |
| `scripts/_ce_marca_semvalor.mjs` | 26 municípios do CE publicam o QUADRO DE PESSOAL sem remuneração — a tabela deles não tem as colunas Proventos/Descontos/Líquido. Não é defeito do coletor: é o que a fonte oferece. |
| `scripts/_ce_pag.mjs` | — |
| `scripts/_ce_semvalor.mjs` | — |
| `scripts/_ce_semvalor2.mjs` | — |
| `scripts/_censo_celulas.mjs` | — |
| `scripts/_cg_csv.mjs` | — |
| `scripts/_chk_capitais.mjs` | — |
| `scripts/_chk_chapadao.mjs` | — |
| `scripts/_chk_cmg.mjs` | — |
| `scripts/_chk_cmg2.mjs` | — |
| `scripts/_chk_equi.mjs` | — |
| `scripts/_chk_fila_scpi.mjs` | — |
| `scripts/_chk_folha.mjs` | — |
| `scripts/_chk_geosiap_dup.mjs` | — |
| `scripts/_chk_geosiap_infla.mjs` | — |
| `scripts/_chk_govbr.mjs` | — |
| `scripts/_chk_govbr2.mjs` | — |
| `scripts/_chk_gp.mjs` | — |
| `scripts/_chk_gp2.mjs` | — |
| `scripts/_chk_gpi.mjs` | — |
| `scripts/_chk_iguatemi.mjs` | — |
| `scripts/_chk_memory.mjs` | — |
| `scripts/_chk_memory2.mjs` | — |
| `scripts/_chk_menores.mjs` | — |
| `scripts/_chk_pe.mjs` | — |
| `scripts/_chk_produto.mjs` | — |
| `scripts/_chk_ptp.mjs` | — |
| `scripts/_chk_publicsoft.mjs` | — |
| `scripts/_chk_raposos.mjs` | — |
| `scripts/_chk_rio.mjs` | — |
| `scripts/_chk_scpi.mjs` | — |
| `scripts/_chk_scpi2.mjs` | — |
| `scripts/_chk_sidro.mjs` | — |
| `scripts/_chk_sp.mjs` | — |
| `scripts/_chk_tc.mjs` | — |
| `scripts/_chk_tc2.mjs` | — |
| `scripts/_chk_tc3.mjs` | — |
| `scripts/_chk_tc4.mjs` | — |
| `scripts/_chk_tc5.mjs` | — |
| `scripts/_chk_teno.mjs` | — |
| `scripts/_chk_ultimos.mjs` | — |
| `scripts/_chk_um.mjs` | — |
| `scripts/_chk_um2.mjs` | — |
| `scripts/_chk_whitelabel.mjs` | — |
| `scripts/_cmpm_confere.mjs` | Confere as conversões câmara→prefeitura: o SLUG do host derivado tem de bater com o NOME do município. 🚨 "Sítio Novo do Tocantins → buritidotocantins.to.gov.br" passou na confirma |
| `scripts/_cobertura_folha_nacional.mjs` | _cobertura_folha_nacional.mjs — onde a folha está mais atrasada, por UF. 🚨 Conta município com FOLHA DE VERDADE: pelo menos uma linha COM REMUNERAÇÃO. Nome sem valor é cadastro e |
| `scripts/_colheita_varredura.mjs` | _colheita_varredura.mjs — o que a varredura por site revelou e ainda NÃO está coletado: a fila de colheita. |
| `scripts/_cols_epm.mjs` | — |
| `scripts/_compras_gov.mjs` | — |
| `scripts/_confere_ibge.mjs` | 🚨 Conferir TODOS os códigos IBGE que digitei à mão nesta campanha (Pedro Gomes já saiu errado). |
| `scripts/_consulente.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _consulente.mjs — identidade do SOLICITANTE para portais que exigem  |
| `scripts/_conv_acha_megasoft.mjs` | Para as prefeituras recuperadas de câmara cuja ASSINATURA disse "megasoft" mas sem host: procura o LINK real do megasoft no site do próprio município (2 saltos). Derivar `{slug}.me |
| `scripts/_coord.mjs` | — |
| `scripts/_corrige_chapadao.mjs` | 🚨 `pmchapadao.rcmsuporte.com.br/transparencia/` serve a CÂMARA (34 pessoas), não a prefeitura (RAIS 1.670). Contar isso como "município coberto" é pior que não ter nada: esconde o |
| `scripts/_corrige_cod_ibge6_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _corrige_cod_ibge6_folha.mjs — folha gravada com IBGE de 6 DÍGITOS n |
| `scripts/_corrige_ibge_ms.mjs` | 🚨 Dois códigos IBGE digitados errado nesta campanha:   5007554 = SANTA RITA DO PARDO, mas recebeu a folha de SELVÍRIA (contaminação entre municípios)   5006523 = código INEXISTENT |
| `scripts/_cr2_catalogo_amplo.mjs` | O catálogo Bubble do CR2 tem só 59 entidades (PA/AP)? Ou eu parei cedo / filtrei host demais? |
| `scripts/_cr2_mapeia_por_foff.mjs` | _cr2_mapeia_por_foff.mjs — as 15.525 linhas órfãs do `folha_servidores_cr2` casam pelo `foff_id`. ⭐ O `foff_id` É a rota do GovernoTransparente/ASPEC — a mesma que o catálogo do CR |
| `scripts/_cr2_pi.mjs` | — |
| `scripts/_cr2_rnr_catalogo.mjs` | _cr2_rnr_catalogo.mjs — a Data API pública do portal CR2 (Bubble) publica o tipo `relacao_nominal_remuneracao`, e cada registro traz o link DIRETO da folha nominal daquele ente na  |
| `scripts/_cr2_santarita.mjs` | — |
| `scripts/_cr2_sr.mjs` | — |
| `scripts/_dbg_aam_arq.mjs` | _dbg_aam_arq.mjs — procura na árvore da AAM um arquivo cujo NOME casa com PAT e mostra o texto extraído. |
| `scripts/_dbg_aam_arvore.mjs` | _dbg_aam_arvore.mjs — lista TODOS os temas da árvore de um município da AAM e quantos arquivos cada um tem. |
| `scripts/_dbg_aam_pdf.mjs` | _dbg_aam_pdf.mjs — baixa UM arquivo de um município da AAM e mostra o texto cru, para ver o que é o documento. |
| `scripts/_dbg_admpub_pi.mjs` | — |
| `scripts/_dbg_comp00.mjs` | _dbg_comp00.mjs — a competência "00" empilha o ano inteiro? Conta pessoas distintas contra linhas. |
| `scripts/_dbg_ehresumo_real.mjs` | _dbg_ehresumo_real.mjs — roda a guarda de resumo contra o TEXTO REAL do PDF, não contra exemplo sintético. |
| `scripts/_dbg_gp.mjs` | — |
| `scripts/_dbg_limpa_pares.mjs` | — |
| `scripts/_dbg_nome_sujo.mjs` | — |
| `scripts/_dbg_nomes_falsos.mjs` | _dbg_nomes_falsos.mjs — procura RUBRICA lida como PESSOA: nome que é verbete de folha, não gente. |
| `scripts/_dbg_nomes_falsos2.mjs` | — |
| `scripts/_dbg_pag.mjs` | — |
| `scripts/_dbg_pi_caminhos.mjs` | — |
| `scripts/_dbg_pi_ficha.mjs` | — |
| `scripts/_dbg_pi_menu.mjs` | — |
| `scripts/_dbg_pi_pasta.mjs` | — |
| `scripts/_dbg_pi_scpi.mjs` | — |
| `scripts/_dbg_pi_v2.mjs` | — |
| `scripts/_dbg_scpi_csv.mjs` | _dbg_scpi_csv.mjs — o SCPI exporta a grade inteira em CSV: um POST em vez de paginar 341 páginas. |
| `scripts/_dbg_scpi_post.mjs` | _dbg_scpi_post.mjs — o postback do SCPI 9.0 por HTTP puro, sem navegador. |
| `scripts/_dbg_scpiweb_texto.mjs` | — |
| `scripts/_dbg_workcenter.mjs` | _dbg_workcenter.mjs — a rota da API por tras do portal administracaopublica.com.br (Next.js). Sem regex com escapes: o HTML e fatiado por indexOf, que nao sofre com camada de shell |
| `scripts/_dbg_workcenter2.mjs` | — |
| `scripts/_dbg_workcenter3.mjs` | — |
| `scripts/_dbg_workcenter4.mjs` | _dbg_workcenter4.mjs — navegador SÓ para descobrir o contrato da API (o coletor depois vai de HTTP puro, como manda a casa). Observa as chamadas de rede que o SPA faz e imprime a r |
| `scripts/_dbg_workcenter5.mjs` | — |
| `scripts/_derivadas_compras.mjs` | FONTE ÚNICA da SQL das derivadas de compras (Lei 1, andar 2). Um lugar só — os builders full e a re-derivação por fatia (rederiva_fatia.mjs) chamam daqui, para nunca divergirem.  C |
| `scripts/_diag_direta.mjs` | — |
| `scripts/_diag_disp.mjs` | — |
| `scripts/_diag_disp2.mjs` | — |
| `scripts/_diag_disp3.mjs` | — |
| `scripts/_diag_enriq.mjs` | — |
| `scripts/_diag_enriq2.mjs` | — |
| `scripts/_diag_erp.mjs` | — |
| `scripts/_diag_marca.mjs` | — |
| `scripts/_diag_outro.mjs` | — |
| `scripts/_diag_sidro.mjs` | Por que o SCPI trava em Sidrolândia? Reproduzir o fluxo passo a passo. |
| `scripts/_diag_tipos.mjs` | — |
| `scripts/_diag_valor_api.mjs` | — |
| `scripts/_disputa.mjs` | — |
| `scripts/_docs_por_portal.mjs` | — |
| `scripts/_docs_portal_modalidade.mjs` | — |
| `scripts/_dois_restantes.mjs` | Duartina: o SCPI em :8079/transparencia tem seletor de ENTIDADE? Quais entidades? Nova Aurora: o host responde 2 KB (SPA) — precisa navegador. |
| `scripts/_equiplano_acha_prefeitura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _equiplano_acha_prefeitura.mjs — os 9 municípios do PR marcados em f |
| `scripts/_erp_assinaturas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _erp_assinaturas.mjs — o dicionário de ASSINATURAS de ERP e a leitur |
| `scripts/_erp_receitas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _erp_receitas.mjs — as RECEITAS de descoberta de portal por ERP.  PO |
| `scripts/_es_descobre.mjs` | _es_descobre.mjs — descobre o portal/ERP dos municípios do ES ainda sem folha (2 saltos: home → transparência). |
| `scripts/_es_descobre2.mjs` | _es_descobre2.mjs — diagnóstico profundo dos municípios do ES sem folha: PORTAL DA PREFEITURA → transparência → tem item de pessoal? → que produto é? (as três perguntas de [[pnigp- |
| `scripts/_es_diag.mjs` | _es_diag.mjs — retrato do Espírito Santo (UF 32) antes de coletar: o que já temos, que ERP cada município usa. |
| `scripts/_es_el_probe.mjs` | _es_el_probe.mjs — o CSV do Ágape (Marataízes) tem salário? E as UGs do TransparenciaWeb nas 5 cidades. |
| `scripts/_es_estado.mjs` | _es_estado.mjs — retrato do ES: quem tem folha, com que qualidade, e quem falta (com o denominador da RAIS). |
| `scripts/_es_registra_diagnostico.mjs` | _es_registra_diagnostico.mjs — grava no banco o motivo de cada município do ES que NÃO fecha, para que a próxima sessão (e o pedido por LAI) partam do diagnóstico e não da estaca z |
| `scripts/_esquema_rais.mjs` | — |
| `scripts/_estado_sc.mjs` | — |
| `scripts/_estuda3.mjs` | — |
| `scripts/_estuda_agili2.mjs` | — |
| `scripts/_estuda_agili3.mjs` | — |
| `scripts/_estuda_agili4.mjs` | — |
| `scripts/_estuda_agili_ddns.mjs` | A folha dos municípios "Agili/OCM Blue" de MS mora noutro host: portaltransparencia{mun}.ddns.com.br/Cidadao/… Que produto é? E o padrão de host se repete nos outros 3? |
| `scripts/_estuda_cg.mjs` | Campo Grande/MS — 28.046 servidores, o maior alvo isolado de MT+MS. Portal próprio (SIG). Perguntas na ordem: o menu tem pessoal? a tela tem linhas? como o dado chega (HTML ou API) |
| `scripts/_estuda_cg2.mjs` | Campo Grande — submeter a consulta de remuneração (Laravel POST + _token) e ver o retorno. O form tem um input hidden `download`: se ele gerar CSV/XLS, é a via de dump completo. |
| `scripts/_estuda_cg3.mjs` | Campo Grande — 1) qual competência tem dados? 2) o hidden `download` gera o dump? 3) onde está o VALOR? |
| `scripts/_estuda_cg4.mjs` | Campo Grande — o hidden `download` gera dump? E quantas páginas tem a lista? (evitar ficha a ficha: a lição de Porto Alegre é que o relatório único substitui 258 h de requisições — |
| `scripts/_estuda_cg5.mjs` | Campo Grande — o CSV da lista não traz VALOR. Onde está a remuneração?   (a) no "Detalhar" (ficha a ficha, 28 mil requisições) ou (b) noutra tela com CSV próprio? |
| `scripts/_estuda_novos.mjs` | — |
| `scripts/_estuda_ocmblue.mjs` | Bloco OCM Blue (transparencia-ocmblue.com.br/{slug}) — 3 municípios de MS que o cadastro do TCE rotula AGILI. Perguntas: o menu tem pessoal? a tela tem linhas? como o dado chega? |
| `scripts/_estuda_quality.mjs` | Estudo do portal QUALITY SISTEMAS (bloco de 13 municípios de MS, cadastro oficial do TCE-MS). Perguntas, na ordem de [[pnigp-diagnostico-profundo-menu-dados-produto]]:   1. o menu  |
| `scripts/_estuda_quality2.mjs` | Quality — a tela FOLHA DE PAGAMENTO (a que tem o valor pago por servidor) e o payload das APIs internas. |
| `scripts/_estuda_quality3.mjs` | Quality — clicar num departamento da folha e capturar a API que lista os SERVIDORES com valor. |
| `scripts/_estuda_quality4.mjs` | Como o portal Quality carrega a lista de servidores de um departamento? Ler o HANDLER, não adivinhar a rota. |
| `scripts/_estuda_quality5.mjs` | As funções JS do portal Quality que buscam a folha — ler o CORPO delas revela a rota exata. |
| `scripts/_estuda_quality6.mjs` | Baixar os JS da página da folha e extrair TODAS as rotas ajax (url: "...") — a dos servidores está lá. |
| `scripts/_estuda_quality7.mjs` | — |
| `scripts/_estuda_quality8.mjs` | — |
| `scripts/_estuda_quality9.mjs` | — |
| `scripts/_eticons.mjs` | 🚨 No Eticons (PB), o item rotulado "Folha de Pagamento" é EMPENHO de despesa com pessoal    (elemento 319011, favorecido = o próprio órgão) — não folha nominal.    Confirmar em ou |
| `scripts/_farol.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _farol.mjs — infraestrutura compartilhada do Farol TCE-SC "Pessoal O |
| `scripts/_fila_uf_errada_limpa.mjs` | Limpa a fila `erp_portal_municipal` onde a URL declara uma UF diferente da UF do cod_ibge. Um município do CE não tem portal em `transparencia.cascavel.pr.gov.br` — o slug veio do  |
| `scripts/_final.mjs` | — |
| `scripts/_fio_prog.mjs` | — |
| `scripts/_fix_pedrogomes.mjs` | 🚨 Eu gravei o portal de Pedro Gomes sob o cod_ibge de PONTA PORÃ (5006606). Corrigir a contaminação: remover a linha errada e gravar no código certo. |
| `scripts/_fix_saogabriel.mjs` | — |
| `scripts/_fix_sidrolandia.mjs` | — |
| `scripts/_folha_contrato.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _folha_contrato.mjs — o CONTRATO de colunas da folha, num lugar só. |
| `scripts/_folha_filtros.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _folha_filtros.mjs — os VETOS por coletor da folha, em UM lugar só. |
| `scripts/_folha_guarda_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _folha_guarda_camara.mjs — a guarda que impede o coletor de gravar a |
| `scripts/_folha_pdf_parsers.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _folha_pdf_parsers.mjs — ⭐ A BATERIA DE PARSERS de folha de pagament |
| `scripts/_folha_uniao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _folha_uniao.mjs — a união das tabelas de folha de UMA UF, descobert |
| `scripts/_forn_contrata.mjs` | — |
| `scripts/_ganho_hoje.mjs` | — |
| `scripts/_gap2.mjs` | — |
| `scripts/_gap3.mjs` | — |
| `scripts/_gap4.mjs` | — |
| `scripts/_gap5.mjs` | — |
| `scripts/_gap6.mjs` | — |
| `scripts/_gap_nacional.mjs` | — |
| `scripts/_gov_estado.mjs` | — |
| `scripts/_gp_sonda.mjs` | esqueleto GP: como é a GRADE de resultado (cabeçalho, paginação) depois do #confirma |
| `scripts/_grava_aquidauana.mjs` | — |
| `scripts/_grava_ms_sites.mjs` | Portais achados LENDO O SITE OFICIAL (a técnica que resolveu Aquidauana):  Iguatemi   → IP novo :5656 (o mapeado era a CÂMARA no sistemasbds)  Guia Lopes → mesmo IP, mas em HTTP (o |
| `scripts/_grava_ms_sites2.mjs` | 2ª leva de portais achados LENDO O SITE OFICIAL — os cinco que a varredura de host nunca alcançaria:  Sidrolândia   → sistemas.{dominio}/transparencia/  (host institucional próprio |
| `scripts/_grava_ms_sites3.mjs` | Última leva: os IPs que só o site oficial revela (os mapeados morreram ou nunca existiram)  Aral Moreira → 177.73.104.13:8079  (o drc1.rcmsuporte.com.br não resolve mais)  Pedro Go |
| `scripts/_gx_alvos.mjs` | — |
| `scripts/_hosts_uf.mjs` | Agrupa por HOST os links de pessoal dos municípios sem folha de uma UF (env UF). |
| `scripts/_investiga.mjs` | Investigador individual: abre o portal do município, segue até a tela de pessoal e reporta o que existe. Uso: MUN="Caxias do Sul" UF=RS node scripts/_investiga.mjs   · URLS="a,b,c" |
| `scripts/_ipm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _ipm.mjs — acesso ao portal da transparência do ERP IPM (Atende.net) |
| `scripts/_ipm_espelho_arbitra.mjs` | Arbitra os ESPELHOS de homônimo do IPM: o mesmo {slug}.atende.net coletado sob dois cod_ibge. A PROVA não pode ser o dado (é idêntico nos dois) nem heurística de região — tem de se |
| `scripts/_ipm_espelho_limpa.mjs` | Remove os espelhos de homônimo do IPM PROVADOS falsos por link ao vivo (_ipm_espelho_prova.mjs). Regra: só sai quem NÃO aponta para o portal e cujo par APONTA. Chave explícita, nun |
| `scripts/_ipm_espelho_limpa2.mjs` | Os 3 espelhos que o LINK não decidiu (nenhum dos dois sites apontava para o portal), resolvidos pelo DENOMINADOR: o quadro coletado bate com a RAIS de um lado e é absurdo do outro. |
| `scripts/_ipm_espelho_prova.mjs` | PROVA AO VIVO dos espelhos indecididos: visita o site oficial dos DOIS homônimos e vê qual deles aponta para o {slug}.atende.net em disputa. O link do próprio ente é a prova; a son |
| `scripts/_itapira.mjs` | 🚨 Terceiro sinal de câmara: a UNIDADE. Coxim tem host `pmcoxim…` (parece prefeitura) e cargos comuns,    mas as unidades são GABINETE DO VEREADOR, MESA DIRETORA, SECRETARIA LEGISL |
| `scripts/_juti.mjs` | — |
| `scripts/_lacuna.mjs` | — |
| `scripts/_layout_remapeia_municipio.mjs` | _layout_remapeia_municipio.mjs — as linhas da Layout sem município: casa pelo NOME DECLARADO da entidade. 🚨 17 mil linhas ficaram com uf/cod_ibge nulos porque o regex de `resolveM |
| `scripts/_limpa_auditoria.mjs` | — |
| `scripts/_limpa_betha_null.mjs` | — |
| `scripts/_limpa_betha_sem_nome.mjs` | — |
| `scripts/_limpa_betha_sem_valor.mjs` | _limpa_betha_sem_valor.mjs — tira do banco as fatias do Betha que são CADASTRO, não folha: nome e cargo sem um centavo. Ficavam contadas como "município coletado" e inflavam o plac |
| `scripts/_limpa_equi.mjs` | — |
| `scripts/_limpa_feitas.mjs` | — |
| `scripts/_limpa_geosiap.mjs` | — |
| `scripts/_limpa_teno.mjs` | — |
| `scripts/_ln_cookie.mjs` | — |
| `scripts/_ln_dbg.mjs` | — |
| `scripts/_ln_decode.mjs` | — |
| `scripts/_ln_diag.mjs` | — |
| `scripts/_ln_fetch.mjs` | Corrected Licitanet fetcher: data-page(entity-decoded) → disputeRoom.reports → POST /report → download HTML→texto |
| `scripts/_ln_full.mjs` | — |
| `scripts/_ln_html.mjs` | — |
| `scripts/_ln_links.mjs` | — |
| `scripts/_ln_marca.mjs` | — |
| `scripts/_ln_post.mjs` | — |
| `scripts/_ln_probe.mjs` | — |
| `scripts/_ln_raw.mjs` | — |
| `scripts/_ln_reports.mjs` | — |
| `scripts/_ln_scope.mjs` | — |
| `scripts/_ln_tabs.mjs` | — |
| `scripts/_ln_test.mjs` | — |
| `scripts/_ln_uni.mjs` | — |
| `scripts/_ln_venc.mjs` | — |
| `scripts/_lote_rs.mjs` | Verificação INDIVIDUAL, em série: abre o portal de cada município, segue até a tela de pessoal e reporta o veredito de cada um separadamente (não é amostragem — é um a um, só sem g |
| `scripts/_ma_blocos.mjs` | Os blocos do MA são folha PÚBLICA ou contracheque com LOGIN? (no CE/RN, blocos parecidos eram área restrita) |
| `scripts/_ma_inforfolha.mjs` | 1) O InforFolha aberto tem VALOR mesmo? (o cabeçalho diz "Valor Bruto" mas meu teste procurava "R$") 2) Quantos municípios do MA expõem remuneracao.xhtml (público) vs login.xhtml ( |
| `scripts/_mapa.mjs` | — |
| `scripts/_medir5.mjs` | — |
| `scripts/_memory_recursos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _memory_recursos.mjs — INSTRUMENTA a navegação do coletor Memory par |
| `scripts/_mg.mjs` | — |
| `scripts/_mg_acha_pm_cidadesmg.mjs` | os municípios do cidadesmg marcados como CÂMARA foram coletados em cm{slug}.cidadesmg.com.br. A prefeitura mora em pm{slug} — provado em Novo Cruzeiro (1.277) e Águas Vermelhas (1. |
| `scripts/_mg_alvos.mjs` | — |
| `scripts/_mg_blocos.mjs` | MG — que fornecedores se repetem entre os municípios que ainda não têm folha |
| `scripts/_mg_cinco_campos.mjs` | MG — quantos municípios têm NOME + cargo + salário + secretaria, por fonte (o recorte que o Bento pediu) |
| `scripts/_mg_completos.mjs` | MG — quantos municípios ÚNICOS têm nome+cargo+salário+secretaria (união de todas as fontes) |
| `scripts/_mg_confere.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ confere_folha_cobertura.mjs — PROVA REAL da folha coletada: o que a  |
| `scripts/_mg_faltantes.mjs` | MG — os que FALTAM, classificados pelo motivo (mesma régua do RS: A_coletado / B_erp / C_sem_padrao) |
| `scripts/_mg_folha_levantamento.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════ MG — levantamento das folhas de servidores dos 853 municípios. Método idêntico ao que fe |
| `scripts/_mg_html.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════ MG — gera o HTML standalone do levantamento das folhas municipais (853 municípios). Tudo |
| `scripts/_mg_rais.mjs` | MG — cobertura em SERVIDORES (RAIS: esfera municipal, ativo em 31/12 — mesma régua do conferidor) |
| `scripts/_mods.mjs` | — |
| `scripts/_ms_4.mjs` | — |
| `scripts/_ms_cm_para_prefeitura.mjs` | 🚨 A descoberta mapeou o portal da CÂMARA em vários municípios Fiorilli de MS: o caminho termina em `/transparenciacm/` (CM = Câmara Municipal). O portal da PREFEITURA costuma ser  |
| `scripts/_ms_diag_det.mjs` | — |
| `scripts/_ms_faltantes.mjs` | — |
| `scripts/_ms_fiorilli.mjs` | — |
| `scripts/_ms_le_sites.mjs` | Os 15 faltantes de MS: ler o SITE OFICIAL e mostrar os links de transparência/pessoal SEM filtro de assinatura. Serve para separar "o site não tem link" de "o dicionário não conhec |
| `scripts/_ms_navirai_aqui.mjs` | Naviraí (elotech oxy) e Aquidauana (betha): por que não vieram? Checar os livros-razão e os catálogos. |
| `scripts/_ms_quality_urls.mjs` | — |
| `scripts/_ms_ultimos.mjs` | Os últimos de MS: Anaurilândia (Agili em host agilims), Aral Moreira e Pedro Gomes (sites sem link), Santa Rita do Pardo (CR2), São Gabriel (host recusando). Testar variações antes |
| `scripts/_mt_desvios.mjs` | — |
| `scripts/_mt_diag_det.mjs` | — |
| `scripts/_mtms_classifica.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ MT/MS — reclassifica os FALTANTES pelo PORTAL REAL (portal_real_descober |
| `scripts/_mtms_cols.mjs` | — |
| `scripts/_mtms_diag.mjs` | — |
| `scripts/_mtms_folha_levantamento.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════ MT (141 mun.) e MS (79 mun.) — levantamento da folha de pagamento municipal. Molde do qu |
| `scripts/_mtms_gx.mjs` | — |
| `scripts/_mtms_preal.mjs` | — |
| `scripts/_mtms_prog.mjs` | — |
| `scripts/_mtms_radar.mjs` | Quanto do Radar de MT/MS já foi checado pelo identificador de ERP (prefeituras)? |
| `scripts/_mtms_scpi2.mjs` | — |
| `scripts/_mtms_scpi_chk.mjs` | — |
| `scripts/_mtms_semerp.mjs` | Os faltantes SEM ERP identificado de MT/MS: agrupar por PADRÃO de URL para achar blocos conhecidos (gp.srv.br=GeneXus, IP:porta/transparencia=on-premise SCPI/Megasoft, #/=SPA, etc. |
| `scripts/_mtms_sonda_chk.mjs` | — |
| `scripts/_mtms_sub.mjs` | Os subcoletados (razão<0.5 vs RAIS): quantas competências e entidades o coletor trouxe? |
| `scripts/_mtms_tentativas.mjs` | O que JÁ foi tentado em MT/MS: varre toda tabela folha_*_coleta e cruza com municipios_br. |
| `scripts/_ne_fornecedores.mjs` | varre os sites municipais SEM ERP identificado e conta quais HOSTS DE TERCEIRO aparecem — é assim que um fornecedor regional desconhecido vira BLOCO (o identificador só acha quem j |
| `scripts/_ng_diag2.mjs` | — |
| `scripts/_ng_diag_folha.mjs` | Para cada município que o coletor do NucleoGov não conseguiu, LÊ A HOME e reporta para onde aponta o item de menu de folha/servidores. Descoberto em Orizona: o portal é NucleoGov,  |
| `scripts/_ng_repro.mjs` | Repro mínimo: replica o setup EXATO do coletor (headless + UA_REAL + initScript) e imprime a resposta crua do /api. Serve para separar "o portal bloqueia o nosso navegador" de "o n |
| `scripts/_normaliza_uf_folha.mjs` | _normaliza_uf_folha.mjs — a coluna `uf` das tabelas de folha tem que ser SIGLA, sempre. 🚨 Em `folha_servidores_scpi` conviviam "São Paulo" (181.447 linhas) e "SP" (35.057): qualqu |
| `scripts/_novos_alvos.mjs` | Megasoft (2), Siplanweb (2) e CR2 (2) já têm coletor. Por que esses municípios não entraram? Vê o livro-razão de cada fonte. ⚠️ Nova Aurora e Agudos apontam para a CÂMARA — não são |
| `scripts/_onde_atacar_folha.mjs` | _onde_atacar_folha.mjs — o buraco cruzado com a PORTA. Coverage sozinha diz onde falta; o que decide a fila é onde falta E já existe coletor para o produto que o município usa ([[p |
| `scripts/_pad_fiorilli.mjs` | — |
| `scripts/_parse_betha.mjs` | — |
| `scripts/_parse_fontes.mjs` | — |
| `scripts/_pb.mjs` | — |
| `scripts/_pb_dados.mjs` | — |
| `scripts/_pb_dados2.mjs` | — |
| `scripts/_pb_lista.mjs` | — |
| `scripts/_pb_nomes.mjs` | — |
| `scripts/_pb_prog.mjs` | — |
| `scripts/_pb_semibge.mjs` | — |
| `scripts/_pb_serv.mjs` | — |
| `scripts/_pb_serv2.mjs` | — |
| `scripts/_pcp_harvest_tmp.mjs` | HARVESTER Portal de Compras Públicas (SC) — colhe o relatório "VENCEDORES DO PROCESSO" (relatorio_gerado), parseia colunar (Modelo | Marca/Fabricante), ancora marca por VALOR (melh |
| `scripts/_pedrogomes.mjs` | — |
| `scripts/_pedrogomes2.mjs` | — |
| `scripts/_pg_api.mjs` | — |
| `scripts/_pg_api2.mjs` | — |
| `scripts/_pi_119.mjs` | — |
| `scripts/_pi_afere.mjs` | — |
| `scripts/_pi_alter.mjs` | — |
| `scripts/_pi_angical.mjs` | — |
| `scripts/_pi_appm.mjs` | — |
| `scripts/_pi_appm2.mjs` | — |
| `scripts/_pi_balanco.mjs` | — |
| `scripts/_pi_bertolinia.mjs` | Bertolínia entrou com 12/2025 — o portal realmente para aí ou foi falha de rede? |
| `scripts/_pi_caminhos.mjs` | Agrupar por CAMINHO (não por host): municípios com domínio próprio usam o mesmo produto e somem no agrupamento por host — foi assim que o CE revelou /recursoshumanos.php em 91 muni |
| `scripts/_pi_cand.mjs` | — |
| `scripts/_pi_comp.mjs` | — |
| `scripts/_pi_comp_fmt.mjs` | — |
| `scripts/_pi_cr2_foff.mjs` | O CR2 atende 20 municípios do PI (censo de hosts), mas NENHUM aparece em `folha_servidores_cr2` — o catálogo Bubble que o coletor usa só devolveu PA/AP. A memória do CR2 diz que o  |
| `scripts/_pi_fecha.mjs` | — |
| `scripts/_pi_final.mjs` | — |
| `scripts/_pi_fp.mjs` | — |
| `scripts/_pi_fp_detalhe.mjs` | — |
| `scripts/_pi_fp_form.mjs` | — |
| `scripts/_pi_fp_semlinhas.mjs` | os 8 marcados "sem linhas": a tela /transparencia/folha-pagamento EXISTE, mas o mês padrão veio vazio. ⚠️ a sonda descartou a URL desses (só guardava quando achava linha) — e "exis |
| `scripts/_pi_gap.mjs` | — |
| `scripts/_pi_get.mjs` | ⚠️ o undici desiste da CONEXÃO em 10s por padrão — e esses hosts do PI demoram mais que isso pra abrir TLS. Sem este dispatcher, `fetch failed / UND_ERR_CONNECT_TIMEOUT` parece "po |
| `scripts/_pi_hosts.mjs` | — |
| `scripts/_pi_jsf.mjs` | — |
| `scripts/_pi_jsf2.mjs` | — |
| `scripts/_pi_jsf3.mjs` | — |
| `scripts/_pi_jsf4.mjs` | — |
| `scripts/_pi_jsf_export.mjs` | PrimeFaces DataExporter: GET para pegar JSESSIONID + ViewState, POST no botão de export. |
| `scripts/_pi_jsf_filtro.mjs` | — |
| `scripts/_pi_jsf_fluxo.mjs` | Fluxo do portal JSF/PrimeFaces "administracaotransparente": filtrar competência e exportar CSV. ⚠️ Os ids são GERADOS (`j_idt116`) e mudam entre versões/municípios — derivo pelo RÓ |
| `scripts/_pi_jsf_tenants.mjs` | — |
| `scripts/_pi_json.mjs` | — |
| `scripts/_pi_layout2.mjs` | O layout Laravel `/{slug}/servidores/` tem rota de dados (json/csv/xlsx) ou só HTML paginado? |
| `scripts/_pi_limpa_angical.mjs` | remove SÓ a competência que o bug de tentativa única gravou (11/2025), no município certo. alvo nomeado, nunca por curinga ([[feedback-nunca-apagar-por-wildcard]]). |
| `scripts/_pi_limpa_comp.mjs` | mantém, por município, SÓ a competência que o ledger fixou. Alvo casado linha a linha com o ledger, nunca por curinga ([[feedback-nunca-apagar-por-wildcard]]). |
| `scripts/_pi_links.mjs` | — |
| `scripts/_pi_lista.mjs` | — |
| `scripts/_pi_menu.mjs` | — |
| `scripts/_pi_menu_prog.mjs` | — |
| `scripts/_pi_pag.mjs` | — |
| `scripts/_pi_pag2.mjs` | — |
| `scripts/_pi_pag3.mjs` | — |
| `scripts/_pi_pagina_probe.mjs` | Como o portal /servidores do PI pagina? Sem isto eu leria 26 de 317. |
| `scripts/_pi_post.mjs` | — |
| `scripts/_pi_prog.mjs` | — |
| `scripts/_pi_rais.mjs` | — |
| `scripts/_pi_rais2.mjs` | — |
| `scripts/_pi_rais3.mjs` | — |
| `scripts/_pi_recomeca.mjs` | troca do formato de competência (06/2026 → 202606) muda o _hash. Apagar e recoletar é o caminho limpo: atualizar só o texto deixaria os hashes velhos e a próxima coleta duplicaria  |
| `scripts/_pi_rede.mjs` | De onde o dx-datagrid do /v2/servidores tira os dados? Se houver JSON, some a paginação por navegador. |
| `scripts/_pi_reset_semportal.mjs` | os "sem_portal" da 1ª passada foram marcados SEM o censo de hosts — apago só essas marcas, para que a 2ª passada os tente de novo com os hosts reais. Alvo nomeado pela situação, nã |
| `scripts/_pi_resto.mjs` | _pi_resto.mjs — dos municípios do PI sem folha nominal, quais já têm veredito conhecido e quais ninguém tocou. |
| `scripts/_pi_servidores.mjs` | — |
| `scripts/_pi_transp_links.mjs` | — |
| `scripts/_pi_uniao.mjs` | — |
| `scripts/_pi_url.mjs` | — |
| `scripts/_pi_v2_detalhe.mjs` | — |
| `scripts/_pi_variante.mjs` | — |
| `scripts/_pi_vis.mjs` | — |
| `scripts/_pi_visita_prog.mjs` | — |
| `scripts/_plataformas.mjs` | — |
| `scripts/_pn_limpa.mjs` | — |
| `scripts/_pn_prog.mjs` | — |
| `scripts/_portalfacil.mjs` | Portal Fácil: {mun}portaltransparencia.portalfacil.com.br/servidores-por-nomes — tem folha nominal? |
| `scripts/_pr_audita_equi.mjs` | AUDITORIA: a varredura de porta aceitou host:porta que responde — mas o host pode servir OUTRO município (wildcard DNS). A prova é a ENTIDADE DECLARADA, não o host. |
| `scripts/_pr_betha_sonda.mjs` | Betha: por que a PREFEITURA de Cornélio Procópio devolve 1 linha? Listar todas as consultas e medir cada uma. |
| `scripts/_pr_camara.mjs` | municípios em que o portal mapeado é o da CÂMARA (folha de 15-25 pessoas): achar o portal da PREFEITURA |
| `scripts/_pr_cloud.mjs` | equiplano.cloud: descobrir, por município, o que o portal publica de PESSOAL (ação visível → página/arquivos) |
| `scripts/_pr_elo2.mjs` | 2ª passada Elotech: os que o slug-do-nome não achou. Testa o host do PRÓPRIO município (transparencia.{slug}.pr.gov.br — o portal Elotech servido em domínio municipal) e o slug do  |
| `scripts/_pr_elo3.mjs` | 3ª passada Elotech: 2 SALTOS — abre o site institucional e lê o link real do portal de transparência. |
| `scripts/_pr_epub_sonda.mjs` | e-Pública: o slug do Radar veio TRUNCADO ("bela", "bom") — testar candidatos derivados do nome |
| `scripts/_pr_equi_sonda.mjs` | por que Candói (e outros 4) fecham 'vazio' se o combo de entidades responde? |
| `scripts/_pr_equicloud.mjs` | equiplano.cloud — abrir o relatório de servidores e capturar a chamada de dados (+ o payload) |
| `scripts/_pr_espelha.mjs` | corrige os slugs do e-Pública truncados no `_` (lidos do site institucional, link completo) |
| `scripts/_pr_ipm_sonda.mjs` | IPM: a tela traz a LISTA de entidades? (hoje o coletor usa só a primeira → Apucarana 1.662 de 5.122) |
| `scripts/_pr_levanta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _pr_levanta.mjs — LEVANTAMENTO da folha nos 399 municípios do PARANÁ |
| `scripts/_pr_probe.mjs` | — |
| `scripts/_pr_registra.mjs` | registra os portais da PREFEITURA achados por domínio derivado (o Radar apontava câmara/consórcio) |
| `scripts/_precos_norm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _precos_norm.mjs — fragmentos SQL de NORMALIZAÇÃO da descrição e CAN |
| `scripts/_probe_apitransp.mjs` | Sonda o padrão `api.transparencia.{slug}.{uf}.gov.br/api/dados/rh/folha_de_pagamento` em todo município de GO/TO ainda sem folha. Mede o bloco antes de escrever coletor. |
| `scripts/_probe_folhamensal.mjs` | Sonda o padrão `transparencia.{slug}.{uf}.gov.br/transparencia/servidor/folhaMensal` (ERP novo, achado em Carrasco Bonito e Buriti do Tocantins) em TODO município de GO/TO ainda se |
| `scripts/_proc_html.mjs` | — |
| `scripts/_prova_marca_bloco.mjs` | — |
| `scripts/_prova_marca_valor.mjs` | — |
| `scripts/_proximo_alvo.mjs` | qual ERP tem mais municípios MAPEADOS no Radar e ainda SEM folha nominal? é o próximo alvo por ROI |
| `scripts/_ps.mjs` | — |
| `scripts/_ps_probe_csv.mjs` | Sonda: o botão CSV do grid DevExpress do PublicSoft baixa a folha INTEIRA? Se sim, substitui a paginação do grid, que trava em 29 linhas em 40 dos 85 municípios ([[pnigp-smarapd-te |
| `scripts/_pvh.mjs` | — |
| `scripts/_pvh2.mjs` | — |
| `scripts/_pvh_api.mjs` | — |
| `scripts/_pvh_api2.mjs` | — |
| `scripts/_pvh_api3.mjs` | — |
| `scripts/_pvh_base.mjs` | — |
| `scripts/_pvh_dbg.mjs` | — |
| `scripts/_pvh_ledger.mjs` | — |
| `scripts/_pvh_limpa.mjs` | apaga as 30 linhas sem valor que a rodada estrangulada por 429 deixou — dado parcial de coleta abortada |
| `scripts/_pvh_pag.mjs` | — |
| `scripts/_pvh_pag2.mjs` | — |
| `scripts/_pvh_prog.mjs` | — |
| `scripts/_pvh_rem.mjs` | — |
| `scripts/_pvh_rem2.mjs` | — |
| `scripts/_pvh_ritmo.mjs` | está avançando ou travou no 429? mede quantas linhas entraram no último minuto |
| `scripts/_pvh_spec.mjs` | — |
| `scripts/_pvh_spec2.mjs` | — |
| `scripts/_q_ba.mjs` | — |
| `scripts/_quality_catalogo.mjs` | — |
| `scripts/_quality_payload.mjs` | — |
| `scripts/_quality_prog.mjs` | — |
| `scripts/_quality_rolefinder.mjs` | — |
| `scripts/_quality_vazios.mjs` | — |
| `scripts/_quality_vazios2.mjs` | — |
| `scripts/_radar_pessoal_mt.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ Radar Pessoal do TCE-MT (Qlik Sense Enterprise, app 08294dc5-0043-4a55-a |
| `scripts/_radar_pessoal_mt2.mjs` | Radar Pessoal TCE-MT — 2ª tentativa: esperar o app conectar, achar o objeto global do Qlik e ler as abas. |
| `scripts/_radar_pessoal_mt3.mjs` | Radar Pessoal TCE-MT — extração de PROVA: campos do modelo + hypercube por Município de Lotação. Receita do Radar ATRICON: window.app.model.enigmaModel → createSessionObject(hyperc |
| `scripts/_radar_pessoal_mt4.mjs` | Radar Pessoal TCE-MT — prova com as MEDIDAS do próprio app:   Total de Agentes Públicos = Count(distinct [CPF Servidor])   Remuneração = sum({<[Tipo Rubrica Fato]={'VANTAGEM'}>} [V |
| `scripts/_rais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _rais.mjs — dicionários e leitura do microdado RAIS (PDET/MTE).  O a |
| `scripts/_rede.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _rede.mjs — dispatcher HTTP único para as varreduras de portal munic |
| `scripts/_redescobre_prefeitura_nac.mjs` | grava o portal da PREFEITURA redescoberto para os municípios marcados em folha_entidade_legislativo, em `portal_real_descoberto` (de onde os coletores leem). Não apaga a entrada an |
| `scripts/_rem3.mjs` | — |
| `scripts/_reset_pca_feitos.mjs` | Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT). |
| `scripts/_resumo_final.mjs` | — |
| `scripts/_rn.mjs` | — |
| `scripts/_rn2.mjs` | — |
| `scripts/_rn_hosts.mjs` | Agrupa por HOST os links de pessoal já lidos — é isso que revela o BLOCO/produto por trás dos municípios. |
| `scripts/_rn_padrao.mjs` | RN pelo método do CE: existe um CMS padrão com a folha? Testa (a) o MESMO produto do CE (recursoshumanos.php), (b) variantes comuns, e (c) lê o site oficial em busca do link de pes |
| `scripts/_rn_topsol.mjs` | — |
| `scripts/_rn_topsol2.mjs` | — |
| `scripts/_rn_topsol3.mjs` | 🚨 SPA: o HTML cru tem 811 bytes e nenhuma palavra do domínio — detectar por MARCA no HTML dá zero. Para SPA a prova é o STATUS + o app existir; os dados vêm por API. |
| `scripts/_rn_topsol4.mjs` | 🚨 "103 de 103 respondem 200" é falso-positivo clássico: o host da SPA responde para QUALQUER subdomínio. A prova real é a API devolver LINHAS ([[pnigp-sonda-soft404-falso-positivo |
| `scripts/_rn_topsol_api.mjs` | A SPA do Top Solutions: qual API alimenta a tela de servidores? (o dado não está no HTML) |
| `scripts/_rn_topsolutions.mjs` | RN — os 15 sites lidos revelaram TRÊS blocos com host derivável. Medir a cobertura de cada um sobre TODOS os faltantes (o mesmo método que mediu o CMS do CE em 91 municípios):   to |
| `scripts/_rn_vazios.mjs` | Os 17 municípios do RN com CMS e SEM dado: o portal existe e não publica, ou a competência está fora do padrão? |
| `scripts/_rn_vazios2.mjs` | — |
| `scripts/_rnr_pi.mjs` | — |
| `scripts/_rnr_pi2.mjs` | — |
| `scripts/_ro_afere.mjs` | — |
| `scripts/_ro_apl_prog.mjs` | — |
| `scripts/_ro_apps.mjs` | — |
| `scripts/_ro_bal.mjs` | — |
| `scripts/_ro_betha.mjs` | — |
| `scripts/_ro_captura.mjs` | — |
| `scripts/_ro_captura2.mjs` | — |
| `scripts/_ro_censo_prog.mjs` | — |
| `scripts/_ro_comps.mjs` | — |
| `scripts/_ro_corrige_mn.mjs` | conserta o cod_ibge errado que EU gravei (1100155 = Ouro Preto do Oeste) nas linhas de Monte Negro. Alvo nomeado pela tabela do coletor de Monte Negro — nenhuma outra tabela é toca |
| `scripts/_ro_coru.mjs` | — |
| `scripts/_ro_coru2.mjs` | — |
| `scripts/_ro_coru3.mjs` | — |
| `scripts/_ro_coru4.mjs` | — |
| `scripts/_ro_coru5.mjs` | — |
| `scripts/_ro_coru_limpa.mjs` | as 12 linhas de Corumbiara são RESCISÕES, não folha — sair da base para não contar o município como coberto |
| `scripts/_ro_diag.mjs` | — |
| `scripts/_ro_direto.mjs` | — |
| `scripts/_ro_elo.mjs` | o coletor Elotech chama {host}/portaltransparencia-api/api/... — testo nos hosts de RO que deram "vazio" |
| `scripts/_ro_elo2.mjs` | — |
| `scripts/_ro_faltam.mjs` | — |
| `scripts/_ro_garimpo2.mjs` | — |
| `scripts/_ro_garimpo_prog.mjs` | — |
| `scripts/_ro_http_full.mjs` | — |
| `scripts/_ro_ibge.mjs` | — |
| `scripts/_ro_jip.mjs` | — |
| `scripts/_ro_jip2.mjs` | — |
| `scripts/_ro_links.mjs` | — |
| `scripts/_ro_lista.mjs` | — |
| `scripts/_ro_mirante.mjs` | — |
| `scripts/_ro_mirante2.mjs` | os códigos de `tipo_referencia` são sequenciais por competência: varrer para trás revela os meses anteriores |
| `scripts/_ro_mn.mjs` | — |
| `scripts/_ro_mn2.mjs` | — |
| `scripts/_ro_mn3.mjs` | — |
| `scripts/_ro_mn4.mjs` | — |
| `scripts/_ro_mn5.mjs` | — |
| `scripts/_ro_mn6.mjs` | — |
| `scripts/_ro_navegador.mjs` | decisivo: o que um CIDADÃO vê nessa tela? Se o navegador mostrar dado, meu fluxo HTTP é que está errado; se mostrar o mesmo "Erro ao conectar", o portal é que está quebrado — e iss |
| `scripts/_ro_navegador2.mjs` | O formulário de pessoal deste portal é uma CADEIA de AJAX: entidade → ano → mês → tipo. ⚠️ Preencher tudo de uma vez pega o combo ainda com "Carregando Referência" e a consulta sai |
| `scripts/_ro_novo1.mjs` | — |
| `scripts/_ro_novo2.mjs` | — |
| `scripts/_ro_novo3.mjs` | — |
| `scripts/_ro_novo4.mjs` | — |
| `scripts/_ro_novo5.mjs` | — |
| `scripts/_ro_novo6.mjs` | — |
| `scripts/_ro_novo7.mjs` | — |
| `scripts/_ro_novo8.mjs` | — |
| `scripts/_ro_oxy.mjs` | — |
| `scripts/_ro_pessoal.mjs` | — |
| `scripts/_ro_pessoal2.mjs` | — |
| `scripts/_ro_pessoal3.mjs` | — |
| `scripts/_ro_pessoal4.mjs` | — |
| `scripts/_ro_pessoal5.mjs` | hipótese: o POST em sessaoprincipal.php GRAVA o filtro na sessão e o GET de frmpessoal é que RENDERIZA. |
| `scripts/_ro_pessoal6.mjs` | — |
| `scripts/_ro_pessoal7.mjs` | "Erro ao conectar" em Cerejeiras: é do município ou do produto? Testo vários hosts do mesmo produto. |
| `scripts/_ro_processing.mjs` | — |
| `scripts/_ro_prod.mjs` | — |
| `scripts/_ro_prod2.mjs` | — |
| `scripts/_ro_radar.mjs` | — |
| `scripts/_ro_semcombo.mjs` | — |
| `scripts/_ro_sites_prog.mjs` | — |
| `scripts/_ro_tce.mjs` | — |
| `scripts/_ro_tce2.mjs` | — |
| `scripts/_ro_tce3.mjs` | — |
| `scripts/_ro_tce_sonda.mjs` | TCE-RO foi testado com UMA url na varredura dos 33 TCs — insuficiente para dizer se publica folha. Sondagem a sério: dados abertos, API, portal de transparência, e o SIGAP/e-Contas |
| `scripts/_ro_tce_veredito.mjs` | corrige o veredito do TCE-RO: a varredura dos 33 TCs testou 1 URL e marcou "cita_municipio". Sondagem de 25 URLs (ago/2026) mostra que o portal de transparência do TCE-RO é sobre o |
| `scripts/_ro_tipo.mjs` | — |
| `scripts/_ro_transp.mjs` | — |
| `scripts/_ro_ziggy.mjs` | — |
| `scripts/_rota_instar.mjs` | — |
| `scripts/_rota_porta.mjs` | — |
| `scripts/_rr_links.mjs` | — |
| `scripts/_rr_portais.mjs` | — |
| `scripts/_rr_prog.mjs` | — |
| `scripts/_rr_resto.mjs` | Os 8 municípios de RR sem scpiweb: que host aparece no site oficial? |
| `scripts/_rr_scpiweb.mjs` | RR: Caroebe usa {slug}.scpiweb.com.br:8078/Transparencia/ — SCPI puro. O padrão se repete? |
| `scripts/_scpi_novos.mjs` | — |
| `scripts/_siap_descobre.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _siap_descobre.mjs — versão POR UF da varredura de hosts do SIAP e-G |
| `scripts/_sidrolandia.mjs` | — |
| `scripts/_sonda_agili.mjs` | Sonda do bloco Agili (31 municípios de MT): o portal publica PESSOAL? por onde? |
| `scripts/_sonda_betha_filtro.mjs` | — |
| `scripts/_sonda_betha_menu.mjs` | sonda: que consultas EXISTEM no menu dos portais Betha marcados "sem consulta de remuneração"? |
| `scripts/_sonda_betha_menu2.mjs` | classifica os portais Betha 'sem_consulta': menu VAZIO (defeito nosso/portal morto) x menu SEM pessoal (a fonte não publica folha ali) x rótulo de pessoal que a regex atual não peg |
| `scripts/_sonda_betha_paty.mjs` | — |
| `scripts/_sonda_betha_paty2.mjs` | — |
| `scripts/_sonda_cap3.mjs` | — |
| `scripts/_sonda_capital.mjs` | captura a API por trás da tela de servidores de uma capital |
| `scripts/_sonda_cg.mjs` | Campo Grande/MS (28.046 servidores RAIS) — o maior alvo isolado de MT/MS. Lei das capitais: CKAN primeiro. |
| `scripts/_sonda_cg2.mjs` | "fetch failed" genérico costuma ser CERTIFICADO inválido (lição do Equiplano), não site fora do ar. |
| `scripts/_sonda_cg3.mjs` | — |
| `scripts/_sonda_cg4.mjs` | — |
| `scripts/_sonda_cg5.mjs` | — |
| `scripts/_sonda_cidadesmg.mjs` | — |
| `scripts/_sonda_cidadesmg2.mjs` | — |
| `scripts/_sonda_cmg.mjs` | — |
| `scripts/_sonda_cmg2.mjs` | — |
| `scripts/_sonda_cmg3.mjs` | — |
| `scripts/_sonda_cmg4.mjs` | — |
| `scripts/_sonda_cmg5.mjs` | — |
| `scripts/_sonda_equi.mjs` | — |
| `scripts/_sonda_equi10.mjs` | — |
| `scripts/_sonda_equi11.mjs` | — |
| `scripts/_sonda_equi12.mjs` | — |
| `scripts/_sonda_equi13.mjs` | — |
| `scripts/_sonda_equi14.mjs` | — |
| `scripts/_sonda_equi15.mjs` | — |
| `scripts/_sonda_equi16.mjs` | — |
| `scripts/_sonda_equi2.mjs` | — |
| `scripts/_sonda_equi3.mjs` | — |
| `scripts/_sonda_equi4.mjs` | — |
| `scripts/_sonda_equi5.mjs` | — |
| `scripts/_sonda_equi6.mjs` | captura a requisição REAL que a tela de salários do Equiplano faz (o POST direto no form volta sem lista = AJAX) |
| `scripts/_sonda_equi7.mjs` | — |
| `scripts/_sonda_equi8.mjs` | — |
| `scripts/_sonda_equi9.mjs` | — |
| `scripts/_sonda_esfinge_host.mjs` | — |
| `scripts/_sonda_forta_antigo.mjs` | — |
| `scripts/_sonda_forta_ckan.mjs` | — |
| `scripts/_sonda_fortaleza.mjs` | — |
| `scripts/_sonda_fortaleza2.mjs` | — |
| `scripts/_sonda_fortaleza3.mjs` | — |
| `scripts/_sonda_fortaleza4.mjs` | — |
| `scripts/_sonda_fortaleza5.mjs` | — |
| `scripts/_sonda_fortaleza6.mjs` | — |
| `scripts/_sonda_fortaleza7.mjs` | — |
| `scripts/_sonda_geosiap.mjs` | — |
| `scripts/_sonda_geosiap2.mjs` | — |
| `scripts/_sonda_geosiap3.mjs` | captura o POST REAL que a tela do geosiap faz ao grid (os parâmetros vêm de JS, não do HTML) |
| `scripts/_sonda_geosiap4.mjs` | — |
| `scripts/_sonda_geosiap5.mjs` | — |
| `scripts/_sonda_govbr.mjs` | — |
| `scripts/_sonda_govbr10.mjs` | — |
| `scripts/_sonda_govbr11.mjs` | — |
| `scripts/_sonda_govbr12.mjs` | — |
| `scripts/_sonda_govbr13.mjs` | — |
| `scripts/_sonda_govbr14.mjs` | — |
| `scripts/_sonda_govbr15.mjs` | — |
| `scripts/_sonda_govbr16.mjs` | — |
| `scripts/_sonda_govbr17.mjs` | — |
| `scripts/_sonda_govbr18.mjs` | — |
| `scripts/_sonda_govbr2.mjs` | — |
| `scripts/_sonda_govbr3.mjs` | — |
| `scripts/_sonda_govbr4.mjs` | — |
| `scripts/_sonda_govbr5.mjs` | — |
| `scripts/_sonda_govbr6.mjs` | — |
| `scripts/_sonda_govbr7.mjs` | — |
| `scripts/_sonda_govbr8.mjs` | — |
| `scripts/_sonda_govbr9.mjs` | — |
| `scripts/_sonda_gpi.mjs` | — |
| `scripts/_sonda_gpi2.mjs` | — |
| `scripts/_sonda_gpi3.mjs` | — |
| `scripts/_sonda_gpi4.mjs` | — |
| `scripts/_sonda_gx.mjs` | — |
| `scripts/_sonda_gx2.mjs` | — |
| `scripts/_sonda_gx3.mjs` | — |
| `scripts/_sonda_gx4.mjs` | — |
| `scripts/_sonda_inga.mjs` | — |
| `scripts/_sonda_inga2.mjs` | — |
| `scripts/_sonda_instar.mjs` | — |
| `scripts/_sonda_memory.mjs` | — |
| `scripts/_sonda_ng.mjs` | — |
| `scripts/_sonda_ng2.mjs` | sonda: registra as requisições que a PRÓPRIA página de servidores faz ao /api (lei: copiar a requisição inteira) |
| `scripts/_sonda_ng3.mjs` | — |
| `scripts/_sonda_novos.mjs` | — |
| `scripts/_sonda_pb_ce2.mjs` | Abrir com NAVEGADOR os portais de dados abertos de PB e CE (são SPA: HTTP cru devolve 500-600 bytes) e listar os CONJUNTOS de dados, procurando pessoal/folha dos municípios. |
| `scripts/_sonda_pe.mjs` | — |
| `scripts/_sonda_pe2.mjs` | — |
| `scripts/_sonda_radarpessoal.mjs` | radarpessoal.tce.mt.gov.br — o TCE-MT publica pessoal dos JURISDICIONADOS? que tecnologia? |
| `scripts/_sonda_rio.mjs` | — |
| `scripts/_sonda_rio2.mjs` | — |
| `scripts/_sonda_rio3.mjs` | — |
| `scripts/_sonda_rio4.mjs` | — |
| `scripts/_sonda_rio5.mjs` | — |
| `scripts/_sonda_sagres_ce.mjs` | SAGRES (TCE-PB) e a API do TCE-CE: têm PESSOAL/FOLHA dos municípios? O SAGRES é o sistema de prestação de contas da PB e costuma publicar dados abertos por município. |
| `scripts/_sonda_scpi.mjs` | — |
| `scripts/_sonda_scpi2.mjs` | — |
| `scripts/_sonda_scpi3.mjs` | — |
| `scripts/_sonda_scpi4.mjs` | — |
| `scripts/_sonda_scpi5.mjs` | — |
| `scripts/_sonda_scpi6.mjs` | — |
| `scripts/_sonda_scpi_op.mjs` | — |
| `scripts/_sonda_scpi_op2.mjs` | — |
| `scripts/_sonda_sp.mjs` | — |
| `scripts/_sonda_sp2.mjs` | — |
| `scripts/_sonda_sp3.mjs` | — |
| `scripts/_sonda_sp4.mjs` | — |
| `scripts/_sonda_sp5.mjs` | — |
| `scripts/_sonda_tc_mt_ms.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ TCE-MT e TCE-MS têm FOLHA/PESSOAL dos municípios? Medição, não catálogo. |
| `scripts/_sonda_tc_ne.mjs` | TCE-RN, TCE-PB e TCE-CE publicam PESSOAL/FOLHA dos municípios? Medição, não catálogo. A pergunta vale 100+ municípios de uma vez — foi o que fechou MT ([[pnigp-tcemt-radar-pessoal] |
| `scripts/_sonda_tcems.mjs` | TCE-MS tem pessoal/folha dos JURISDICIONADOS? O portal é Angular (SPA) — HTTP não alcança, precisa navegador. 🚨 armadilha conhecida: "Servidor/DGP" no menu do tribunal é o quadro  |
| `scripts/_sonda_tcems10.mjs` | — |
| `scripts/_sonda_tcems2.mjs` | TCE-MS — "Dados municipais" é o único item que pode conter os JURISDICIONADOS. Seguir e medir. |
| `scripts/_sonda_tcems3.mjs` | TCE-MS — varredura de subdomínios/caminhos em busca de sistema com dado dos JURISDICIONADOS (municípios). A transparência do portal é do próprio tribunal; se houver folha municipal |
| `scripts/_sonda_tcems4.mjs` | Qlik Sense Hub do TCE-MS (painel.tce.ms.gov.br/hub/) — quais APPS existem e algum é de PESSOAL municipal? |
| `scripts/_sonda_tcems5.mjs` | TCE-MS — pegar os app IDs do hub anônimo e inspecionar o e-Sfinge: tem campo de PESSOAL/FOLHA municipal? |
| `scripts/_sonda_tcems6.mjs` | Qlik exige o par xrfkey (query) + header X-Qlik-Xrfkey (16 chars) — sem isso responde 403. |
| `scripts/_sonda_tcems7.mjs` | Hub do TCE-MS: clicar no app e ler a URL resultante (a lista é montada por componente, sem href). |
| `scripts/_sonda_tcems8.mjs` | — |
| `scripts/_sonda_tcems9.mjs` | e-Sfinge do TCE-MS: quais campos o modelo tem? (procurando pessoal/folha/servidor/remuneração) |
| `scripts/_sonda_tcems_esfinge.mjs` | Última via: o e-Sfinge do TCE-MS tem camada PÚBLICA de consulta (como o Farol do TCE-SC), ou é só remessa? E o SICAP (atos de pessoal) tem consulta pública? |
| `scripts/_sonda_tcems_sicap.mjs` | 2ª passada no TCE-MS: os sistemas que a varredura de subdomínios NÃO pegou (vieram do menu do portal). Alvo: SICAP (Controle de ATOS DE PESSOAL — o TC recebe admissões/aposentadori |
| `scripts/_sonda_teno.mjs` | — |
| `scripts/_sonda_teno2.mjs` | — |
| `scripts/_sonda_teno3.mjs` | — |
| `scripts/_sonda_teno4.mjs` | — |
| `scripts/_sonda_teno5.mjs` | — |
| `scripts/_sonda_teno6.mjs` | — |
| `scripts/_sonda_teno7.mjs` | — |
| `scripts/_sonda_teno8.mjs` | — |
| `scripts/_sonda_teno9.mjs` | — |
| `scripts/_sonda_teno_ent.mjs` | descobrir o mapa entidade_id -> município no Tenosoft (o portal é único para ~43 municípios de PE) |
| `scripts/_sonda_teno_ent2.mjs` | — |
| `scripts/_sonda_teno_pag.mjs` | — |
| `scripts/_sp_acessoinfo.mjs` | acessoinformacao.com.br expõe API DOCUMENTADA (OpenAPI) por município:   /transparencia/entidades/{uf}/{slug}/dados-abertos/folha-pagamento?mes_referencia=&ano_referencia=&per_page |
| `scripts/_sp_alvos_dados.mjs` | Os municípios de SP que o diagnóstico CONFIRMOU ter folha na tela: o que ele viu (produto, URL, APIs, menu)? É o insumo para decidir qual coletor serve — e o diagnóstico já capturo |
| `scripts/_sp_analise_faltantes.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_analise_faltantes.mjs — SÓ LEITURA. Análise consolidada dos muni |
| `scripts/_sp_b1_confere.mjs` | A banda B1 diz "é só rodar". Isso é verdade? Cruza os 133 com o veredito do diagnóstico PROFUNDO, que é a evidência mais forte (navegador, tela com linhas). Só leitura. |
| `scripts/_sp_bandas.mjs` | lê _sp_levanta.json e fecha as contas por banda, em municípios E em servidores (RAIS) |
| `scripts/_sp_betha_pos.mjs` | só leitura — efeito do REFAZ do Betha em SP, município a município, contra a RAIS |
| `scripts/_sp_confere.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_confere.mjs — o conferidor da RAIS (confere_folha_cobertura.mjs) |
| `scripts/_sp_confere_gated.mjs` | Conferência pós-view das duas coletas identificadas de SP: como Campinas e Borebi aparecem na `vw_folha_municipal_brasil` depois do veto de benefício do GeneXus. |
| `scripts/_sp_diag_scpi2.mjs` | só leitura — subcoletados do SCPI em SP, escolhidos PELA MEDIÇÃO (não por código digitado à mão) |
| `scripts/_sp_etransp_reaponta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_etransp_reaponta.mjs — SÓ LEITURA (rede). Os municípios de SP di |
| `scripts/_sp_gated_conta.mjs` | Quem está barrado no GATE de identificação (LGPD) dos portais GeneXus — no país e em SP. |
| `scripts/_sp_genexus_corrige.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_genexus_corrige.mjs — a rodada de 16/ago mostrou que `situacao=' |
| `scripts/_sp_genexus_fila.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_genexus_fila.mjs — alimenta `genexus_srvbr_portal` com os portai |
| `scripts/_sp_genexus_probe.mjs` | diagnóstico do fluxo v1 do GeneXus: que opções a tela de pessoal oferece HOJE, nos 4 alvos provados? |
| `scripts/_sp_genexus_probe2.mjs` | reproduz o fluxo v1 passo a passo em Pirassununga, dizendo onde para |
| `scripts/_sp_grava_prefeitura.mjs` | grava o portal da PREFEITURA redescoberto para os municípios marcados em folha_entidade_legislativo, em `portal_real_descoberto` (de onde os coletores leem). Não apaga a entrada an |
| `scripts/_sp_home_probe.mjs` | identifica o produto do bloco `transparencia.{slug}.sp.gov.br/home` e captura as chamadas de rede da tela de pessoal — é a API que um coletor usaria. |
| `scripts/_sp_home_probe2.mjs` | o bloco transparencia.{slug}.sp.gov.br é GeneXus .NET (wptransparenciaportal.aspx). O fluxo v1 do coletor usa /servlet/wppessoalconsulta (variante Java). Aqui testo o equivalente . |
| `scripts/_sp_home_probe3.mjs` | estrutura real do portal transparencia.{slug}.sp.gov.br: frames, links completos e o que responde por "Servidores" |
| `scripts/_sp_home_probe4.mjs` | caminho real: expandir "Recursos Humanos" → clicar o LinkButton "Servidores" → ver a página que abre |
| `scripts/_sp_home_probe5.mjs` | preenche o filtro de Recursos Humanos e chega ao grid — última peça antes de escrever o coletor |
| `scripts/_sp_homonimo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_homonimo.mjs — SÓ LEITURA. Os dois detectores de [[pnigp-fila-er |
| `scripts/_sp_individuais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_individuais.mjs — investiga em LOTE os municípios de SP que sobr |
| `scripts/_sp_ipm_prova.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_ipm_prova.mjs — SÓ LEITURA. A prova de Sobradinho aplicada aos 6 |
| `scripts/_sp_lai_pacote.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_lai_pacote.mjs — gera o insumo do pedido por LAI dos municípios  |
| `scripts/_sp_levanta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_levanta.mjs — LEVANTAMENTO da folha nos 645 municípios de SÃO PA |
| `scripts/_sp_limpa_fantasma.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_limpa_fantasma.mjs — remove de SP as linhas de folha que na verd |
| `scripts/_sp_marca_scpi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_marca_scpi.mjs — municípios de SP cujo portal em domínio PRÓPRIO |
| `scripts/_sp_prog.mjs` | — |
| `scripts/_sp_redescobre_prefeitura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_redescobre_prefeitura.mjs — para os municípios marcados em `folh |
| `scripts/_sp_resta.mjs` | o que AINDA falta em SP entre os que o diagnóstico confirmou ter dados na tela — agrupado por host, para separar bloco (vale coletor) de portal individual (caro por município) |
| `scripts/_sp_scpi_erros.mjs` | só leitura — os 35 SCPI de SP que foram tentados e não trouxeram: qual é o motivo, medido? |
| `scripts/_sp_servidores_browser.mjs` | confirma com NAVEGADOR o que a varredura HTTP achou vivo em transparencia.{mun}.sp.gov.br/servidores |
| `scripts/_sp_siap_descobre.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_siap_descobre.mjs — procura, entre os municípios de SP SEM folha |
| `scripts/_sp_smarapd_diag.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_smarapd_diag.mjs — os 5 SMARAPD de SP que voltaram `vazio` em 15 |
| `scripts/_sp_smarapd_diag2.mjs` | diagnóstico dos 5 SMARAPD `vazio` de SP — títulos REAIS do menu + a chamada EXATA do coletor |
| `scripts/_sp_smarapd_limpa.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_smarapd_limpa.mjs — desfaz a duplicação que a rodada com o match |
| `scripts/_sp_sonda_servidores.mjs` | hipótese do Bento: transparencia.{mun}.sp.gov.br/servidores Testa o padrão nos municípios de SP SEM folha. A prova não é responder 200 ([[pnigp-sonda-soft404-falso-positivo]]): a p |
| `scripts/_sp_sonda_servidores2.mjs` | varredura RÁPIDA do padrão transparencia.{mun}.sp.gov.br/servidores — só descobre QUEM responde. A prova de conteúdo fica para a passada com navegador (esses portais montam por JS) |
| `scripts/_sp_tc_probe.mjs` | transparenciacidadao.com.br: cada idCidade é uma ENTIDADE (prefeitura OU câmara). Antes de coletar, dizer qual é qual — coletar da câmara dá dezenas de pessoas num município de cen |
| `scripts/_sp_verifica_populacao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _sp_verifica_populacao.mjs — SÓ LEITURA. Depois do achado da CÂMARA, |
| `scripts/_ss_diag.mjs` | — |
| `scripts/_storage.mjs` | ABSTRAÇÃO DE ARMAZENAMENTO DE OBJETO (binário) — backend plugável por env `ARQUIVO_STORAGE`. A CHAVE do objeto é a mesma em qualquer backend → migrar de `local` p/ `s3` é só re-apo |
| `scripts/_t1.mjs` | — |
| `scripts/_tc_inventario.mjs` | — |
| `scripts/_tc_investiga10.mjs` | Os 10 tribunais com SINAL de pessoal: o dado é dos MUNICÍPIOS jurisdicionados ou do próprio tribunal? 🚨 A armadilha nº 1 do inventário — só a resposta HTTP diz de quem é o "Servid |
| `scripts/_tc_ma_pi.mjs` | TCE-MA e TCE-PI: publicam folha dos municípios? São os dois piores estados do país (6,0% e 8,5%) e nenhum foi testado sob a ótica de PESSOAL. MA: a memória registra `/saapfolha/ser |
| `scripts/_tceam_probe.mjs` | _tceam_probe.mjs (5ª rodada) — as duas pistas que sobraram: a página de "atos de admissão de pessoal" do e-Contas e o relatório público de envio das prestações de contas mensais. |
| `scripts/_tcece_api.mjs` | TCE-CE: o inventário marca nível A com "spec dentro do bundle Swagger UI". A raiz da API dá 500 — procurar a spec e as rotas, e ver se há PESSOAL dos municípios. |
| `scripts/_tcece_sim.mjs` | — |
| `scripts/_tcema_folha.mjs` | TCE-MA: o saapfolha responde. Até que ano? Traz VALOR? Cobre quantos municípios? |
| `scripts/_tcems_erp.mjs` | e-Sfinge TCE-MS — extrair "Software House por Município": o CADASTRO OFICIAL do ERP dos 79 municípios de MS. Vale mais que qualquer sonda: é o próprio tribunal dizendo quem process |
| `scripts/_tcems_erp2.mjs` | e-Sfinge TCE-MS — extração pelo ENGINE (JSON-RPC no WebSocket), a receita do Farol do TCE-SC. O hub é ANÔNIMO, então o Engine aceita a conexão com os cookies da própria página. Flu |
| `scripts/_tcemt_calibra.mjs` | Calibração do coletor nominal do Radar Pessoal (TCE-MT): a seleção por município funciona? Que dimensões existem de fato (Mês Folha?) e quantas linhas saem de um município pequeno? |
| `scripts/_tcemt_entidades.mjs` | 142 municípios no tcemt, mas só 139 têm órgão EXECUTIVO. Quem são os 3 que só têm câmara/RPPS? Esses contam como "município com folha" sem ter a folha da prefeitura ([[pnigp-radar- |
| `scripts/_tcemt_prog.mjs` | — |
| `scripts/_tcemt_valida.mjs` | — |
| `scripts/_tcepb.mjs` | — |
| `scripts/_tcepi.mjs` | — |
| `scripts/_tcg.mjs` | — |
| `scripts/_tcmba_reabre.mjs` | Reabre no livro-razão as entidades marcadas 'sem_publicacao' para que a passada de JANELA larga as retente. POR QUÊ: 'sem_publicacao' APOSENTA a entidade na fila — foi a resposta c |
| `scripts/_tem_marca_col.mjs` | — |
| `scripts/_testa_blocos.mjs` | — |
| `scripts/_teste_ehresumo2.mjs` | — |
| `scripts/_teste_limpanome.mjs` | _teste_limpanome.mjs — prova das duas guardas novas contra os casos reais que as motivaram. |
| `scripts/_teste_parser_q.mjs` | — |
| `scripts/_tmp_19.mjs` | — |
| `scripts/_tmp_31.mjs` | — |
| `scripts/_tmp_abo.mjs` | — |
| `scripts/_tmp_alp.mjs` | — |
| `scripts/_tmp_alp2.mjs` | — |
| `scripts/_tmp_amb.mjs` | — |
| `scripts/_tmp_amb2.mjs` | — |
| `scripts/_tmp_conf.mjs` | — |
| `scripts/_tmp_cu.mjs` | — |
| `scripts/_tmp_da.mjs` | — |
| `scripts/_tmp_efeito.mjs` | — |
| `scripts/_tmp_exec.mjs` | — |
| `scripts/_tmp_exec2.mjs` | — |
| `scripts/_tmp_ft.mjs` | — |
| `scripts/_tmp_gpe.mjs` | — |
| `scripts/_tmp_gpe2.mjs` | — |
| `scripts/_tmp_gpemold.mjs` | — |
| `scripts/_tmp_ipm.mjs` | — |
| `scripts/_tmp_ipm2.mjs` | — |
| `scripts/_tmp_ipm3.mjs` | — |
| `scripts/_tmp_ipm4.mjs` | — |
| `scripts/_tmp_ipm5.mjs` | — |
| `scripts/_tmp_ipm6.mjs` | — |
| `scripts/_tmp_ipm7.mjs` | — |
| `scripts/_tmp_ipm8.mjs` | — |
| `scripts/_tmp_mem.mjs` | — |
| `scripts/_tmp_mem2.mjs` | — |
| `scripts/_tmp_mem3.mjs` | — |
| `scripts/_tmp_naque.mjs` | — |
| `scripts/_tmp_pdti.mjs` | — |
| `scripts/_tmp_pe.mjs` | — |
| `scripts/_tmp_perda.mjs` | — |
| `scripts/_tmp_pfval.mjs` | — |
| `scripts/_tmp_regra.mjs` | — |
| `scripts/_tmp_sc.mjs` | — |
| `scripts/_tmp_sigafi.mjs` | — |
| `scripts/_tmp_sit.mjs` | — |
| `scripts/_tmp_tpc.mjs` | — |
| `scripts/_tmp_tpc2.mjs` | — |
| `scripts/_tmp_tpc3.mjs` | — |
| `scripts/_tmp_tpc4.mjs` | — |
| `scripts/_tmp_unai.mjs` | — |
| `scripts/_tmp_unai2.mjs` | — |
| `scripts/_tmp_unid.mjs` | — |
| `scripts/_tmp_vw.mjs` | — |
| `scripts/_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _uf.mjs — FONTE ÚNICA DA VERDADE DA UF (chave-mestra da nacionalizaç |
| `scripts/_uf_consolida.mjs` | Ponto de partida da folha numa UF: quanto já existe, por fonte, com salário e secretaria. Uso: UFS=52,17 node scripts/_uf_consolida.mjs   (52=GO, 17=TO) |
| `scripts/_uf_diag.mjs` | _uf_diag.mjs — retrato de uma UF antes de coletar: quem já tem folha, por qual fonte, e o mapa de ERP. Uso: UF_ALVO=AM COD=13 node scripts/_uf_diag.mjs |
| `scripts/_uf_le_sites.mjs` | Faltantes de uma UF qualquer (UF=CE node …): ler o SITE OFICIAL e mostrar os links de transparência/pessoal SEM filtro de assinatura. Serve para separar "o site não tem link" de "o |
| `scripts/_uf_levanta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _pr_levanta.mjs — LEVANTAMENTO da folha nos 399 municípios do PARANÁ |
| `scripts/_unidade.mjs` | — |
| `scripts/_urls_blocos.mjs` | — |
| `scripts/_v2.mjs` | — |
| `scripts/_veredito_ms.mjs` | Veredito final dos 3 municípios de MS que sobraram — gravado no banco para não repetir o trabalho. |
| `scripts/acha_prefeitura_do_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ acha_prefeitura_do_camara.mjs — 10 municípios foram diagnosticados  |
| `scripts/acha_produto_no_site.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ acha_produto_no_site.mjs — o município está sem folha porque o CADA |
| `scripts/alerta_crp.mjs` | ALERTA de CRP — varre o último CRP de cada ente (rpps_crp_sc), classifica por urgência e detecta TRANSIÇÕES desde a última varredura (entrou em vencido / ≤30d / ≤90d, ou regularizo |
| `scripts/analisa_documentacao.mjs` | ANÁLISE DOCUMENTAL do processo licitatório (fase interna, Lei 14.133) — por MODALIDADE. Por peça exigida: DOCUMENTO PRÓPRIO (arquivos_sc.tipo) vs EMBUTIDA (marcador no texto) vs NÃ |
| `scripts/analise_casamento_tr.mjs` | ANÁLISE DO CASAMENTO API × TR em 200 pregões variados — mede a DISTRIBUIÇÃO real do problema de casar item da API com item do documento, para dimensionar o casador (não é o casador |
| `scripts/analise_item_documentos.mjs` | ANÁLISE POR ITEM/LOTE JUNTANDO TODOS OS DOCUMENTOS — monta, para cada item da API, a EVIDÊNCIA que cada documento do processo traz dele (DFD→ETP→TR→Edital…), na ordem da construção |
| `scripts/analise_religar_enriquecimento.mjs` | ANÁLISE PARA A DECISÃO DE RELIGAR O "PNIGP Enriquece Item Documento".   node scripts/analise_religar_enriquecimento.mjs  A tarefa foi desligada em 08/ago por ordem do Heitor, quand |
| `scripts/ancora_item_documento.mjs` | ACHA A LINHA DO ITEM NO DOCUMENTO — ancorando no NÚMERO, não na palavra.  POR QUE: a descrição curta não tem token que ancore. Caso real (Florianópolis 2024/94 item 1): a descrição |
| `scripts/aplica_erp_da_varredura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ aplica_erp_da_varredura.mjs — leva o ERP que a VARREDURA POR SITE de |
| `scripts/aprofunda_tela_sem_linhas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ aprofunda_tela_sem_linhas.mjs — vai UM CLIQUE ADIANTE nos municípios |
| `scripts/arquiva_documento_binario.mjs` | CAMADA DE ARQUIVO DO BINÁRIO — guarda o PDF EM SI (não só o texto), com hash de integridade e índice em arquivo_binario_sc. É a cópia à prova de exclusão do PNCP: quando o PNCP apa |
| `scripts/atualiza_aux_mun_com_folha.mjs` | Materializa "quem já tem folha" — a view com 65 fontes é cara demais para servir de filtro em varredura (a sondagem de MG ficou minutos parada antes da primeira linha). Rodar antes |
| `scripts/audita_camara_volume.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ audita_camara_volume.mjs — pega a folha da PREFEITURA gravada como s |
| `scripts/audita_campos_folha_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ audita_campos_folha_camara.mjs — onde a camada de câmara AINDA está  |
| `scripts/audita_capitais_salario.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ audita_capitais_salario.mjs — para cada capital, verifica se a REMUN |
| `scripts/audita_capitais_salario2.mjs` | 2ª passada da auditoria: as telas marcadas CAMPO_SEM_VALOR costumam ser FORMULÁRIO DE BUSCA — abrir e olhar não basta, é preciso DISPARAR a consulta antes de dizer que a capital nã |
| `scripts/audita_casamento_tce.mjs` | MODELO DE VERIFICAÇÃO DO CASAMENTO TCE ↔ PNCP — auditar ANTES de deixar chegar à tela.  Motivo (Heitor, 04/ago/2026): "verifique as inconsistências e monte um modelo que podemos ve |
| `scripts/audita_entidade_declarada.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ audita_entidade_declarada.mjs — procura CONTAMINAÇÃO em todas as fol |
| `scripts/audita_folha_geral.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ audita_folha_geral.mjs — duas provas baratas que já pegaram contamin |
| `scripts/auditoria/_bridge_test.mjs` | — |
| `scripts/auditoria/_diag3.mjs` | — |
| `scripts/auditoria/_diag4.mjs` | — |
| `scripts/auditoria/_diag5.mjs` | — |
| `scripts/auditoria/_diag6.mjs` | — |
| `scripts/auditoria/_diag7.mjs` | — |
| `scripts/auditoria/_diag8.mjs` | — |
| `scripts/auditoria/_diag9.mjs` | — |
| `scripts/auditoria/_diag_compras_gov.mjs` | — |
| `scripts/auditoria/_probe_api.mjs` | — |
| `scripts/auditoria/_probe_ata.mjs` | — |
| `scripts/auditoria/alice_probe.mjs` | ALICE (compras.gov.br) — login com credencial do .env.local e puxa os avisos de risco (red-flags). Credencial NUNCA no codigo: COMPRASGOV_LOGIN / COMPRASGOV_SENHA no .env.local (pr |
| `scripts/auditoria/ao_homologar.mjs` | AUDITORIA · AO HOMOLOGAR — orquestrador DIRIGIDO POR EVENTO. O PNCP é um LOG ([[pnigp-pncp-e-log-nao-estado]]); quando um item HOMOLOGA (ou DES-HOMOLOGA), esta lógica dispara a cad |
| `scripts/auditoria/coletor.mjs` | AUDITORIA · COLETOR — entra pelo LINK DO PNCP (arquivos_sc.uri = pncp-api/.../arquivos/{n}), que é a entrada UNIVERSAL de todo portal (o PNCP hospeda a cópia; 0 redirect). Para cad |
| `scripts/auditoria/coletor_acervo_portais.mjs` | COLETOR DE ACERVO — marca dos 5 portais de API-viva (PCP/BLL/BNC/Licitar/Licitanet) pelo DOC DE RESULTADO já no ACERVO do PNCP (arquivo_texto_${uf}). ROTA LIMPA: a bolsa 14.133 pub |
| `scripts/auditoria/coletor_bbmnet.mjs` | COLETOR BBMNET (Bolsa Brasileira de Mercadorias) — marca do portal, ancorada por VALOR. State-agnostic (UF por env). ⭐ CRACK (jul/2026, [[pnigp-conferencia-marca-comprasnet]] + [[p |
| `scripts/auditoria/coletor_bll.mjs` | COLETOR BLL/BNC (Lance Eletrônico) — marca do portal de origem. CRACKED headless (jul/2026, [[pnigp-portais-endpoints-publicos]]):   PNCP API → linkSistemaOrigem (bllcompras.com/Pr |
| `scripts/auditoria/coletor_bnc_modalidade.mjs` | MEDIÇÃO BNC POR MODALIDADE — onde vive a marca (portal × modalidade × doc de resultado). Receita: link ProcessView?param1=[gkz] (local link_sistema_origem OU PNCP linkSistemaOrigem |
| `scripts/auditoria/coletor_compras_gov.mjs` | COLETOR Compras.gov (SIASG / dados-abertos) — marca ANCORADA POR VALOR. State-agnostic (UF/EST por env). ⭐ ACHADO (jul/2026, provado ao vivo): o módulo BANCO DE PREÇOS expõe a mar |
| `scripts/auditoria/coletor_compras_gov_comprasnet.mjs` | EXTRATOR Compras.gov / comprasnet (fase-externa) — a MARCA do vencedor por item, TODAS as modalidades. Achado (23/jul, engenharia reversa do bundle Angular): a marca NÃO está nas A |
| `scripts/auditoria/coletor_compras_gov_termo.mjs` | EXTRATOR AUTÔNOMO Compras.gov — marca do vencedor pelo TERMO DE HOMOLOGAÇÃO (acervo PNCP), TODAS as modalidades. Sem humano, sem captcha: o comprasnet publica no PNCP o "Relatório  |
| `scripts/auditoria/coletor_comprasbr_az.mjs` | COLETOR ComprasBR (AZ) — marca do portal AZ Informática. Portal próprio 100% GATED por LOGIN (auth pura, não reCAPTCHA) → NÃO se lê direto. ROTA LIMPA = o doc de resultado que a bo |
| `scripts/auditoria/coletor_estado_de_santa_catarina_e_lic.mjs` | COLETOR "Estado de Santa Catarina (e-lic)" — marca do portal PRÓPRIO do Governo de SC (SEA). CRACK (jul/2026): o e-lic velho (WebForms/__VIEWSTATE) e o compras.sc novo TÊM download |
| `scripts/auditoria/coletor_licita_es_e_bb.mjs` | COLETOR Licitações-E BB (portal nacional do Banco do Brasil, licitacoes-e.com) — marca ancorada por VALOR. ⚠️ O portal BB é GATED: detalhe/ata do vencedor atrás de reCAPTCHA v2 (si |
| `scripts/auditoria/coletor_pcp.mjs` | COLETOR PCP — marca dos PORTAIS DE ORIGEM (Portal de Compras Públicas). CRACKED headless ([[pnigp-portais-endpoints-publicos]]):   PNCP API → linkSistemaOrigem → codigoLicitacao →  |
| `scripts/auditoria/consolida_marca.mjs` | AUDITORIA · CONSOLIDA MARCA — o núcleo, SET-BASED e EXTREMAMENTE LEVE (Heitor: "refaça toda a lógica, leve"). A marca crua já vive em tabelas PEQUENAS, uma por template/via:   · it |
| `scripts/auditoria/cria_view_auditoria.mjs` | AUDITORIA · view do livro-razão — app.item_auditoria_${uf}. UNE as fontes timestampadas para que CADA campo da conciliação tenha proveniência no tempo: "campo ← ação ← fonte ← data |
| `scripts/auditoria/enriquece_marca.mjs` | ENRIQUECE MARCA — orquestrador ÚNICO por ARQUÉTIPO (não por portal). É a ESPINHA do enriquecimento de marca. Estrutura (5 estágios), toda idempotente e dirigida por evento ([[pnigp |
| `scripts/auditoria/estuda_templates.mjs` | AUDITORIA · ESTUDA TEMPLATES — o alicerce (Heitor: "precisávamos ver os templates de todos os documentos de todos os portais"). Cada portal GERA o doc num template próprio; a extra |
| `scripts/auditoria/extrai_marca_proposta.mjs` | EXTRAI MARCA das PROPOSTAS — a marca é vedada no edital (art. 41) mas OBRIGATÓRIA na proposta do fornecedor. TODOS os fornecedores apresentam proposta → marca do VENCEDOR (ancora p |
| `scripts/auditoria/findings.mjs` | AUDITORIA · findings — relatório de discrepâncias (SÓ LEITURA). Não corrige nada; mostra o que o auditor olha. node scripts/auditoria/findings.mjs |
| `scripts/auditoria/ledger.mjs` | AUDITORIA · ledger — linha do tempo de AÇÕES de um processo/item: "campo ← ação ← fonte ← data/hora". Lê a view app.item_auditoria_${uf} (criada por cria_view_auditoria.mjs). SÓ LE |
| `scripts/auditoria/monta_dicionario_marca.mjs` | DICIONÁRIO DE MARCAS (allowlist) — app.marca_dicionario. Uma marca é REAL se aparece em MUITOS órgãos (diversidade) e/ou COM MODELO — o que separa marca de fornecedor/descritor/tru |
| `scripts/auditoria/normaliza_marca.mjs` | NORMALIZADOR de marca/modelo (derivado; não apaga o cru). Sobre app.item_marca_conferida_${uf}:  · marca_norm     = canônica (UPPER, sem acento, sem sufixo de empresa) → dedup caix |
| `scripts/auditoria/parser_ata_bolsa.mjs` | PARSER da ATA DA SESSÃO (bolsa) — a marca da DISPENSA ELETRÔNICA vive AQUI, rotulada "Marca:/Modelo:". Achado (Heitor, 22/jul): o ERP (Betha/IPM) só PUBLICA no PNCP; a disputa elet |
| `scripts/auditoria/parser_termo_homologacao.mjs` | PARSER do TERMO DE HOMOLOGAÇÃO — a marca da DISPENSA vive AQUI (achado do Heitor, 22/jul), não na ata nem na proposta. Doc: "Termo de Homologação / Adjudicação / Processo Administr |
| `scripts/auditoria/pipeline.mjs` | AUDITORIA · pipeline — A CADEIA DA MARCA, dirigida por evento. É o que roda SOZINHO todo dia.  O que estava errado até 04/ago/2026: este arquivo existia mas (a) NENHUM agendador o  |
| `scripts/auditoria/receitas_portais.mjs` | RECEITAS POR PORTAL — busca o TEXTO do doc de resultado (onde vive a marca) em CADA portal cracked. Estrutura: resolveId(portal, docAcervo, proc) → id do processo NO portal (1º do  |
| `scripts/auditoria_dados_sc.mjs` | Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada). Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_ |
| `scripts/backfill_folha_nome_sujo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ backfill_folha_nome_sujo.mjs — conserta NO BANCO o que a guarda nova |
| `scripts/backfill_folha_portaltp_totais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ backfill_folha_portaltp_totais.mjs — recupera bruto/descontos/líquid |
| `scripts/backfill_gerador_sc.mjs` | BACKFILL do arquivo_texto_sc.gerador nos textos ja baixados. Idempotente (so quem esta NULL) e resumivel. O gerador (assinatura NO TEXTO) e o que roteia o parser — a plataforma do  |
| `scripts/backfill_raw_arquivos_sc.mjs` | BACKFILL DO RAW EM arquivos_sc — cópia fiel do PNCP (regra 1). Catalogamos os documentos sem guardar o JSON cru; aqui re-busca /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos e grava o |
| `scripts/backfill_unidade_pncp.mjs` | BACKFILL da entidade `unidadeOrgao` do PNCP nas contratações já ingeridas.  POR QUE: o ingest DESCARTAVA `unidadeOrgao` (que traz o município do processo) e DEDUZIA o cod_ibge de u |
| `scripts/backup_neon.mjs` | Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored). Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump |
| `scripts/baixa_folha.mjs` | — |
| `scripts/baixa_setores_ibge.mjs` | DOWNLOAD DOS AGREGADOS POR SETOR CENSITÁRIO (IBGE Censo 2022) — o passo que faltava.  ═══ POR QUE ISTO EXISTE ═══ Medido em 08/ago: quatro fontes (`setores`, `setores_geo`, `setore |
| `scripts/build_andamento_compras.mjs` | DERIVADA (andar 2, Lei 1) — app.andamento_compras_sc: por município × modalidade × STATUS DO ITEM × valor. O andamento vive no ITEM (situacao: Homologado/Em andamento/Deserto/Fraca |
| `scripts/build_apresentacao_desc_sc.mjs` | APRESENTAÇÃO — Camada 2 (descrição): p/ itens cujo RÓTULO é container sem número (frasco/caixa/pacote — Camada 1 só deu conf 0.5), extrai a QUANTIDADE do CONTEÚDO que está no TEXTO |
| `scripts/build_apresentacao_llm.mjs` | APRESENTAÇÃO — Camada LLM (Haiku): extrai a QUANTIDADE DO CONTEÚDO das descrições-resíduo que a Camada 2 determinística não resolveu (container sem qtd / rótulo desconhecido) MAS q |
| `scripts/build_apresentacao_sc.mjs` | APRESENTAÇÃO — Camada 1 (rótulo): parseia o rótulo `unidade` de cada item-bem em UNIDADE BÁSICA + FATOR de desempacotamento, gravando o dicionário `item_apresentacao_sc` (chave = r |
| `scripts/build_completude_documento.mjs` | ANÁLISE — COMPLETUDE LEGAL DOS DOCUMENTOS (lente do auditor). Para cada ETP/TR/PB, checa no TEXTO extraído se as seções que a Lei 14.133 exige estão presentes → score + o que falta |
| `scripts/build_compras_sc.mjs` | DERIVADA (andar 2, Lei 1) — compras_sc reconstruída DO ESPELHO (contratacoes_sc), sem tocar a API do PNCP. FULL rebuild. A SQL vive em _derivadas_compras.mjs (mesma usada pela re-d |
| `scripts/build_item_homologado_sc.mjs` | CASAMENTO ITEM A ITEM — a base do banco de SUCESSO. Uma linha por item HOMOLOGADO, com tudo ligado. SEM mediana, SEM média, SEM grupo: agregação apaga justamente o que é copiável ( |
| `scripts/build_mislabel_unidade_sc.mjs` | RED-FLAG — provável UNIDADE TROCADA no lançamento. Efeito colateral valioso do Passe 2: ao reduzir à unidade básica, um item cujo preço/unidade básica destoa MUITO (≥20×) da median |
| `scripts/build_precos_basica_sc.mjs` | REFERÊNCIA POR UNIDADE BÁSICA (Passe 2 do mapa de preços) — reagrupa as compras pela CHAVE DE COMPARABILIDADE (CATMAT + unidade básica + forma), reduzindo cada preço à unidade bási |
| `scripts/build_precos_compras.mjs` | BANCO DE PREÇOS de referência de SC (mediana/quartis por item×UNIDADE CANONICALIZADA) + constatações de sobrepreço. A canonicalização de unidades é essencial: o dado bruto tem ~4.8 |
| `scripts/build_processo_fase_sc.mjs` | CONTADOR POR FASE — cada processo em UMA fase (partição limpa dos 241k). Tabela derivada, rebuildável, indexada: o app lê em <200ms. NÃO é view (view pesada não responde count em 1 |
| `scripts/build_red_flags_fornecedores.mjs` | RED FLAGS DE FORNECEDORES — sinais de risco de integridade por (município, fornecedor): CONCENTRAÇÃO (fatia do total contratado), SANCIONADO (CEIS/CNEP vigente) e SOBREPREÇO (itens |
| `scripts/build_sobrepreco_medicamentos.mjs` | Indícios de sobrepreço em MEDICAMENTOS vs o teto legal (CMED/PMVG). Conservador: casa por SUBSTÂNCIA + DOSAGEM, compara o preço/comprimido pago ao MAIOR PMVG/comprimido daquela dos |
| `scripts/build_sobrepreco_nacional.mjs` | RECONSTRÓI o estudo de sobrepreço com DUPLO benchmark: mediana de SC (interno) + referência NACIONAL (Painel de Preços, forma AVULSA — comparável ao unitário municipal) + desvio-pa |
| `scripts/build_tabela_escolas.mjs` | — |
| `scripts/build_variacao_interna.mjs` | VARIAÇÃO INTERNA DE PREÇOS — itens que o MESMO município comprou a preços unitários diferentes (incoerência interna). Economia = padronizar pelo MENOR preço que o próprio município |
| `scripts/caca_folha_no_portal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ caca_folha_no_portal.mjs — dado um portal de transparência, SEGUE os |
| `scripts/cadastra_elotech_hosts.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ cadastra_elotech_hosts.mjs — prova, host a host, quem responde a API Elo |
| `scripts/cadeias.mjs` | AS CADEIAS COMO DADO — quem roda o quê, em que ordem, com que ambiente e com que regra de falha.  Antes daqui isso morava espalhado em seis arquivos .cmd, cada um com a sua convenç |
| `scripts/campos_contratacao_pncp.mjs` | MAPA DECLARATIVO DOS 45 CAMPOS DA CONTRATAÇÃO — origem = destino. TODOS. Nenhum descartado.  POR QUE ASSIM: catar campo a campo às 4h da manhã é como eu erro. Um INSERT com 45 parâ |
| `scripts/campos_item_pncp.mjs` | MAPA DECLARATIVO DOS 36 CAMPOS DO ITEM DO PNCP — origem = destino (a lei do projeto: espelhar, não inventar).  POR QUE ASSIM: um INSERT com 40 parâmetros posicionais é onde eu erra |
| `scripts/carga_fatiada.mjs` | CARGA FATIADA — substitui só a fatia que REALMENTE carregou, em vez de truncar a tabela inteira.  ═══ O DEFEITO QUE ISTO CORRIGE ═══ O desenho comum destas ETLs é: percorrer vários |
| `scripts/casa_catalogo_portalfacil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ casa_catalogo_portalfacil.mjs — resolve NOME DO CADASTRO → municípi |
| `scripts/casa_conjunto.mjs` | CASADOR DE CONJUNTO — roda o casador endurecido contra CADA documento da construção e CONSOLIDA por item:  · melhor acerto (a fonte certa por item — o "union" que o estudo dos 200  |
| `scripts/casa_contrato_tcesc.mjs` | CASAMENTO DE CONTRATOS TCE ↔ PNCP — para o apontamento do CONTRATADO cair no CONTRATO, não no processo.  Correção de modelo (Heitor, 04/ago/2026): as três origens do TCE têm grãos  |
| `scripts/casa_itens.mjs` | CASADOR ENDURECIDO — liga cada item da API à sua linha no documento, por CONTEÚDO + POSIÇÃO, com CONFIANÇA. Conserta o caso ambíguo (serviço/lote, descrições quase iguais) sem queb |
| `scripts/casa_itsolucoes_ibge.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ casa_itsolucoes_ibge.mjs — resolve o município das entidades do port |
| `scripts/casa_por_celula.mjs` | CASAMENTO POR LINHA DE TABELA — a âncora determinística que faltava.  ═══ POR QUE ISTO EXISTE ═══ Medido em 08/ago sobre os mesmos 500 editais, com os três recortes disponíveis:    |
| `scripts/casa_tcesc_objeto_datas.mjs` | CASADOR 3 — objeto + TRÊS DATAS do processo + valor. Substitui o casador só-por-objeto.  Por que (medido 04/ago/2026): casar por texto do objeto dentro de município+ano deixava 7,1 |
| `scripts/casa_tcesc_objeto_valor.mjs` | CASADOR 2 — objeto + valor, para os processos que o casador por NÚMERO DE EDITAL não alcança.  Por que existe (medido 04/ago/2026): dos 55.267 homologados sem par, 38.412 entraram  |
| `scripts/casa_tcesc_pncp.mjs` | CASAMENTO TCE-SC ↔ PNCP — derivada (Lei 1). O TCE indexa por ENTE + NÚMERO DO EDITAL; nós por cnpj+ano+seq. Chave: município normalizado + número do edital + ano. O `numero_edital` |
| `scripts/cataloga_itsolucoes.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ cataloga_itsolucoes.mjs — enumera as entidades do portal `portaltran |
| `scripts/censo_hosts_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ censo_hosts_uf.mjs — QUEM ATENDE A FOLHA DE CADA MUNICÍPIO, pelos hosts  |
| `scripts/censo_pi_hosts.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ censo_pi_hosts.mjs — QUEM ATENDE A FOLHA DE CADA MUNICÍPIO DO PIAUÍ, pel |
| `scripts/checa_anos.mjs` | — |
| `scripts/checa_map.mjs` | — |
| `scripts/classifica_especificacao.mjs` | ESPECIFICAÇÃO × PLANILHA POBRE × CLÁUSULA — o bloco achado no documento é mesmo a especificação do item?  ⚠️ ESTE ARQUIVO EXISTE PORQUE REGEX TEM QUE MORAR EM .mjs. Tentei injetar  |
| `scripts/coleta_diaria_pncp.mjs` | BUSCA DIÁRIA DO PNCP — roda todo dia os coletores do PNCP do ano corrente (compras, contratos, atas), que são idempotentes (upsert). Captura as contratações novas publicadas. Seque |
| `scripts/coleta_filiados_tse.mjs` | — |
| `scripts/coleta_incremental_pncp.mjs` | COLETA INCREMENTAL DO PNCP — pergunta "o que mudou?" em vez de varrer tudo.  ═══ O PROBLEMA (medido 2026-07-15) ═══ A varredura completa custa ~1,1 MILHÃO de GETs (241.302 processo |
| `scripts/confere_folha_cobertura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ confere_folha_cobertura.mjs — PROVA REAL da folha coletada: o que a  |
| `scripts/confere_fontes_rais.mjs` | Revisão por FONTE contra a RAIS, direto nas tabelas cruas (mais rápido que pela view e mostra o coletor). ⭐ O sinal de defeito NÃO é um município abaixo do denominador — é uma FONT |
| `scripts/confere_ledger_vs_tabela.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ confere_ledger_vs_tabela.mjs — acha livros-razão que MENTEM: municí |
| `scripts/confere_marca_comprasnet.mjs` | CONFERÊNCIA marca→item (Compras.gov / comprasnet, texto — sem OCR). Doc correto = Termo com "Marca/Fabricante". Extrai a marca da PROPOSTA ADJUDICADA (vencedor), amarra ao nº do it |
| `scripts/confere_marca_lote.mjs` | CONFERE em lote a marca já colhida pelos parsers de portal (item_marca_sc) contra o itens_sc. Trava: item (numero) + VALOR (unit ≈ unit_homologado). Grava no mesmo item_marca_confe |
| `scripts/confere_subcoleta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ confere_subcoleta.mjs — cruza a folha PUBLICADA com a RAIS e lista q |
| `scripts/consolida_lai_rs.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ consolida_lai_rs.mjs — monta a tabela `folha_lai_pendencia` com o MO |
| `scripts/consome_evento_dado.mjs` | CONSUMIDOR DE DADO — lê a fila `pncp_evento` e preenche SÓ A FATIA que o evento aponta.  ═══ O CONCEITO (validado 2026-07-15) ═══ O PNCP é um LOG (Inclusão/Retificação/Exclusão sob |
| `scripts/constroi_doc_tem_marca.mjs` | CONSTRÓI/ATUALIZA o flag app.doc_tem_marca — marca cada doc com padrão de marca (A=Marca/Fabricante, B=Item…Marca:Modelo:). O extrator lê fatias LEVES daqui em vez de varrer `texto |
| `scripts/constroi_especificacao_item.mjs` | ESPECIFICAÇÃO DO ITEM — a visão ÚNICA por item, reunindo TODAS as tabelas de grão de item.  Heitor, 04/ago/2026: *"a construção da especificação pode fazer com todos os itens, inde |
| `scripts/constroi_fila_divergencia_valor.mjs` | FILA DE AVERIGUAÇÃO — contratos em que o valor do PNCP e o do TCE/SC não fecham.  Pedido do Heitor (04/ago/2026): "coloca os contratos que aparecerem com divergência para averiguaç |
| `scripts/constroi_fila_enriquecimento.mjs` | CONSTRÓI a fila materializada do enriquecimento — 1 VARREDURA (não 12). Os shards depois leem fatias LEVES daqui, em vez de cada um varrer os 344MB de arquivo_texto_sc. É o ajuste  |
| `scripts/constroi_tce_apontamento_processo.mjs` | LIGA O APONTAMENTO DO TCE AO NOSSO PROCESSO — de "13 contratados sem funcionário" para "QUAIS contratos".  Sem isto o quadro é um número que ninguém consegue verificar. Com isto o  |
| `scripts/constroi_tce_apontamentos.mjs` | QUADRO DE APONTAMENTOS DO TCE/SC por município — derivada (Lei 1).  Desenho escolhido pelo Heitor (04/ago/2026), opção B: ESPELHO + INTENSIDADE PRÓPRIA. Mostra o que o TCE marcou,  |
| `scripts/conta_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ conta_folha.mjs — quantos municípios têm folha, por camada. Descobre |
| `scripts/conta_folha_nominal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ conta_folha_nominal.mjs — a contagem nacional pela régua CERTA: muni |
| `scripts/corrige_encoding_tcepb.mjs` | Conserta o mojibake do TCE-PB: o CSV é UTF-8 e foi lido como latin-1 ("CÃ¢mara ... Ãgua Branca"). Reverter = tomar os bytes latin-1 do texto e reinterpretá-los como UTF-8.  🚨 O gu |
| `scripts/corrige_fila_camara_assembleia.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ corrige_fila_camara_assembleia.mjs — tira da fila das câmaras o que  |
| `scripts/corrige_portal_camara_ms.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ corrige_portal_camara_ms.mjs — a descoberta mapeou o portal da CÂMARA (` |
| `scripts/corrige_uf_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ corrige_uf_folha.mjs — a UF por EXTENSO nas tabelas de folha.  🚨 Ci |
| `scripts/cruza_pep_filiados.mjs` | — |
| `scripts/deriva_area_folha_sc.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ deriva_area_folha_sc.mjs — o campo SECRETARIA do pedido, derivado.   |
| `scripts/deriva_folha_canonica.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ deriva_folha_canonica.mjs — a camada CANÔNICA do pessoal municipal:  |
| `scripts/descobre_abase_token.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_abase_token.mjs — extrai o TOKEN do portal Abase a partir d |
| `scripts/descobre_aspec_diretorio.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_aspec_diretorio.mjs — varre o DIRETÓRIO INTEIRO do governot |
| `scripts/descobre_bases_scpi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_bases_scpi.mjs — acha TODAS as bases SCPI de um município,  |
| `scripts/descobre_capitais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_capitais.mjs — levanta o portal de transparência e a ROTA D |
| `scripts/descobre_codigo_memory_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_codigo_memory_camara.mjs — acha o CÓDIGO DO ENTE do Memory |
| `scripts/descobre_elmar_catalogo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_elmar_catalogo.mjs — enumera o CATÁLOGO da ELMAR (PublicSof |
| `scripts/descobre_erp_municipal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_erp_municipal.mjs — qual ERP cada município usa, medido pel |
| `scripts/descobre_fiorilli.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_fiorilli.mjs — acha a URL do portal Fiorilli de cada municí |
| `scripts/descobre_genexus_srvbr.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_genexus_srvbr.mjs — acha a URL base do portal GeneXus e-tra |
| `scripts/descobre_genexus_srvbr_js.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_genexus_srvbr_js.mjs — 2ª passada da descoberta srv.br, ago |
| `scripts/descobre_govbr.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_govbr.mjs — acha os municípios clientes da GovernançaBrasil |
| `scripts/descobre_govbr_js.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_govbr_js.mjs — descoberta com RENDER JS dos clientes Govern |
| `scripts/descobre_govbr_probe.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_govbr_probe.mjs — descoberta dos clientes GovernançaBrasil  |
| `scripts/descobre_host_porta_pelo_site.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_host_porta_pelo_site.mjs — acha o portal de transparência q |
| `scripts/descobre_iframe_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_iframe_folha.mjs — abre a tela de pessoal de cada município |
| `scripts/descobre_ipm_rotina.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_ipm_rotina.mjs — descobre, por município IPM, o CÓDIGO e a  |
| `scripts/descobre_memory_entidade.mjs` | descobre_memory_entidade.mjs — acha o código de entidade Memory/iLAI (ex.: 9840MT) de cada município, do link `ilai.memory.com.br/#/entidades/login/{CODE}/` ou `/{CODE}/1/share` no |
| `scripts/descobre_memory_entidade_derivado.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_memory_entidade_derivado.mjs — acha o CÓDIGO DE ENTIDADE do |
| `scripts/descobre_memory_entidade_js.mjs` | descobre_memory_entidade_js.mjs — 2ª passada (RENDER JS) do código de entidade Memory/iLAI. O HTTP achou só 1/123 (o código está em link JS-injected). Abre cada site + /transparenc |
| `scripts/descobre_portal_pelo_site.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_portal_pelo_site.mjs — abre o SITE OFICIAL de cada municípi |
| `scripts/descobre_portal_real.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_portal_real.mjs — para municípios cujo `erp` do Radar é o f |
| `scripts/descobre_portaltp_es.mjs` | descobre_portaltp_es.mjs — para os municípios do ES ainda NÃO identificados no radar, testa se são Portal TP (API `{slug}-es.portaltp.com.br/api/transparencia.asmx/json_servidores` |
| `scripts/descobre_prefeitura_de_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_prefeitura_de_camara.mjs — quando a descoberta mapeou o por |
| `scripts/descobre_publicsoft_ctx.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_publicsoft_ctx.mjs — acha o `ctx` (identificador da entidad |
| `scripts/descobre_publicsoft_ctx_js.mjs` | descobre_publicsoft_ctx_js.mjs — 2ª passada (RENDER JS) do ctx ELMAR do PublicSoft. Abre o site + /portal-da-transparencia + segue link de quadro-funcional/servidor no navegador, g |
| `scripts/descobre_scpi_prefeitura.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_scpi_prefeitura.mjs — para os municípios em que o SCPI cole |
| `scripts/descobre_scpiweb.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_scpiweb.mjs — varre a família `{slug}.scpiweb.com.br` deriv |
| `scripts/descobre_site_municipal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_site_municipal.mjs — acha o SITE do município quando o Rada |
| `scripts/descobre_smarapd_probe.mjs` | descobre_smarapd_probe.mjs — sonda de host dos clientes SMARAPD: `transparencia-{slug}.smarapd.com.br`. Confirma o portal PAI batendo em /paiportalserver/MenuPortal (200 = cliente) |
| `scripts/descobre_ss_catalogo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_ss_catalogo.mjs — enumera o CATÁLOGO NACIONAL da SS Informá |
| `scripts/descobre_tcmba_entidades.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_tcmba_entidades.mjs — catálogo de MUNICÍPIOS × ENTIDADES do |
| `scripts/descobre_topsolutions.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ descobre_topsolutions.mjs — enumera o produto TOP SOLUTIONS pelo PA |
| `scripts/descompacta.mjs` | DESCOMPACTAÇÃO PORTÁTIL — um caminho que funciona onde as ETLs de fato rodam.  ═══ POR QUE ISTO EXISTE ═══ Medido em 09/ago, depois que o orquestrador parou de descartar o stderr d |
| `scripts/detecta_layout.mjs` | DETECTA O LAYOUT RODANDO OS PARSERS — não por assinatura.  POR QUE: assinatura de texto NÃO prova que o parser lê. Medido 2026-07-15 numa simulação (que evitou a regressão):   · a  |
| `scripts/detecta_portal_real.mjs` | DETECTA o portal REAL da compra (a bolsa onde a disputa rodou) a partir do EDITAL — não do rótulo `plataforma` (que é o ERP/relay). É o roteador: sabendo o portal real × modalidade |
| `scripts/diag_fila_portais.mjs` | DIAGNÓSTICO DA FILA INTEIRA — para cada portal, duas perguntas que levam a caminhos diferentes:   1. quantos processos têm ATA no PNCP?          → vale escrever LEITOR (barato, dad |
| `scripts/diag_portal_ata.mjs` | O PORTAL ENTREGA ATA AO PNCP? — teste barato, a rodar ANTES de escrever qualquer leitor.  Aprendido no e-lic (05/ago/2026): gastei tempo procurando quadro de vencedores num portal  |
| `scripts/diag_portal_docs.mjs` | TODOS os documentos que um portal leva ao PNCP, agrupados por título NORMALIZADO.  Aprendido na BNC (05/ago/2026): contar por título exato ESCONDE a ata. Os documentos de resultado |
| `scripts/diagnostica_faltantes.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ diagnostica_faltantes.mjs — abre o portal de CADA município ainda se |
| `scripts/diagnostico_gestor.mjs` | MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis. Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso). Regras ancoradas e |
| `scripts/dl_epub_js.mjs` | — |
| `scripts/dl_tr.mjs` | — |
| `scripts/enfileira_candidatos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ enfileira_candidatos.mjs — leva o que a descoberta achou (`folha_ho |
| `scripts/enrich_equipamentos_suas_endereco.mjs` | ETL fase 2 — endereço/telefone de cada equipamento do SUAS (CadSUAS, página de detalhe por código). A página de detalhe (aba=endereco_contatos) responde a HTTP simples (≠ da busca, |
| `scripts/enriquece_catalogo_rnr_municipio.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ enriquece_catalogo_rnr_municipio.mjs — dá NOME e MUNICÍPIO aos links |
| `scripts/enriquece_descricao_marca.mjs` | ENRIQUECE a descrição do item com o que aprendemos do doc de resultado: marca VENCEDORA (conferida, trava dupla) + marcas CANDIDATAS (concorreram) + preço homologado. Junta itens_s |
| `scripts/enriquece_fila_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ enriquece_fila_camara.mjs — dá URL de portal às câmaras da fila que  |
| `scripts/enriquece_item_documento.mjs` | ENRIQUECEDOR — consome o corpus JÁ GUARDADO (arquivo_texto_sc + itens_sc) e, por item, percorre TODOS os documentos da construção DO PRIMEIRO AO ÚLTIMO (DFD→ETP→TR→Edital…), locali |
| `scripts/enriquece_paralelo.mjs` | LANÇADOR — usa TODOS OS NÚCLEOS pro enriquecimento. Abre 1 processo por core, cada um numa FATIA disjunta (shard por hash do processo) → sem overlap, sem corrida. Cada processo gra |
| `scripts/enumera_scpi_catalogo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ enumera_scpi_catalogo.mjs — ENUMERA os catálogos de revenda da Fiori |
| `scripts/enviar_notificacoes.mjs` | CARTEIRO das notificações — pega os deltas pendentes (status='detectado'), resolve os destinatários no cadastro (verificados, ativos, válidos, canal e-mail, secretaria/áreas casand |
| `scripts/enviar_notificacoes_whatsapp.mjs` | CARTEIRO WhatsApp — envia os deltas pendentes aos destinatários com canal_pref='whatsapp'. Usa a Meta WhatsApp Cloud API. IMPORTANTE: mensagem PROATIVA (iniciada pela empresa) exig |
| `scripts/escolhe_recorte.mjs` | ROTEADOR DE RECORTE — todos os métodos concorrem, vence o que MEDE melhor naquele documento.  ═══ POR QUE NÃO EXISTE UM MÉTODO ÚNICO ═══ Ordem do Heitor, 08/ago: "casa todos os mét |
| `scripts/estima_servidores_por_secretaria.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ estima_servidores_por_secretaria.mjs — "quantos servidores tem cada  |
| `scripts/estuda_portal.mjs` | ESTUDA UM PORTAL — a PREMISSA padrão (Heitor): ao achar um portal novo, rode ISTO. Dá, por PORTAL × MODALIDADE (presencial/eletrônico já no modalidade_id) × TÍTULO do documento:    |
| `scripts/estuda_repertorio.mjs` | REPERTÓRIO DE DOCUMENTOS por PORTAL × MODALIDADE × TIPO — o que cada plataforma efetivamente gera. |
| `scripts/estudos/epublica_floripa_favorecido.mjs` | — |
| `scripts/etl_indicadores_previne.mjs` | ETL combinado: indicadores Previne + ISF (SISAB indicadorPainel) — 10 quadrimestres + ingest série. |
| `scripts/etl_orquestrador.mjs` | ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental, idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrado |
| `scripts/etl_pagina_sync.mjs` | Sincroniza a PÁGINA DE COLETA (/etl) com a realidade do banco: conta registros reais por fonte, reflete progresso ao vivo do harvest (processos/itens) e atualiza etl_catalogo (msg/ |
| `scripts/etl_producao_aps.mjs` | ETL combinado: produção da APS (SISAB) — scrape série + ingest. Idempotente (TRUNCATE+reload). |
| `scripts/etl_qualidade_siaps.mjs` | ETL combinado: novo modelo SIAPS (Qualidade 15 indicadores + Vínculo/CVAT) — scrape + 3 ingests. |
| `scripts/eval_operating_point.mjs` | Ponto de operação REAL do trigrama de produção: usa item_catmat_map (pg_trgm sim + PDM) para as chaves rotuladas, compara ao gabarito por NOME e traça precisão × cobertura por limi |
| `scripts/export_gold_eval.mjs` | Exporta o gabarito (painel_gold) + nomes de PDM para TSV, insumo da bancada de avaliação de classificação. Ponte por arquivo (mesmo padrão do treino). node scripts/export_gold_eval |
| `scripts/export_sc_strat.mjs` | Amostra ESTRATIFICADA por banda de frequência das descrições de bem de itens_sc — p/ traçar a curva acurácia × frequência do classificador (onde o trigrama degrada na cauda). node  |
| `scripts/export_sc_top.mjs` | Exporta as descrições coloquiais de BEM mais frequentes de itens_sc (n>=N_MIN) para rotulagem do gabarito de SC. node scripts/export_sc_top.mjs |
| `scripts/extrai_az.mjs` | EXTRATOR — atas "Resultados" da AZ (arquivo_texto_sc.gerador='az'). Roteado pelo GERADOR, não pela plataforma.  ═══ O QUE O MANUAL DO PNCP DIZ (https://pncp.gov.br/manual/pt-br/lat |
| `scripts/extrai_betha.mjs` | EXTRATOR DETERMINÍSTICO — atas NATIVAS do Betha (arquivo_texto_sc.gerador='betha'). Roteado pelo GERADOR do documento, NÃO pela plataforma do PNCP (=quem publicou; ver mapa_atas_pl |
| `scripts/extrai_ecustomize.mjs` | EXTRATOR DETERMINÍSTICO ECustomize — roda parseAtaEcustomize sobre TODAS as atas ECustomize (texto guardado) e grava propostas_sc (TODOS os fornecedores: fornecedor+cnpj+marca+mode |
| `scripts/extrai_lei_14133.mjs` | EXTRAI a Lei 14.133/2021 (texto oficial do Planalto) para docs/lei-14133-compras.md — os artigos que governam o que fazemos: TR, edital, pesquisa de preços, descrição de material,  |
| `scripts/extrai_link_portal_do_site.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ extrai_link_portal_do_site.mjs — do SITE do município para o LINK DO |
| `scripts/extrai_marca_ancora.mjs` | EXTRATOR DE MARCA POR ÂNCORA DE VALOR — o método que o Bento (Heitor) ensinou, provado ponta a ponta:   a marca de produto NÃO está na spec do edital (art. 41 veda) nem colada na d |
| `scripts/extrai_marca_fila.mjs` | FILA DE EXTRAÇÃO DE MARCA — roteia pelo GERADOR e grava em LOTE. É a única porta de escrita da base.    node scripts/extrai_marca_fila.mjs                 # 200 processos, GRAVA    |
| `scripts/extrai_marca_multi.mjs` | EXTRATOR UNIFICADO — roda os parsers determinísticos NOVOS (Pública, LicitarDigital, Dispensa/Inexig, IPM), casa cada item ao PNCP pela DESCRIÇÃO (casaItens), determina o VENCEDOR  |
| `scripts/extrai_marca_padrao.mjs` | EXTRAI marca dos templates de TEXTO A/B (inline) — LEVE: lê a fila `doc_tem_marca` (não varre os 12GB), extrai pares crus {marca,valor} do texto e grava EM LOTE em app.item_marca_p |
| `scripts/extrai_marca_router.mjs` | ROTEADOR DE MARCA — o passo AUTOMÁTICO que roda a cada ciclo: quando um item vem HOMOLOGADO (unit_homologado>0) e o documento de resultado já foi baixado, extrai a marca pelo parse |
| `scripts/extrai_marca_visao.mjs` | EXTRAI MARCA POR VISÃO — doc de resultado que é PDF IMAGEM (sem texto) → Haiku-visão lê item→fornecedor→marca→valor. Fonte: PNCP /arquivos/{sd} (o arquivo que a plataforma subiu).  |
| `scripts/extrai_portal_vencedores.mjs` | EXTRATOR — bloco "Vencedores" do Portal de Compras Públicas (arquivo_texto_sc.gerador='portal_vencedores').  POR QUE EXISTE: o Portal emite DUAS tabelas. O parser_ecustomize lê a d |
| `scripts/fecha_gap.mjs` | — |
| `scripts/find_bundle.mjs` | — |
| `scripts/fix_funcao_cpf_mascara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ fix_funcao_cpf_mascara.mjs — decodifica o CPF MASCARADO que cada por |
| `scripts/fix_view_folha_brasil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ fix_view_folha_brasil.mjs — reconstrói `vw_folha_municipal_brasil`  |
| `scripts/fix_view_folha_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ fix_view_folha_camara.mjs — a folha das CÂMARAS MUNICIPAIS, com o m |
| `scripts/fix_view_folha_camara_pessoa.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ fix_view_folha_camara_pessoa.mjs — a camada de PESSOA da folha das c |
| `scripts/folha_jsession.mjs` | — |
| `scripts/folha_longpoll.mjs` | — |
| `scripts/fonte_censo_escolar.mjs` | FONTE COMPARTILHADA — o zip de microdados do Censo Escolar do INEP (~537 MB).  ═══ POR QUE ISTO EXISTE ═══ Medido em 10/ago: CINCO ETLs precisam deste mesmo arquivo (censo_especial |
| `scripts/gabarito_marca_descricao.mjs` | GABARITO — A MARCA ESTÁ NA DESCRIÇÃO DO ITEM? (amostra rotulada; método do CATMAT, ver [[pnigp-catmat-classificacao]])  ═══ POR QUE ESTE SCRIPT EXISTE ═══ Medir presença de marca e |
| `scripts/garimpa_folha_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ garimpa_folha_uf.mjs — acha a TELA DE FOLHA dentro do portal de cada mun |
| `scripts/gen_docx_competitiva.mjs` | Gera o .docx da Análise Competitiva (Node puro, sem dependência). node scripts/gen_docx_competitiva.mjs |
| `scripts/geocode_equipamentos_cep.mjs` | Fallback de geocodificação por CEP — para os equipamentos do SUAS cujo endereço completo o Nominatim não encontrou. CEP→coordenada via AwesomeAPI (cep.awesomeapi.com.br). Marca geo |
| `scripts/geocode_equipamentos_suas.mjs` | Geocodifica os equipamentos do SUAS (CadSUAS só tem endereço, não lat/lon) via Nominatim/OSM. Respeita a política do Nominatim: 1 req/seg, User-Agent identificado. Idempotente/resu |
| `scripts/gera_folha_ba_html.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ gera_folha_ba_html.mjs — a entrega do levantamento da folha das pref |
| `scripts/gera_folha_html.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ gera_folha_html.mjs — a entrega: uma página única, standalone, em C: |
| `scripts/gera_folha_mtms_html.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ gera_folha_mtms_html.mjs — a entrega do levantamento da folha de MT  |
| `scripts/gera_relatorio_extracao.mjs` | Gera um HTML de conclusão da extração de texto do PNCP (arquivo_texto_sc). Queries LEVES (sem subconsulta correlacionada) p/ NAO competir com a extração. Uso pelo vigia (.claude/wa |
| `scripts/gerador_documento.mjs` | QUEM GEROU ESTE PDF? — identificação pelo CONTEÚDO, que é o terceiro eixo da lei local x modalidade x GERADOR.  ═══ POR QUE ISTO EXISTE, E POR QUE NÃO SERVE OLHAR O PORTAL NEM O TÍ |
| `scripts/gerar_documentacao.mjs` | Gerador de documentação automática do sistema PNIGP. Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta e tarefas agendadas  |
| `scripts/harvest_painel_gold.mjs` | COLETOR DE GABARITO — Painel de Preços federal (dadosabertos.compras.gov.br) como corpus rotulado real. Resolve a raiz do problema de classificação: SC não publica CATMAT (0 rótulo |
| `scripts/hora_br.mjs` | RELÓGIO ÚNICO DOS SCRIPTS — tudo que um humano vai ler sai em horário de Brasília.  O PROBLEMA que isto resolve. O servidor e o node correm em UTC, então `new Date().toISOString()` |
| `scripts/identifica_erp_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ identifica_erp_camara.mjs — descobre QUAL produto serve a folha em c |
| `scripts/identifica_erp_por_pagina.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ identifica_erp_por_pagina.mjs — para cada portal do Radar, VISITA a  |
| `scripts/identifica_erp_prefeitura_convertida.mjs` | Roda o identificador de ERP por ASSINATURA sobre as prefeituras que `descobre_prefeitura_de_camara.mjs` recuperou. Elas nasceram fora do fluxo normal: o Radar só tinha o portal da  |
| `scripts/identifica_host_desconhecido.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ identifica_host_desconhecido.mjs — abre o host que a varredura achou |
| `scripts/identifica_produto_portal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ identifica_produto_portal.mjs — descobre QUAL PRODUTO roda por trás  |
| `scripts/inep_list.mjs` | — |
| `scripts/inep_matriculas.mjs` | — |
| `scripts/inep_parse.mjs` | — |
| `scripts/ingest_acesso_financeiro_sc.mjs` | ETL — Acesso e movimento financeiro por município (BCB Olinda). SÉRIE HISTÓRICA. 4 camadas: AGÊNCIAS + POSTOS (inc. COOPERATIVAS) + CORRESPONDENTES (snapshot por COMPETÊNCIA, acumu |
| `scripts/ingest_acompanhamento_funcao_sc.mjs` | ETL — ACOMPANHAMENTO por FUNÇÃO (intra-anual): orçado (dotação) × realizado (empenhado) ATÉ O BIMESTRE vigente, por função, por município. Tabela SEPARADA da anual (despesa_subfunc |
| `scripts/ingest_acompanhamento_sc.mjs` | ETL — ACOMPANHAMENTO intra-anual da execução orçamentária (RREO do bimestre vigente, SICONFI). Receita prevista × arrecadada e despesa orçada × empenhada ATÉ O BIMESTRE, por municí |
| `scripts/ingest_agropecuaria_sc.mjs` | ETL — AGRICULTURA e AGRICULTURA FAMILIAR por município (Censo Agropecuário 2017, IBGE/SIDRA). Recorte de agricultura familiar (Lei 11.326): nº de estabelecimentos (t/6778) + área ( |
| `scripts/ingest_alesc_contatos_sc.mjs` | ETL — Foto, partido, página, e-mail e telefone dos deputados estaduais (ALESC), p/ os cards da aba Estaduais. Fonte: ALESC admin-ajax (post_type=post_team) — HTML dos cards. Casa p |
| `scripts/ingest_alfabetizacao_sc.mjs` | IBGE Censo 2022 — taxa de alfabetização das pessoas de 15 anos ou mais por município. Fonte: IBGE tabela 9543. State-agnostic. |
| `scripts/ingest_ana_outorgas_sc.mjs` | ETL — ANA Outorgas de direito de uso de recursos hídricos por município. Fonte: ANA (portal ArcGIS Hub, dados abertos). 3 bases: federal superficial + estadual superficial + estadu |
| `scripts/ingest_anatel_bl_sc.mjs` | ETL — ANATEL Banda Larga Fixa por município. Fonte: dados abertos ANATEL (zip ~1GB, CSVs por período, UTF-8, ;). Cada linha = acessos (assinaturas) por ano/mês/empresa/município/te |
| `scripts/ingest_aneel_gd_sc.mjs` | ETL — ANEEL Geração Distribuída por município. Fonte: dadosabertos.aneel.gov.br (CSV ~1,5GB, latin1, ;). Agrega por município: nº de empreendimentos + potência instalada (kW) + fon |
| `scripts/ingest_anp_sc.mjs` | ETL — ANP preços de combustíveis por município. Fonte: gov.br/anp .../shpc/dsas/ca/ca-YYYY-SS.csv (semestral, latin1, ;). Agrega preço médio de venda por (município, ano, semestre, |
| `scripts/ingest_anp_vendas_sc.mjs` | ETL — ANP vendas de combustíveis por município. Fonte: dados abertos ANP (CSV direto, série 1990+). Diesel, gasolina C, etanol hidratado, GLP. Vendas em litros/kg por município/ano |
| `scripts/ingest_ans_cobertura_sc.mjs` | ETL — ANS cobertura de planos de saúde por município. Fonte: dadosabertos.ans.gov.br (taxa_de_cobertura, CSV 21MB, latin1, ;). Agrega beneficiários (assistência médica) + população |
| `scripts/ingest_apac_sc.mjs` | ETL — APAC alta complexidade por município: oncologia (quimio+radio) e diálise. Fonte: DATASUS SIA APAC (DBC). Usa _blast_dbc.mjs. Nº de APAC (autorizações ≈ paciente-mês) + valor, |
| `scripts/ingest_arboviroses_sc.mjs` | ETL — SINAN arboviroses (dengue + zika + chikungunya) por município. Fonte: InfoDengue (Fiocruz), dados do SINAN. Generaliza o coletor de dengue: mesma API alertcity, param disease |
| `scripts/ingest_arquivo_texto_sc.mjs` | DOCUMENTO_TEXTO — materializa o CONTEÚDO (texto) dos documentos do PNCP, para NÃO re-baixar a cada extração. Baixa o PDF (arquivos_sc.uri) → extrai texto (unpdf) → grava arquivo_te |
| `scripts/ingest_arquivos_ata_sc.mjs` | ARQUIVO DA ATA — o 🔴 buraco de docs/coleta-pncp-forma.md: "NUNCA COLETADO — e é onde a marca vive". Espelha /orgaos/{cnpj}/compras/{ano}/{seq}/atas/{sequencialAta}/arquivos → tabe |
| `scripts/ingest_arquivos_sc.mjs` | ARQUIVOS — entidade do PNCP (documentos de cada contratação: edital, TR, ATA, termo de homologação…). Espelha fiel o endpoint /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos → tabela a |
| `scripts/ingest_assistencia_social_sc.mjs` | ETL — Assistência social COMPLETA por município de SC (MDS · MI Social Solr). (1) assistencia_repasse_sc: SÉRIE ANUAL do repasse FNAS/SUAS recebido (2005→atual · total/PSB/PSE) — " |
| `scripts/ingest_atas_marca_sc.mjs` | INGESTÃO — MARCA/MODELO/LANCES das Atas de Sessão do PNCP. O dado estruturado do PNCP (/resultados) NÃO traz marca; ela (e o histórico de lances) mora no PDF da Ata anexada (/arqui |
| `scripts/ingest_atas_sc.mjs` | ETL — Atas de Registro de Preço (PNCP, API de Consulta /v1/atas) por órgão de SC. Traz preços registrados + vínculo à compra (numeroControlePNCPCompra). Idempotente/resumível por ó |
| `scripts/ingest_bancada_estadual_sc.mjs` | ETL — Bancada ESTADUAL (deputados estaduais eleitos, ALESC) + votos por município, do TSE 2022 (cargo 7). Roster = candidatos cargo 7 com situação "ELEITO ..." (QP/Média). Votos po |
| `scripts/ingest_bancada_federal_sc.mjs` | ETL — Bancada federal do estado (deputados federais + senadores) para o módulo de Captação de Emendas. Fontes abertas: Câmara (dadosabertos.camara.leg.br) e Senado (legis.senado.le |
| `scripts/ingest_barragens_sc.mjs` | ANA SNISB — barragens por município: total + dano potencial alto + categoria de risco alta. Fonte: ANA/SNISB (ArcGIS). State-agnostic (UF env). |
| `scripts/ingest_betha_portais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_betha_portais.mjs — o DIRETÓRIO nacional de portais Betha: qu |
| `scripts/ingest_bndes_sc.mjs` | ETL — BNDES desembolsos por município (crédito produtivo). Fonte: dadosabertos.bndes.gov.br (CSV ~135MB, latin1). Agrega desembolsos_reais por (município, ano) + guarda os 3 maiore |
| `scripts/ingest_bolsa_atleta_sc.mjs` | ETL — Bolsa Atleta por município. Fonte: Ministério do Esporte (dados abertos, XLSX no SharePoint mdsgov). Download via SharePoint _layouts/15/download.aspx?share={token}. Agrega n |
| `scripts/ingest_bpc_sc.mjs` | ETL — BPC (Benefício de Prestação Continuada) por município, via MI Social (SAGI/MDS), API Solr pública. Idosos e pessoas com deficiência de baixa renda (1 salário mínimo). Fecha a |
| `scripts/ingest_cadeia_pncp.mjs` | A CADEIA DA COMPRA ATÉ O PAGAMENTO — contrato → empenho → nota fiscal. Todos os compradores da UF.  ═══ O QUE FALTAVA E AGORA ESTÁ MEDIDO (2026-07-16) ═══ A memória do projeto dizi |
| `scripts/ingest_cadprev.mjs` | ETL GENÉRICO — espelha (mirror raw) os demais recursos do CADPREV, fielmente, por UF. Captura "tudo que a API expõe": cria cadprev_<recurso> com todas as colunas da fonte + cod_ibg |
| `scripts/ingest_caf_sc.mjs` | ETL — CAF (Cadastro Nacional da Agricultura Familiar, ex-DAP): agricultores familiares por município de SC. Fonte: MDA — Transparência da CAF (XLSX mensal, nacional). Aba GERAL: bl |
| `scripts/ingest_caged_sc.mjs` | ETL — Novo CAGED: saldo de empregos formais por município. Fonte: FTP PDET/MTE (CAGEDMOV{AAAAMM}.7z, ~59MB/mês, 4,8M linhas). Agrega saldo (admissões − desligamentos) por (municípi |
| `scripts/ingest_capag_sc.mjs` | ETL — STN CAPAG (Capacidade de Pagamento) por município. Fonte: Tesouro Transparente (CKAN, XLSX). Nota A/B/C/D (elegibilidade a crédito com garantia da União) + 3 indicadores: end |
| `scripts/ingest_car_sc.mjs` | ETL — CAR (Cadastro Ambiental Rural): nº de imóveis rurais por município de SC. Fonte: SICAR GeoServer WFS público (sicar:sicar_imoveis_sc), contagem via resultType=hits (sem shape |
| `scripts/ingest_catalogo_govbr_sc.mjs` | ETL — Catálogo oficial do governo federal (CATMAT + CATSER) do Compras.gov.br: espinha dorsal p/ classificar os itens de compra. Snapshot completo (rebuild idempotente). node scrip |
| `scripts/ingest_catalogo_rnr_cr2.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_catalogo_rnr_cr2.mjs — ⭐ CATÁLOGO NACIONAL DE PORTAS DE FOLHA |
| `scripts/ingest_catmat_catalogo.mjs` | Catálogo CATMAT (materiais) completo — a taxonomia federal. Base do classificador descrição→CATMAT. Fonte: dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial (687  |
| `scripts/ingest_cauc_sc.mjs` | ETL — CAUC (Sistema de Informações sobre Requisitos Fiscais) por município/Estado de SC. Fonte: CSV oficial do Tesouro Transparente (CAUC lê o CADIN diariamente). Mostra se o ente  |
| `scripts/ingest_cemaden_sc.mjs` | CEMADEN — estações pluviométricas de monitoramento de risco por município. Fonte: CEMADEN (WFS GeoServer). State-agnostic (UF env). |
| `scripts/ingest_censo_corraca_sc.mjs` | IBGE Censo 2022 — população residente por cor/raça por município. Fonte: IBGE (API agregados, tabela 9605). State-agnostic (UF env → cód IBGE). |
| `scripts/ingest_censo_especial_sc.mjs` | ETL — Educação Especial por município (INEP Censo Escolar, Tabela_Matricula). Detalhe do ano corrente: total (QT_MAT_ESP), INCLUÍDOS em classes comuns (QT_MAT_ESP_CC → inclusão), e |
| `scripts/ingest_censo_hist_sc.mjs` | ETL — Censo Escolar ESCOLA A ESCOLA, ANO A ANO (SC, TODAS as dependências), 2007→atual. Grão máximo p/ B2G e estudos B2B. Por (co_entidade, ano): matrículas + modalidade (tipo de a |
| `scripts/ingest_censo_sc.mjs` | ETL — Censo Escolar (INEP): matrículas por município/etapa. Fonte: Sinopse Estatística da Educação Básica. Tabela 1.1 (sheet7): Matrículas da Educação Básica por Etapa, segundo UF  |
| `scripts/ingest_cfem_sc.mjs` | ETL — CFEM (royalty de mineração) distribuído por município. Fonte: dadosabertos.anm.gov.br/CFEM/CFEM_Distribuicao.csv (~128MB, latin1, campos entre aspas). Agrega Valor por (munic |
| `scripts/ingest_classificacao_itens_sc.mjs` | ETL — Classificação dos itens de compra → CATMAT/CATSER. Dicionário por descritivo normalizado distinto (matcher léxico v2: fuzzy-prefixo + head livre + limiar de especificidade).  |
| `scripts/ingest_cmed_pmvg.mjs` | ETL — CMED/Anvisa PMVG (Preço Máximo de Venda ao Governo): o TETO LEGAL de preço de medicamentos. Referência nacional p/ detectar sobrepreço em compras de saúde. SC = alíquota ICMS |
| `scripts/ingest_cnes_equipamentos_sc.mjs` | ETL — CNES equipamentos médicos por município + por estabelecimento. Fonte: DATASUS CNES (EQ, DBC). Usa _blast_dbc.mjs. Diagnóstico por imagem (tomógrafo/RM/mamógrafo/raio-x), manu |
| `scripts/ingest_cnes_equipes_sc.mjs` | ETL — CNES equipes de saúde (ESF/APS) por município + por estabelecimento. Fonte: DATASUS CNES (DBC). Usa _blast_dbc.mjs. Série histórica (dez de cada ano). Total de equipes + ESF  |
| `scripts/ingest_cnes_estab_sc.mjs` | ETL — Estabelecimentos de saúde por município (CNES, API DEMAS). Rede PÚBLICA (municipal/estadual/federal): cada unidade com tipo, gestão, esfera, SUS, centro cirúrgico/obstétrico, |
| `scripts/ingest_cnes_leitos_sc.mjs` | ETL — CNES leitos hospitalares por município + por estabelecimento. Fonte: DATASUS CNES (LT, DBC). Usa _blast_dbc.mjs. Total de leitos + leitos SUS + leitos de UTI (complementar).  |
| `scripts/ingest_cnes_profissionais_sc.mjs` | ETL — CNES profissionais de saúde por município + por estabelecimento. Fonte: DATASUS CNES (PF, DBC). Usa _blast_dbc.mjs. Profissionais DISTINTOS (por CPF) por categoria (médico/en |
| `scripts/ingest_cnes_sc.mjs` | ETL — CNES (rede de saúde instalada) por município de SC. Fonte: API dados abertos do Min. Saúde. Agrega por município: nº de estabelecimentos, atende SUS, atendimento hospitalar,  |
| `scripts/ingest_cnpj_loc.mjs` | ETL — resolve UF/município dos FORNECEDORES vencedores (PNCP não fornece; usamos o CNPJ). Fonte: minhareceita.org (base Receita Federal). Cache em cnpj_loc, idempotente/resumível,  |
| `scripts/ingest_cnpj_municipal_sc.mjs` | Registro de CNPJs do GOVERNO MUNICIPAL (prefeitura + órgãos + RPPS) por município — insumo p/ CGU/Portal da Transparência. Fontes limpas: SICONFI /entes (prefeitura, todos os munic |
| `scripts/ingest_cobertura_vacinal_final.mjs` | ETL — Cobertura vacinal por município e vacina, SÉRIE COMPLETA 2015-2026. Fonte: SI-PNI / LocalizaSUS (medida oficial de cobertura, RNDS). Extraído do engine Qlik do painel oficial |
| `scripts/ingest_cobertura_vacinal_moderna_sc.mjs` | ETL — Cobertura vacinal MODERNA por município e vacina (SI-PNI, fonte RNDS), série 2015-2026. Fonte: painel oficial LocalizaSUS/Qlik "Cobertura Vacinal - Calendário Nacional - Resi |
| `scripts/ingest_cobertura_vacinal_sc.mjs` | ETL — Cobertura vacinal por município e vacina (PNI). Fonte: DATASUS SI-PNI (CPNI{UF}{yy}.DBF, campo COBERT oficial). Mapa IMUNO→vacina extraído do tabnet oficial (bd_pni/cpnibr.de |
| `scripts/ingest_compras_sc.mjs` | ⚠️ DEPRECADO (jul/2026) — SUBSTITUÍDO por scripts/build_compras_sc.mjs (derivada do espelho, Lei 1). Este script re-buscava o agregado da API do PNCP; como faz UPSERT numa tabela d |
| `scripts/ingest_contratacoes_sc.mjs` | RAIO-X ESTRUTURADO do processo licitatório — metadata oficial do PNCP, via endpoint de LISTAGEM EM LOTE (/contratacoes/publicacao por data+UF+modalidade, até 500/página) → MUITO me |
| `scripts/ingest_contrato_via_processo_sc.mjs` | CONTRATO PELO PROCESSO — "primeiro procura em processos o contrato, e depois os documentos". Dirige pelas 241.302 contratações (contratacoes_sc) e resolve os contratos pela PONTE   |
| `scripts/ingest_contratos_sc.mjs` | ETL — Contratos ASSINADOS do PNCP por município de SC, conectados ao processo licitatório. Descobre os CNPJs dos órgãos municipais (via contratações esfera M) e puxa /contratos?cnp |
| `scripts/ingest_convenios_sc.mjs` | ETL — Convênios captados pelos municípios (Portal da Transparência, dado do Transferegov). "Quanto cada prefeitura captou" → base p/ benchmark vs pares (o ponto cego da captação).  |
| `scripts/ingest_convenios_siconv_sc.mjs` | ETL — Convênios/Contratos de Repasse por município SC (SICONV/Transferegov, repositório detru). Lê os CSVs já extraídos em $CLAUDE_JOB_DIR/tmp via readline (streaming, sem OOM). pr |
| `scripts/ingest_cvat_aps.mjs` | — |
| `scripts/ingest_datasus_sih_sc.mjs` | ETL — DATASUS SIH (internações hospitalares SUS) por município. Fonte: FTP DATASUS (DBC mensal). Usa _blast_dbc.mjs. Agrega por município/ano: internações + valor total pago + óbit |
| `scripts/ingest_datasus_sim_sc.mjs` | ETL — DATASUS SIM (óbitos) por município. Fonte: FTP DATASUS (DBC), descompactado pelo _blast_dbc.mjs. Agrega por município/ano: total óbitos + causas externas + circulatório + neo |
| `scripts/ingest_datasus_sinasc_sc.mjs` | ETL — DATASUS SINASC (nascidos vivos) por município. Fonte: FTP DATASUS (DBC). Usa o descompressor _blast_dbc.mjs. Agrega por município/ano: nascimentos + baixo peso + prematuros + |
| `scripts/ingest_datatran_sc.mjs` | ETL — PRF DATATRAN acidentes em rodovias federais por município. Fonte: PRF dados abertos (CSVs "agrupados por ocorrência", Google Drive). Agrega por município/ano: nº de acidentes |
| `scripts/ingest_desastres_sc.mjs` | ETL — Desastres (S2ID) por município. Fonte: Atlas Digital de Desastres (atlasdigital.mdr.gov.br) — base completa 1991-2025 (CSV 51MB, latin1, ;). Download DIRETO em /arquivos/ (es |
| `scripts/ingest_despesa_subfuncao_sc.mjs` | ETL — Despesa por FUNÇÃO → SUBFUNÇÃO (drill real: Atenção Básica, Ensino Fundamental…) via SICONFI RREO Anexo 02. Hierarquia é por ordem: linha de função (lista oficial) e depois s |
| `scripts/ingest_domicilios_sc.mjs` | IBGE Censo 2022 — domicílios particulares permanentes ocupados + densidade (moradores/domicílio) por município. Fonte: IBGE tabela 4712 (universo). State-agnostic. |
| `scripts/ingest_eleitorado_sc.mjs` | ETL — Número de ELEITORES (aptos) por município de SC, p/ o % dos votos de cada parlamentar sobre o eleitorado. Fonte: TSE perfil_comparecimento_abstencao 2022 (QT_APTOS por municí |
| `scripts/ingest_emendas_est_objetos_sc.mjs` | ETL — Catálogo REAL de objetos de emendas parlamentares ESTADUAIS de SC (ano 2026), do Power BI da SEF. Cada objeto (finalidade real de uma emenda) + valor, classificado por área.  |
| `scripts/ingest_emendas_estaduais_sc.mjs` | ETL — Execução das emendas parlamentares ESTADUAIS por município (SEF-SC), extraída do painel Power BI (endpoint público querydata; tabela ExecucaoEmendasParlamentares). Parser do  |
| `scripts/ingest_emendas_sc.mjs` | ETL — Emendas parlamentares por município de SC: EXECUÇÃO orçamentária federal (Portal da Transparência, API de Dados). Autoritativo: empenhado×liquidado×pago×resto por emenda, aut |
| `scripts/ingest_emendas_siconv_sc.mjs` | ETL — Emendas parlamentares por município SC: INDICAÇÃO (SICONV/Transferegov, repositório público detru). Quem destinou e quanto: parlamentar, impositivo, valor (+ execução do conv |
| `scripts/ingest_empenhos_sc.mjs` | ETL — Empenhos por contrato (PNCP, Lei 14.133). Endpoint /contratos/{ano}/{seq}/empenhos. Hoje a cobertura em SC é ~0 (municípios ainda não publicam o ciclo), mas o coletor "acende |
| `scripts/ingest_entes_uf.mjs` | ETL — carrega os ENTES (municípios + governo estadual) de qualquer UF na tabela entes_sc. Fonte: IBGE (localidades + população estimada). Pré-requisito para coletar um novo estado. |
| `scripts/ingest_equipamentos_esporte_sc.mjs` | ETL — Equipamentos ESPORTIVOS públicos de SC, georreferenciados. Fonte: OpenStreetMap/Overpass (leisure=pitch/sports_centre/stadium/track/fitness_station) → coords reais. Município |
| `scripts/ingest_equipamentos_justica.mjs` | ETL — Equipamentos de SEGURANÇA, JUSTIÇA e DEFESA CIVIL de SC, georreferenciados. Fonte principal: OpenStreetMap/Overpass (amenity=prison/police/fire_station + nome "Defesa Civil") |
| `scripts/ingest_equipamentos_suas.mjs` | ETL — Equipamentos da Assistência Social (unidades CRAS/CREAS/Centro POP/Acolhimento…) por município. Fonte: CadSUAS (Cadastro Nacional do SUAS) — consulta pública. App JSF/statefu |
| `scripts/ingest_escola_turmas_sc.mjs` | Número de TURMAS por escola e por etapa (creche/pré/fund AI/AF/médio/EJA/especial) + rede. Fonte: INEP Censo Escolar (microdados escola). State-agnostic. |
| `scripts/ingest_escolas_sc.mjs` | ETL — Escolas por município (INEP Censo Escolar microdados, arquivo ed_basica). Cada escola: identificação, dependência, matrículas e INFRAESTRUTURA (água/energia/esgoto/internet/b |
| `scripts/ingest_escolas_series_sc.mjs` | ETL — Nível SÉRIE por escola (SC): matrículas + turmas por série (1º-9º ano, médio, creche/pré, EJA), Censo 2025. Permite o drill série a série com turmas. Grava JSONB escolas_sc.s |
| `scripts/ingest_estatisticas_vitais_sc.mjs` | ETL — Estatísticas vitais por município (nascidos vivos + óbitos). Fonte: IBGE Registro Civil via SIDRA (t2679 v217 nascidos, t2681 v343 óbitos). Substituto limpo do SIM/SINASC (DA |
| `scripts/ingest_estban_sc.mjs` | ETL — ESTBAN (Estatística Bancária Mensal por município, BCB) — SÉRIE HISTÓRICA. Volumes bancários por município. Verbetes-chave: crédito total(160)/rural(163)/agroindustrial(167)/ |
| `scripts/ingest_evasao_escolar_sc.mjs` | Taxa de EVASÃO escolar por município e etapa (Fund AI/AF, Médio) — Indicadores de Fluxo do INEP (Taxas de Transição). State-agnostic. |
| `scripts/ingest_fnde_estado.mjs` | ETL — FNDE/SIMAD do ESTADO (SC): recursos federais da educação ao Governo do Estado / Secretaria de Estado da Educação / Fundo Estadual. As entidades estaduais ficam na capital → c |
| `scripts/ingest_fnde_fundos.mjs` | ETL — FNDE/SIMAD: FUNDOS de educação (municipal/estadual) — versão RÁPIDA. Por município: sonda 2 anos recentes p/ achar CNPJs de FUNDO/MUNICÍPIO (exclui escolas/APPs). Se achar, c |
| `scripts/ingest_fnde_simad.mjs` | ETL — FNDE/SIMAD liberações por município (educação). Browser-only (WAF F5 bloqueia curl) → Playwright headless. Fluxo: form (tp vazio) → LISTA DE ENTIDADES → enviarFormulario(cnpj |
| `scripts/ingest_fns_sc.mjs` | ETL — Repasses federais fundo-a-fundo do FNS por bloco/área, por município de SC. Fonte: API REST da Consulta Consolidada do FNS (consultafns.saude.gov.br) — descoberta via app Ang |
| `scripts/ingest_folha_7focus.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_7focus.mjs — folha nominal do ERP 7Focus (forte no Toca |
| `scripts/ingest_folha_abase.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_abase.mjs — folha nominal COM salário do bloco `abase`, |
| `scripts/ingest_folha_abo_mg.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_abo_mg.mjs — portal ABO-MG (ASP.NET MVC), `transparenci |
| `scripts/ingest_folha_admrh.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_admrh.mjs — folha do portal **ADMRH** (`{host}/rhsyspor |
| `scripts/ingest_folha_admtransp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_admtransp.mjs — folha nominal do portal JSF/PrimeFaces "Adm |
| `scripts/ingest_folha_agape.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_agape.mjs — folha nominal dos portais **Ágape** (Ágape  |
| `scripts/ingest_folha_agili.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_agili.mjs — folha NOMINAL dos municípios ÁGILI ("ÁGILI Cida |
| `scripts/ingest_folha_agili_blue.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_agili_blue.mjs — folha NOMINAL dos municípios ÁGILI **B |
| `scripts/ingest_folha_algov.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_algov.mjs — folha nominal COM SALÁRIO dos portais `tra |
| `scripts/ingest_folha_am_aam.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_am_aam.mjs — folha nominal dos municípios do AMAZONAS p |
| `scripts/ingest_folha_am_anc.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_am_anc.mjs — folha nominal dos municípios do AM que usa |
| `scripts/ingest_folha_am_diretoriodigital.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_am_diretoriodigital.mjs — folha nominal dos municípios  |
| `scripts/ingest_folha_am_parintins.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_am_parintins.mjs — folha nominal de **Parintins/AM** (2 |
| `scripts/ingest_folha_apitransp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_apitransp.mjs — portal próprio com API REST em `api.tra |
| `scripts/ingest_folha_aplpessoal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_aplpessoal.mjs — folha nominal do portal PHP "Portal da Tra |
| `scripts/ingest_folha_aspec_agregado.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_aspec_agregado.mjs — a folha do ASPEC/GovernoTransparen |
| `scripts/ingest_folha_aspec_empenho.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_aspec_empenho.mjs — folha de pessoal AGREGADA POR SECRE |
| `scripts/ingest_folha_aspec_nominal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_aspec_nominal.mjs — folha NOMINAL (nome·órgão·cargo·fu |
| `scripts/ingest_folha_betha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_betha.mjs — folha nominal dos municípios que usam o por |
| `scripts/ingest_folha_betha_egov.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_betha_egov.mjs — folha nominal do portal Betha ANTIGO ( |
| `scripts/ingest_folha_bsit.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_bsit.mjs — folha nominal do ERP BSIT (Gestão Pública),  |
| `scripts/ingest_folha_camara_ancweb.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_camara_ancweb.mjs — folha das CÂMARAS do AMAZONAS publi |
| `scripts/ingest_folha_camara_scriptcase.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_camara_scriptcase.mjs — folha das CÂMARAS que publicam  |
| `scripts/ingest_folha_campinas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_campinas.mjs — folha de CAMPINAS (17.119 servidores na  |
| `scripts/ingest_folha_campogrande.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_campogrande.mjs — Campo Grande/MS (28.046 vínculos na RAIS) |
| `scripts/ingest_folha_campogrande_valor.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_campogrande_valor.mjs — a SEGUNDA PASSADA de Campo Grande/M |
| `scripts/ingest_folha_canoas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_canoas.mjs — folha nominal de CANOAS/RS (portal GeneXus |
| `scripts/ingest_folha_capitais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_capitais.mjs — folha das CAPITAIS, uma a uma.  POR QUÊ  |
| `scripts/ingest_folha_ce_rh.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_ce_rh.mjs — folha NOMINAL dos municípios do CEARÁ pelo CMS  |
| `scripts/ingest_folha_cgm_al.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_cgm_al.mjs — folha nominal do white-label da CONTROLADO |
| `scripts/ingest_folha_cidadesmg.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_cidadesmg.mjs — folha nominal dos municípios no portal |
| `scripts/ingest_folha_cidadesmg_antigo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_cidadesmg_antigo.mjs — a GERAÇÃO ANTIGA do CidadesMG (S |
| `scripts/ingest_folha_citta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_citta.mjs — folha nominal COM salário E SECRETARIA do b |
| `scripts/ingest_folha_consfolha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_consfolha.mjs — portal "Consulta Folha" de SÃO LEOPOLDO |
| `scripts/ingest_folha_contass.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_contass.mjs — cadastro NOMINAL dos municípios em Contas |
| `scripts/ingest_folha_cr2.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_cr2.mjs — folha dos municípios do ERP CR2 (Grupo CR2),  |
| `scripts/ingest_folha_datapublic.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_datapublic.mjs — folha NOMINAL dos municípios DATAPUBLI |
| `scripts/ingest_folha_dbseller.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_dbseller.mjs — folha nominal dos municípios com portal  |
| `scripts/ingest_folha_digifred.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_digifred.mjs — quadro de pessoal NOMINAL do bloco `digi |
| `scripts/ingest_folha_eddydata.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_eddydata.mjs — folha nominal do portal EddyData "Transp |
| `scripts/ingest_folha_elotech.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_elotech.mjs — folha dos municípios do ERP Elotech (port |
| `scripts/ingest_folha_elotech_ficha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_elotech_ficha.mjs — a SÉRIE MENSAL do Elotech, que a li |
| `scripts/ingest_folha_epublica.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_epublica.mjs — folha dos municípios que usam o e-Públic |
| `scripts/ingest_folha_equiplano.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_equiplano.mjs — folha nominal COM SALÁRIO E LOTAÇÃO dos |
| `scripts/ingest_folha_equiplano_cloud.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_equiplano_cloud.mjs — folha nominal da geração NOVA do  |
| `scripts/ingest_folha_farol.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_farol.mjs — a folha de TODOS os servidores públicos MUN |
| `scripts/ingest_folha_farol_sc.mjs` | Folha nominal de município de SC pelo FAROL TCE-SC "Pessoal On-line" (Qlik, anônimo).  ⭐ É a rota SEM CAPTCHA para Florianópolis: o SRH da prefeitura (adm.pmf.sc.gov.br/srh/transpa |
| `scripts/ingest_folha_folhamensal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_folhamensal.mjs — ERP de portal próprio `transparencia. |
| `scripts/ingest_folha_genexus_srvbr.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_genexus_srvbr.mjs — scraper (Playwright) do portal Gen |
| `scripts/ingest_folha_genexus_wwp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_genexus_wwp.mjs — folha nominal dos portais GeneXus Wo |
| `scripts/ingest_folha_geosiap.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_geosiap.mjs — folha dos municípios que usam o GeoSIAP ( |
| `scripts/ingest_folha_govbr.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_govbr.mjs — ingere o XML de folha exportado do portal G |
| `scripts/ingest_folha_govbr_auto.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_govbr_auto.mjs — coletor AUTOMÁTICO da folha Governança |
| `scripts/ingest_folha_govbr_dadosabertos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_govbr_dadosabertos.mjs — a folha do PRONIM/Cidade360 (G |
| `scripts/ingest_folha_govbr_gp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_govbr_gp.mjs — folha nominal dos portais GovernançaBras |
| `scripts/ingest_folha_gpecloud.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_gpecloud.mjs — GPE Cloud (`{slug}-transparencia.gpeclou |
| `scripts/ingest_folha_gwtransparencia.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_gwtransparencia.mjs — folha dos portais GW Transparênci |
| `scripts/ingest_folha_gxrh.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_gxrh.mjs — folha NOMINAL com CARGO + SECRETARIA + SALÁR |
| `scripts/ingest_folha_hardsoft.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_hardsoft.mjs — folha nominal dos municípios com portal  |
| `scripts/ingest_folha_ipm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_ipm.mjs — folha nominal dos municípios que usam o ERP I |
| `scripts/ingest_folha_ipm_cf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_ipm_cf.mjs — coletor IPM para os municípios cujo atende |
| `scripts/ingest_folha_itsolucoes.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_itsolucoes.mjs — folha NOMINAL COM VALOR do portal `por |
| `scripts/ingest_folha_layout.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_layout.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos |
| `scripts/ingest_folha_londrina.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_londrina.mjs — folha nominal de LONDRINA/PR (2º maior m |
| `scripts/ingest_folha_megasoft.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_megasoft.mjs — folha nominal dos municípios do ERP Mega |
| `scripts/ingest_folha_memory.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_memory.mjs — folha NOMINAL COM SALÁRIO dos municípios  |
| `scripts/ingest_folha_minastransparente.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_minastransparente.mjs — portal "MinasTransparente" (Ne |
| `scripts/ingest_folha_montenegro.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_montenegro.mjs — folha de MONTE NEGRO (RO), o último munic |
| `scripts/ingest_folha_multi24.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_multi24.mjs — folha nominal COM salário do bloco `multi |
| `scripts/ingest_folha_municipioonline.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_municipioonline.mjs — folha nominal do **Município Onli |
| `scripts/ingest_folha_nucleogov.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_nucleogov.mjs — folha nominal dos municípios do ERP Nuc |
| `scripts/ingest_folha_pdf_relacao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pdf_relacao.mjs — folha nominal publicada como PDF de R |
| `scripts/ingest_folha_pdtinfo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pdtinfo.mjs — `{slug}.portaldatransparencia.info`, tema |
| `scripts/ingest_folha_pelotas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pelotas.mjs — folha nominal de PELOTAS (11.165 vínculos |
| `scripts/ingest_folha_pi_transparencia.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pi_transparencia.mjs — FOLHA COMPLETA dos municípios do PI  |
| `scripts/ingest_folha_pi_v2.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pi_v2.mjs — FOLHA (com valor) dos municípios do PIAUÍ que r |
| `scripts/ingest_folha_pjf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pjf.mjs — folha de JUIZ DE FORA (26.212 vínculos na RAI |
| `scripts/ingest_folha_poa.mjs` | PORTO ALEGRE — folha nominal com remuneração, do portal da transparência (iframe Struts da Procempa).  Por que um script próprio e não um bloco em ingest_folha_capitais.mjs: aqui a |
| `scripts/ingest_folha_portal_folhas.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_saosebastiao_al.mjs — folha nominal de SÃO SEBASTIÃO/AL |
| `scripts/ingest_folha_portalfacil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portalfacil.mjs — Portal Fácil (`{site do município}/t |
| `scripts/ingest_folha_portalfacil_api.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portalfacil_api.mjs — Portal Fácil pela API central de  |
| `scripts/ingest_folha_portalnovo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portalnovo.mjs — folha do "Portal da Transparência /novo"  |
| `scripts/ingest_folha_portaltp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portaltp.mjs — folha dos municípios que usam o Portal T |
| `scripts/ingest_folha_portaltransp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portaltransp.mjs — portal "Portal Transparência" (porta |
| `scripts/ingest_folha_portovelho.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portovelho.mjs — folha nominal de PORTO VELHO (capital de R |
| `scripts/ingest_folha_portovelho_API_HEITOR.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_portovelho.mjs — folha nominal de PORTO VELHO (RO), cap |
| `scripts/ingest_folha_pronim_grade.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_pronim_grade.mjs — folha nominal do PRONIM/GovBR RASPAN |
| `scripts/ingest_folha_publicsoft.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_publicsoft.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA |
| `scripts/ingest_folha_quality.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_quality.mjs — folha NOMINAL dos municípios atendidos pela  |
| `scripts/ingest_folha_rais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_rais.mjs — a camada NACIONAL do quadro de pessoal munic |
| `scripts/ingest_folha_remuneracoes.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_remuneracoes.mjs — portal "Remunerações" (Nuxt + API RE |
| `scripts/ingest_folha_rhsys.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_rhsys.mjs — folha nominal do **RHsys Portal Transparênc |
| `scripts/ingest_folha_rpm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_rpm.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos mu |
| `scripts/ingest_folha_saiio.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_saiio.mjs — folha dos portais SPA `transparencia.{slug} |
| `scripts/ingest_folha_scpi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_scpi.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos  |
| `scripts/ingest_folha_scpi_csv.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_scpi_csv.mjs — folha nominal do SCPI 9.0 por HTTP puro, |
| `scripts/ingest_folha_siapapi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_siapapi.mjs — quadro NOMINAL de servidores (nome · carg |
| `scripts/ingest_folha_sigafi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_sigafi.mjs — SIGAFI (`{slug}.sigafi.com.br`), portal d |
| `scripts/ingest_folha_sinsoft.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_sinsoft.mjs — folha nominal COM salário do bloco `sinso |
| `scripts/ingest_folha_siplanweb.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_siplanweb.mjs — folha dos municípios em Siplan (`{pm-s |
| `scripts/ingest_folha_smarapd.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_smarapd.mjs — folha NOMINAL COM SALÁRIO dos municípios |
| `scripts/ingest_folha_spapublico.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_spapublico.mjs — folha do portal SPA cuja API pública v |
| `scripts/ingest_folha_ss.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_ss.mjs — folha NOMINAL COM VALOR dos municípios da S&S |
| `scripts/ingest_folha_sys523.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_sys523.mjs — folha nominal COM salário do bloco `sys523 |
| `scripts/ingest_folha_tcema.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcema.mjs — folha dos 217 municípios do MARANHÃO (TCE-M |
| `scripts/ingest_folha_tcemt_nominal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcemt_nominal.mjs — FOLHA NOMINAL dos 141 municípios de MT  |
| `scripts/ingest_folha_tcemt_radar.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcemt_radar.mjs — folha dos municípios de MT pelo RADAR PES |
| `scripts/ingest_folha_tcepb.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcepb.mjs — folha NOMINAL dos 223 municípios da PARAÍBA |
| `scripts/ingest_folha_tcepe.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcepe.mjs — quadro de pessoal dos 184 municípios de PER |
| `scripts/ingest_folha_tcepta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcepta.mjs — folha NOMINAL da família "TcePta", achada em 2 |
| `scripts/ingest_folha_tcers.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcers.mjs — despesa de PESSOAL dos 497 municípios do RI |
| `scripts/ingest_folha_tcgestao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcgestao.mjs — folha NOMINAL dos municípios TC GESTÃO  |
| `scripts/ingest_folha_tche.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tche.mjs — folha nominal dos municípios com portal da T |
| `scripts/ingest_folha_tcidadao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcidadao.mjs — quadro NOMINAL (nome · matrícula · CARGO |
| `scripts/ingest_folha_tcmba.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tcmba.mjs — folha NOMINAL COM SALÁRIO dos 417 municípi |
| `scripts/ingest_folha_tenosoft.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_tenosoft.mjs — folha nominal dos municípios TENOSOFT (4 |
| `scripts/ingest_folha_topsolutions.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_topsolutions.mjs — folha NOMINAL dos municípios TOP SO |
| `scripts/ingest_folha_transpal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_transpal.mjs — folha NOMINAL do portal próprio `transpa |
| `scripts/ingest_folha_transparenciafacil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_transparenciafacil.mjs — folha dos municípios em Transp |
| `scripts/ingest_folha_transparenciahd.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_transparenciahd.mjs — folha dos municípios em `transpar |
| `scripts/ingest_folha_transparenciaweb.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_transparenciaweb.mjs — folha nominal dos portais **Tran |
| `scripts/ingest_folha_transpcidadao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_folha_transpcidadao.mjs — folha nominal do "Transparência Cid |
| `scripts/ingest_fundeb_matriculas_sc.mjs` | ETL — Matrículas por SEGMENTO FUNDEB da REDE MUNICIPAL (INEP Censo, Tabela_Matricula) por município. Base do "Painel FUNDEB Retrato": segmentos ativos, tempo integral, educação esp |
| `scripts/ingest_fundeb_oficial_sc.mjs` | ETL — Matrículas FUNDEB OFICIAIS por município (FNDE, Plataforma Antonieta de Barros, produto 36 "Matriculas - FUNDEB"). Classificação oficial do FUNDEB (tipo_educacao/ensino/turma |
| `scripts/ingest_fundeb_parametros.mjs` | ETL — Parâmetros oficiais do FUNDEB 2026 (FNDE): fatores de ponderação + VAAT por ente + VAAR habilitados. Fonte: gov.br/fnde .../financiamento/fundeb/2026 (CSV latin1, formato Exc |
| `scripts/ingest_geo_entes_sc.mjs` | ETL — Georreferência dos entes: centroide (lat/long), área (km²) e recortes regionais (meso/micro/região) por município. Fonte: IBGE (malhas v4 /metadados + localidades). Base p/ a |
| `scripts/ingest_ibama_autos_sc.mjs` | ETL — IBAMA Autos de Infração ambiental por município. Fonte: dados abertos IBAMA (zip de CSVs por ano, 1977+). Agrega por município: nº de autos + valor das multas + série anual.  |
| `scripts/ingest_ibama_embargos_sc.mjs` | ETL — IBAMA Áreas Embargadas por município. Fonte: IBAMA (CSV direto, ~145MB). Complementa os autos de infração. Agrega por município: nº de embargos + área embargada (ha) + série  |
| `scripts/ingest_ibge_producao_sc.mjs` | ETL — IBGE produção agropecuária (PAM/PPM) + empresas (CEMPRE) por município via SIDRA. Complementa Agropecuária e Base Econômica. PAM 5457 (valor da produção agrícola + área), PPM |
| `scripts/ingest_icmbio_uc_sc.mjs` | ETL — ICMBio/CNUC Unidades de Conservação por município (via interseção PostGIS). Fonte: MMA CNUC (WFS INDE). Busca UCs que tocam SC (geojson WFS), carrega no PostGIS e intersecta  |
| `scripts/ingest_ideb_sc.mjs` | ETL — IDEB por município (INEP) — série histórica + observado × meta (projeção) + nota SAEB. Fonte oficial: download.inep.gov.br/ideb/resultados/  (XLSX dentro de ZIP). Parser XLSX |
| `scripts/ingest_idhm_sc.mjs` | IDHM municipal (Atlas Brasil / PNUD-IPEA-FJP) — IDHM + subíndices (renda/longevidade/educação). Último oficial municipal: Censo 2010. State-agnostic (UF env). |
| `scripts/ingest_iegm_sc.mjs` | ETL — IEGM (Índice de Efetividade da Gestão Municipal) do TCE-SC, por município, via IRB. Fonte: iegm.irbcontas.org.br/dados_abertos/{ano}/calculo/calculo_iegm_{ano}_TCESC_completo |
| `scripts/ingest_igdm_sc.mjs` | ETL — MDS IGD-M (Índice de Gestão Descentralizada Municipal) por município. Fonte: MI Social/SAGI (Solr CSV, sem auth). Qualidade da gestão do PBF/CadÚnico: índice + freq. escolar  |
| `scripts/ingest_incra_assentamentos_sc.mjs` | ETL — INCRA Assentamentos da Reforma Agrária por município. Fonte: INCRA/MDA (SIPRA), CSV "assentamentosgeral". Casa por NOME (sem IBGE); UF vem do PREFIXO do código do projeto (SC |
| `scripts/ingest_indicadores_aps.mjs` | Ingere os 7 indicadores Previne + ISF calculado → indicadores_aps_sc. Pesos/metas oficiais (NT 3/2022-DESF/SAPS/MS). |
| `scripts/ingest_indicadores_inep_escola_sc.mjs` | ETL — Indicadores educacionais INEP POR ESCOLA (CO_ENTIDADE): AFD/TDI/ATU. Casa com escolas_sc (georreferenciado) → detalhe por escola no mapa + desigualdade INTRAMUNICIPAL. Fonte: |
| `scripts/ingest_indicadores_inep_sc.mjs` | ETL — Indicadores educacionais INEP por município (rede MUNICIPAL): AFD (formação docente adequada, CAT_1), TDI (distorção idade-série, CAT_0), ATU (alunos por turma, CAT_0). Por e |
| `scripts/ingest_indicadores_sc.mjs` | ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita). Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, un |
| `scripts/ingest_indicadores_serie.mjs` | Ingere TODOS os indicadores_SC_<quad>.json → indicadores_aps_sc (série de quadrimestres) com ISF calculado. |
| `scripts/ingest_indigena_sc.mjs` | ETL — população indígena por município de SC (IBGE Censo 2022, SIDRA tabela 9605, cor/raça Indígena). Fonte sólida e agregada por município (a saúde indígena é responsabilidade com |
| `scripts/ingest_infra_esporte_sc.mjs` | ETL — Infraestrutura esportiva por município (equipamentos, georreferenciados). Fonte: Ministério do Esporte (dados abertos, XLSX SharePoint mdsgov). Guarda cada equipamento (nome/ |
| `scripts/ingest_itens_sc.mjs` | ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon. Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd, unitário |
| `scripts/ingest_lpg_sc.mjs` | Lei Paulo Gustavo (LPG) — execução financeira por município: transferido, SALDO em conta, % utilizado (risco de devolução). Fonte: MinC/dados.cultura. State-agnostic (UF env). |
| `scripts/ingest_marca_atas_sc.mjs` | EXTRAÇÃO DAS ATAS — por item: TODAS as propostas de TODOS os fornecedores (fornecedor+marca+modelo+valor+classificação) + lances + disputa. O PNCP não expõe esses campos por API; e |
| `scripts/ingest_mcmv_sc.mjs` | ETL — HABITAÇÃO via MCMV (Minha Casa Minha Vida), base de dados oficial do Ministério das Cidades (gov.br/cidades). Unidades habitacionais financiadas por município (FGTS sintético |
| `scripts/ingest_medicamentos_sc.mjs` | ETL — Medicamentos de alto custo (CEAF) por município. Fonte: DATASUS SIA grupo 06 (DBC) + SIGTAP (nome do medicamento). Valor + quantidade dispensada + top medicamentos por municí |
| `scripts/ingest_metas_fiscais_sc.mjs` | ETL — Metas Fiscais (LDO) REAIS via SICONFI (RREO Anexo 06: Resultado Primário e Nominal). Meta fixada no Anexo de Metas Fiscais da LDO × resultado realizado, por ente e ano. node  |
| `scripts/ingest_mi_social_serie_sc.mjs` | ETL — MI SOCIAL série histórica COMPLETA por município (SAGI/MDS, API Solr pública). Formato longo (cod, anomes, indicador, valor). Insumo do moat (granular + série + demografia).  |
| `scripts/ingest_msc_despesa_sc.mjs` | ETL — MSC ANCORADA AO RREO. A MSC dá a FORMA (distribuição do empenhado por natureza e por fonte de recursos); o RREO dá a MAGNITUDE (total oficial exato). Ancoramos a forma ao tot |
| `scripts/ingest_munic_basedados.mjs` | ETL — IBGE MUNIC via BASE DE DADOS OFICIAL (xlsx), não SIDRA. Fonte completa e fidedigna: cada município × cada pergunta. Auto-cura os indicadores de PLANO/CONSELHO/FUNDO/INSTRUMEN |
| `scripts/ingest_munic_sc.mjs` | ETL — IBGE MUNIC (Pesquisa de Informações Básicas Municipais): instrumentos de gestão por município. "tem/não tem" planos e conselhos municipais (vários são pré-requisito p/ transf |
| `scripts/ingest_museus_sc.mjs` | IBRAM MuseusBr — museus por município (contagem + esfera). Fonte: IBRAM (Tainacan/cadastro.museus.gov.br). State-agnostic (UF env). |
| `scripts/ingest_nf_sc.mjs` | ETL — Notas Fiscais / Instrumentos de Cobrança (PNCP, API de Consulta /v1/instrumentoscobranca). Traz chave NFe + vínculo ao contrato. Hoje cobertura em SC ~0 (municípios não publi |
| `scripts/ingest_nota_fiscal_sc.mjs` | NOTA FISCAL ELETRÔNICA — o que foi ENTREGUE, com NCM. O eixo que eu passei um dia inventando já existe.  ═══ O ACHADO (medido 2026-07-16) ═══ /v1/instrumentoscobranca/inclusao?uf=S |
| `scripts/ingest_novopac_sc.mjs` | Novo PAC / ObrasGov — empreendimentos por município: nº obras, investimento previsto, por situação. Fonte: ObrasGov (Casa Civil). State-agnostic (UF env). ATENÇÃO: paginação do met |
| `scripts/ingest_obras_sc.mjs` | Obras por município — DETALHE POR OBRA (ObrasGov/Casa Civil), TODAS as obras ligadas ao município (executor OU tomador), com a ORIGEM do recurso (Federal/Estadual/Municipal/Privado |
| `scripts/ingest_paa_sc.mjs` | Conab PAA — Programa de Aquisição de Alimentos (agricultura familiar): formalizado/executado/DEVOLVIDO por município. Fonte: Conab. State-agnostic (UF env). |
| `scripts/ingest_pca_sc.mjs` | ETL — PCA (Plano Anual de Contratações) do PNCP por município de SC. Descobre os CNPJs dos órgãos municipais (contratações esfera M) e puxa /pca/atualizacao?cnpj= de cada (o filtro |
| `scripts/ingest_pdde_saldo_sc.mjs` | PDDE — SALDO acumulado das UEx (verba escolar PARADA / não executada) por município. Fonte: FNDE (Plataforma Antonieta de Barros). State-agnostic (UF env). |
| `scripts/ingest_pdde_sc.mjs` | ETL — PDDE (Programa Dinheiro Direto na Escola) por MUNICÍPIO de SC (rede municipal). Fonte: FNDE, Plataforma Antonieta de Barros, produto "Execução Financeira PDDE Básico - Públic |
| `scripts/ingest_pib_municipal_sc.mjs` | PIB municipal a preços correntes (NOMINAL) + PIB per capita por município. Fonte: IBGE SIDRA tabela 5938, var 37. State-agnostic (UF env). |
| `scripts/ingest_pnae_agri_sc.mjs` | PNAE — % de compra da agricultura familiar (mínimo legal 30%, Lei 11.947/2009) por município. Fonte: FNDE. State-agnostic (UF env). |
| `scripts/ingest_pnld_sc.mjs` | ETL — PNLD reserva técnica (remanejamento de livros) por MUNICÍPIO de SC (rede municipal). Fonte: FNDE, Plataforma Antonieta de Barros, produto "PDA_PNLD" (id 48) — oferta/demanda  |
| `scripts/ingest_populacao_faixa_sc.mjs` | IBGE Censo 2022 — população por FAIXA ETÁRIA (pirâmide) por município + indicadores (idosos, dependência, envelhecimento). Fonte: IBGE tabela 9514. State-agnostic. |
| `scripts/ingest_populacao_idade_sc.mjs` | ETL — População por idade (0-17) por município de SC, IBGE Censo 2022 via SIDRA (tabela 9514). Habilita os indicadores de DEMANDA/déficit: vagas de creche (0-3), pré-escola (4-5),  |
| `scripts/ingest_precatorios_sc.mjs` | ETL — Precatórios por município de SC, via API do TJSC (sistema de Regime Especial de Precatórios). Lista entes devedores → soma/qtde de precatórios por ente → agrega por município |
| `scripts/ingest_precos_nacional.mjs` | Referência NACIONAL de preços por CATMAT (Painel de Preços / Compras.gov.br), casada por UNIDADE, para os PDMs que classificamos (precos_referencia_sc.catmat_cod). Só unidades SIMP |
| `scripts/ingest_precos_referencia_sc.mjs` | ⛔ DESATIVADO EM 15/07/2026 — NÃO RODAR. Script de jun/2026, código morto e PERIGOSO. Ele faz `DROP TABLE precos_referencia_sc` e recria com schema pobre (k, n_compras…). Mas a `pre |
| `scripts/ingest_previne_sc.mjs` | ETL — Previne Brasil (indicadores de desempenho da APS / SISAB) por município de SC. Fonte: CSV oficial por quadrimestre (Portal de Dados Abertos do SUS, S3). Agrega numerador/deno |
| `scripts/ingest_processos_sc.mjs` | ETL — TODOS os processos de contratação do PNCP em SC (todas as modalidades, todos os anos). Fonte: API Consulta /v1/contratacoes/publicacao (exige codigoModalidadeContratacao; lim |
| `scripts/ingest_prodes_sc.mjs` | ETL — INPE PRODES (desmatamento) por município. Fonte: terrabrasilis WFS (yearly_deforestation, Mata Atlântica). Os polígonos têm state+year+area_km mas NÃO município → interseção  |
| `scripts/ingest_producao_aps_serie.mjs` | Ingere a série histórica de produção da APS (SISAB) → producao_aps_serie_sc. Insert EM LOTE (rápido). |
| `scripts/ingest_programa_beneficiario_sc.mjs` | ETL — ELEGIBILIDADE: quem pode captar cada programa (Transferegov fundoafundo/programa_beneficiario, API viva). Responde "quais municípios são elegíveis" — base do casamento oportu |
| `scripts/ingest_programas_agil.mjs` | ETL — programas "gestão ágil" do Transferegov (fundoafundo/programa_gestao_agil), somados ao catálogo programas_transferegov. Complementa fundoafundo/programa. node scripts/ingest_ |
| `scripts/ingest_programas_federais_curados.mjs` | ETL — REGISTRO CURADO de programas federais de infraestrutura (saúde/educação) que o município pode pleitear. FNS/FNDE não expõem "janela aberta" por API limpa (SISMOB/Habilita são |
| `scripts/ingest_pronaf_sc.mjs` | ETL — PRONAF / Crédito Rural por município de SC. Fonte: BCB SICOR (Olinda OData v2). Entitysets agregados CusteioMunicipioProduto (VlCusteio+codIbge) e InvestMunicipioProduto (VlI |
| `scripts/ingest_quadro_pessoal_pi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_quadro_pessoal_pi.mjs — QUADRO DE PESSOAL dos municípios do PIAUÍ |
| `scripts/ingest_qualidade_aps.mjs` | Ingere a classificação oficial do Componente de Qualidade → qualidade_aps_sc. |
| `scripts/ingest_qualidade_indicadores.mjs` | Ingere o conceito por indicador do Componente de Qualidade → qualidade_indicadores_sc. |
| `scripts/ingest_queimadas_sc.mjs` | ETL — INPE queimadas (focos de calor) por município. Fonte: dataserver-coids.inpe.br (CSVs mensais Brasil). Download via CURL (timeout confiável — o fetch do Node pendura na conexã |
| `scripts/ingest_quilombos_sc.mjs` | ETL — Comunidades Quilombolas Certificadas (Fundação Palmares) por município. Fonte: dados.cultura.gov.br (XLSX). node scripts/ingest_quilombos_sc.mjs |
| `scripts/ingest_raas_saude_mental_sc.mjs` | ETL — Saúde mental (RAAS Psicossocial / CAPS) por município. Fonte: DATASUS SIA RAAS-PS (DBC). Usa _blast_dbc.mjs. Atendimentos + registros psicossociais por município de residênci |
| `scripts/ingest_radar_atricon.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_radar_atricon.mjs — o cadastro NACIONAL de portais de transpa |
| `scripts/ingest_radar_captacao_sc.mjs` | ETL — Radar de Captação (Transferegov/SICONV): PROGRAMAS que cada município pode captar (elegibilidade) + janela de proposta aberta. Fonte: repositorio.dados.gov.br/seges/detru (CS |
| `scripts/ingest_rais_sc.mjs` | ETL — RAIS 2024: estoque de emprego formal por município. Fonte: FTP MTE/PDET (RAIS_VINC_PUB_SUL.7z ~680MB + RAIS_ESTAB_PUB.7z). Formato: CSV com campos entre ASPAS separados por V |
| `scripts/ingest_ranking_detalhe_sc.mjs` | Detalhe do Ranking Tesouro por município — verificações NÃO atendidas (o que corrigir p/ subir). Fonte: Tesouro ARQUIVOS_MUN/<cod>.csv + descricao_ranking.csv. State-agnostic. |
| `scripts/ingest_ranking_tesouro_sc.mjs` | Ranking da Qualidade da Informação Contábil e Fiscal (Tesouro Nacional) por município — nota (A-D), posição nacional, %acertos, dimensões, série. State-agnostic (UF env). |
| `scripts/ingest_receitas_detalhe_sc.mjs` | ETL — Receitas DETALHADAS por item nominal (IPTU, ISS, FPM, ICMS, IPVA, ITR, FUNDEB) via SICONFI RREO Anexo 03 (Demonstrativo da RCL). Soma os 12 meses (colunas <MR-11..MR>) = tota |
| `scripts/ingest_rfb_arrecadacao_sc.mjs` | ETL — RFB Arrecadação por município. Fonte: Receita Federal (dados abertos, XLSX por ano). Abas GPS (previdenciária), DARF (demais), TOTAL. Total arrecadado + previdenciária por mu |
| `scripts/ingest_rgf_sc.mjs` | ETL — RGF (Relatório de Gestão Fiscal, SICONFI): número OFICIAL de pessoal por Poder (Executivo) e Dívida Consolidada Líquida. Anexo 01 = DTP % sobre RCL Ajustada (limites LRF); An |
| `scripts/ingest_rpps_atuarial_sc.mjs` | ETL — Déficit ATUARIAL dos RPPS (projeção de longo prazo) via CADPREV (SPREV). Fonte: apicadprev.trabalho.gov.br /DRAA_VALORES_COMPROMISSOS (item "Déficit Atuarial" + ativos garant |
| `scripts/ingest_rpps_crp.mjs` | ETL — CRP (Certificado de Regularidade Previdenciária) dos RPPS via CADPREV (SPREV). Fonte: apicadprev.trabalho.gov.br /RPPS_CRP. É o mesmo dado da tela "Consultas Públicas → Pesqu |
| `scripts/ingest_rpps_sc.mjs` | ETL — Previdência (RPPS) por município/Estado de SC. Fonte: SICONFI RREO Anexo 04. Receitas × despesas previdenciárias, resultado do fundo, contribuições e benefícios. Só entes COM |
| `scripts/ingest_rreo_constitucional_sc.mjs` | ETL — RREO constitucional (SICONFI): Educação MDE (Anexo 14, % aplicado real), RCL (Anexo 03, TOTAL últimos 12 meses → base legal do limite de pessoal da LRF) e tentativa de Saúde  |
| `scripts/ingest_saeb_sc.mjs` | SAEB — proficiência em Língua Portuguesa e Matemática (escala SAEB) por município/etapa/rede, série 2005-2023. Fonte: mesmos arquivos do IDEB (download.inep.gov.br/ideb/resultados) |
| `scripts/ingest_salario_educacao_sc.mjs` | Salário-Educação (cota municipal) + total de transferências do FNDE, por município/ano. Fonte: SICONFI DCA Anexo I-C. Contas: 1.7.1.4.50.0.0 = Salário-Educação · 1.7.1.4.00.0.0 = t |
| `scripts/ingest_salic_sc.mjs` | SALIC / Lei Rouanet — projetos culturais por município: valor aprovado vs captado (gap = captação na mesa). Fonte: MinC API SALIC. State-agnostic (UF env). |
| `scripts/ingest_sancoes.mjs` | ETL — Sanções a empresas/pessoas (CEIS + CNEP) via API do Portal da Transparência (CGU). CEIS = Empresas Inidôneas e Suspensas · CNEP = Empresas Punidas. Nacional, paginado (15/pág |
| `scripts/ingest_saneamento_sc.mjs` | ETL — Saneamento por município (SC), Censo 2022 IBGE via SIDRA: % de domicílios com água (rede geral), esgotamento adequado (rede/pluvial/fossa ligada) e lixo coletado. Casa com dé |
| `scripts/ingest_sazonalidade_preco_sc.mjs` | ⛔ DESATIVADO EM 15/07/2026 — NÃO RODAR. Script de jun/2026, código morto (a análise saiu do ar: comparava por valor TOTAL; foi refeita por VALOR UNITÁRIO). Faz `DROP TABLE sazonali |
| `scripts/ingest_sc.mjs` | Ingestão de dados OFICIAIS de Santa Catarina (SICONFI/Tesouro) para o banco. 295 municípios (lista IBGE) + Estado de SC. Anos 2021–2024. RREO Anexos 01 e 02. Idempotente (UPSERT).  |
| `scripts/ingest_senatran_frota_sc.mjs` | ETL — SENATRAN Frota de Veículos por município. Fonte: Ministério dos Transportes (gov.br/transportes, xlsx mensal). Pega DEZEMBRO de cada ano (estoque de fim de ano) → série. Casa |
| `scripts/ingest_setores_criancas_sc.mjs` | Adiciona % de CRIANÇAS (0-14) por setor censitário (demografia_BR: V01006=total, V01031+V01032+V01033=0-14) → setores_censitarios_sc + injeta no geojson do mapa. State-agnostic. |
| `scripts/ingest_setores_geo_sc.mjs` | Extrai a malha (polígonos) dos setores censitários do GPKG do IBGE → GeoJSON por município (simplificado) + densidade. Base do mapa choropleth intraurbano. |
| `scripts/ingest_setores_idade_sc.mjs` | Adiciona % de IDOSOS (60+) por setor censitário (demografia_BR: V01006=total, V01040=60-69, V01041=70+) → setores_censitarios_sc + injeta no geojson do mapa. State-agnostic. |
| `scripts/ingest_setores_sc.mjs` | IBGE Censo 2022 — dados por SETOR CENSITÁRIO (menor unidade): população, domicílios, densidade, bairro. Base do mapa intraurbano. Fonte: IBGE FTP Agregados por Setores. State-agnos |
| `scripts/ingest_sia_producao_sc.mjs` | ETL — SIA-SUS produção ambulatorial por município × complexidade. Fonte: DATASUS SIA (DBC) + SIGTAP (complexidade do procedimento). Complexidade: 1=Atenção Básica (equipes municipa |
| `scripts/ingest_sia_sc.mjs` | ETL — PRODUÇÃO ambulatorial (SIA/SUS) por município de SC, via TabNet/DATASUS. Qtd. aprovada e valor aprovado, por ano. Mesma técnica do SIH (tabcgi.exe, latin1, filtros TODAS_AS_C |
| `scripts/ingest_sih_sc.mjs` | ETL — PRODUÇÃO hospitalar (SIH/SUS) por município de SC, via TabNet/DATASUS. Internações e valor total, por ano (soma das 12 competências). 1 requisição traz todos os municípios. F |
| `scripts/ingest_sinan_agravos_sc.mjs` | ETL — SINAN agravos de notificação por município (residência), série. Fonte: DATASUS SINAN (DBC nacional, filtra SC). Usa _blast_dbc.mjs. Agravos: tuberculose, hanseníase, violênci |
| `scripts/ingest_sinan_dengue_sc.mjs` | ETL — SINAN arboviroses (dengue) por município. Fonte: InfoDengue (Fiocruz/UFMG), que usa notificações do SINAN. API alertcity por geocode (IBGE7), semanal → agrega por ano: casos, |
| `scripts/ingest_sinesp_sc.mjs` | ETL — SINESP/SENASP Vítimas de crimes violentos letais por município. Fonte: dados abertos Min. Justiça (SINESP), xlsx (1 aba/UF). DADOS ABERTOS AGREGADOS (autorizado). Vítimas por |
| `scripts/ingest_sinisa_sc.mjs` | ETL — SINISA (sucessor do SNIS) por município. Fonte: Ministério das Cidades (gov.br/cidades/.../sinisa/resultados-sinisa). Planilhas de indicadores por módulo (água/esgoto/resíduo |
| `scripts/ingest_siop_acoes.mjs` | ETL — Catálogo de Ações Orçamentárias do Governo Federal (SIOP, dados abertos, CSV público, sem auth). É o catálogo-mãe do que uma emenda pode financiar, por setor (Função). Nacion |
| `scripts/ingest_siops_sc.mjs` | ETL — SIOPS (Saúde): % da receita própria aplicada em ASPS conforme LC 141 (mínimo constitucional 15%). Fonte oficial: API pública SIOPS/Min. Saúde (indicador 3.2). co_municipio =  |
| `scripts/ingest_snis_residuos_sc.mjs` | ETL — SNIS RESÍDUOS SÓLIDOS por município, via app do Ministério das Cidades (mesmo wizard Yii/jqGrid da água/esgoto, módulo "Agrupamento dinâmico de indicadores"). Entrada pelo li |
| `scripts/ingest_snis_sc.mjs` | ETL — SNIS Água e Esgoto por município (desagregado por prestador), via app do Ministério das Cidades. Dirige o wizard Yii/jqGrid (app4.cidades.gov.br) e lê o grid completo. State- |
| `scripts/ingest_suas_saldo_sc.mjs` | SUAS — repasse do FNAS + SALDO em conta (recurso na mesa) por município. Fonte: MDS/SAGI (Solr misocial). State-agnostic (UF env). |
| `scripts/ingest_suas_sc.mjs` | ETL — Assistência social / FNAS por município de SC (MDS · MI Social / CadSUAS). Quantidade de CRAS, CREAS e unidades de acolhimento + população + repasse FNAS fundo-a-fundo. Base  |
| `scripts/ingest_tcems_software_house.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ ingest_tcems_software_house.mjs — o CADASTRO OFICIAL do ERP de cada um d |
| `scripts/ingest_tcesc_esfinge.mjs` | ESPELHO FIEL do e-Sfinge (TCE-SC) — o MODELO INTEIRO (17 tabelas, 205 campos, 36,2M linhas). O PNCP publica só o VENCEDOR; o TCE publica TODOS os licitantes, quem venceu CADA item, |
| `scripts/ingest_transferegov_api.mjs` | ETL — Transferegov API VIVA (PostgREST, fonte original autoritativa). Substitui o dump histórico do SICONV. 1) programas_transferegov: catálogo de programas + janela de proposta vo |
| `scripts/ingest_transferencias_cgu_sc.mjs` | Transferências federais ao GOVERNO MUNICIPAL (CGU/Portal da Transparência — download em massa, contorna a API 504/403). Regra de contaminação: só TIPO FAVORECIDO = "Administração P |
| `scripts/ingest_transferencias_sc.mjs` | Ingestão de Transferências da União / Convênios (Transferegov) via Portal da Transparência (CGU). Requer PORTAL_TRANSPARENCIA_KEY no .env.local. Idempotente (UPSERT por município). |
| `scripts/ingest_transferencias_stn.mjs` | ETL — Transferências obrigatórias da União por município (OFICIAL, STN/Tesouro Transparente CSV). FPM, FUNDEB, ITR, Lei Kandir (LC 87/96), CIDE, FEX, IOF-Ouro, LC 176. Soma os 12 m |
| `scripts/ingest_versao.mjs` | VERSÃO DO INGEST DA API — o estado de "já busquei" vive em itens_proc_feitos.versao.  COMO USAR: mudou O QUE se extrai da API (campo novo, entidade nova, correção de mapeamento), S |
| `scripts/ingest_votos_bancada_sc.mjs` | ETL — Votos de cada parlamentar da BANCADA por município (TSE, eleição 2022) p/ o targeting de emendas. Fonte: TSE votação nominal por município/zona 2022 (zip nacional; extrai só  |
| `scripts/ingest_votos_senadores_sc.mjs` | ETL — Votos dos SENADORES da bancada por município. Senador é eleito por eleição própria (2018/2022) e os SUPLENTES em exercício não têm votos próprios → usamos os votos do TITULAR |
| `scripts/join_escolas_inep.mjs` | — |
| `scripts/julga_bloco_llm.mjs` | O LLM JULGA O BLOCO — cirúrgico: 700 chars com a pergunta pronta, não 172 mil editais.  ═══ POR QUE O LLM E NÃO REGEX (provado em 15 casos reais, 2026-07-15) ═══ Empilhei regra em  |
| `scripts/keep_warm_neon.mjs` | KEEP-WARM do Neon — 1 ping leve (SELECT 1) que mantém o compute ACORDADO durante o horário comercial. Rodado a cada 4min (< suspend 300s) pela task "PNIGP-KeepWarm-Neon" das 08h às |
| `scripts/le_sites_municipais.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ le_sites_municipais.mjs — abre o SITE OFICIAL de cada município sem folh |
| `scripts/levanta_am_aam.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ levanta_am_aam.mjs — LEVANTAMENTO do portal da AAM (Associação Amazo |
| `scripts/levanta_aspec_folha_externa.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ levanta_aspec_folha_externa.mjs — para cada município ASPEC, segue o |
| `scripts/lib_contratacao_upsert.mjs` | MAPEAMENTO ÚNICO da entidade Contratação do PNCP → contratacoes_sc.  Existe porque o mesmo objeto chega por DOIS caminhos e o mapeamento não pode divergir entre eles:   · varredura |
| `scripts/limpa_camara_contaminada.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ limpa_camara_contaminada.mjs — apaga a folha da PREFEITURA que entro |
| `scripts/lote_do_item.mjs` | ITEM ↔ LOTE — a lógica, com testes.  ═══ O QUE O USUÁRIO ENSINOU (2026-07-16), e que muda tudo ═══ **O TR vem PRIMEIRO. O sistema publica DEPOIS.** O servidor digita os itens no si |
| `scripts/mapa_atas_plataformas.mjs` | MAPA DAS ATAS POR PLATAFORMA (SC) — artefato do estudo profundo de 2026-07-15. O tipo_documento do PNCP NÃO distingue a ata (joga quase tudo em "Outros Documentos"); o único discri |
| `scripts/mapa_cobertura_folha_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ mapa_cobertura_folha_uf.mjs — quantos municípios, por estado, têm o  |
| `scripts/mapa_folha_camaras.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ mapa_folha_camaras.mjs — o placar nacional da folha das CÂMARAS e a |
| `scripts/mapa_folha_nacional.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ mapa_folha_nacional.mjs — quantos dos 5.570 municípios têm folha nominal |
| `scripts/marca_destravada_por_rota.mjs` | O QUE A ROTA DESTRAVA — quanto de MARCA passa a ser alcançável depois do roteador v3. Separa o que é extraível JÁ (doc de resultado no acervo, custo zero, sem rede) do que vira FIL |
| `scripts/marca_estado_processo.mjs` | ESTADO da marca por processo (homologado c/ itens) — roteado pelo portal REAL. Mata o falso negativo: nunca "sem marca"; sempre CONFERIDA / doc-no-acervo / a-buscar[portal] / sem-r |
| `scripts/marca_folha_legislativo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ marca_folha_legislativo.mjs — acha e MARCA os municípios cuja folha  |
| `scripts/marca_participantes_comprasnet.mjs` | MARCAS PARTICIPANTES por item (Compras.gov / comprasnet) — captura TODAS as marcas que concorreram (vencedor + perdedores), ligadas à DESCRIÇÃO do item. Corpus descrição→marcas con |
| `scripts/marca_rota_feitas.mjs` | MARCADOR DE "FEITO" POR ROTA — substitui o marca_ata_feitas, que era chaveado só por processo.  ═══ O DEFEITO ═══ `marca_ata_feitas` tem PK (cnpj, ano, seq) e é COMPARTILHADO por c |
| `scripts/marca_tpl/_af_bnc.mjs` | — |
| `scripts/marca_tpl/_amostra2_betha_plat.mjs` | Amostra DIVERSA (estratificada por municipio) da celula Betha Sistemas, priorizando tipo=16 (Ata) e docs que TENHAM algum marcador de marca, para achar onde a marca vive. |
| `scripts/marca_tpl/_amostra2_bll_plat.mjs` | Amostra 2 — DISTINTA por processo, espalhada por municipios. Foco: docs que carreguem tabela de vencedores BLL ("Item: N ... Marca: M ... Valor Unit.: V") com marca REAL de produto |
| `scripts/marca_tpl/_amostra2_estado_sc.mjs` | — |
| `scripts/marca_tpl/_amostra2_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_amostra2_publica_plat.mjs` | Amostra DIRIGIDA por TÍTULO (evita full-scan): docs de RESULTADO/HOMOLOGAÇÃO da Pública Tecnologia, com itens. |
| `scripts/marca_tpl/_amostra3_bll_plat.mjs` | Amostra 3 — docs do template GOLD (Item:+Marca:+Valor Unit.:), UM por processo, espalhados por muitos municipios via md5(seq), para enxergar MARCAS REAIS de produto (nao so servico |
| `scripts/marca_tpl/_amostra3_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_amostra4_bll_plat.mjs` | Amostra 4 — FORA de Criciuma. Docs com 'marca', UM por processo, espalhados por 122 municipios. |
| `scripts/marca_tpl/_amostra5_bll_plat.mjs` | Amostra 5 — Criciuma, docs do template A (winner block) com MARCAS REAIS de produto. |
| `scripts/marca_tpl/_amostra_az_dispensa.mjs` | Amostra de exemplares para decifrar o template az/Dispensa (tipos 1,16,20) |
| `scripts/marca_tpl/_amostra_bbmnet.mjs` | Amostra exemplares da celula BBMNET — plataforma ILIKE '%BBMNET%'   (pega "Novo BBMNET Licitacoes" e "Bolsa Brasileira de Mercadorias - BBMNET Licitacoes") |
| `scripts/marca_tpl/_amostra_betha_plat.mjs` | Amostra exemplares da CELULA plataforma='Betha Sistemas' (a MAIOR: ~78.567 processos). Rota por contratacoes_sc.plataforma (nao pelo gerador, que costuma ser 'outro'). |
| `scripts/marca_tpl/_amostra_bll_plat.mjs` | Amostra exemplares da CELULA plataforma='BLL Compras' (~3.753 processos). Rota por contratacoes_sc.plataforma. Template GERADO da plataforma BLL — engenharia reversa. |
| `scripts/marca_tpl/_amostra_bnc.mjs` | Amostra exemplares da celula BNC — plataforma 'Bolsa Nacional De Compras - BNC' Amostra os PROCESSOS que TEM item Homologado (unit>0) E doc de resultado/ata com texto. |
| `scripts/marca_tpl/_amostra_compras_gov.mjs` | Amostra exemplares da celula Compras.gov.br (plataforma='Compras.gov.br', tipos 1,2,11,16,19,20) |
| `scripts/marca_tpl/_amostra_contrata_brasil.mjs` | — |
| `scripts/marca_tpl/_amostra_ecustomize_pregaoE.mjs` | AMOSTRA — decifra o template de portal_compras_publicas (Pregão Eletrônico, tipos 16,11,19) Puxa exemplares + itens da API, imprime trechos ao redor da tabela de itens e ancora nos |
| `scripts/marca_tpl/_amostra_ecustomize_srp.mjs` | AMOSTRA — decifra o template de portal_compras_publicas (SRP c.srp=true, tipos 11,19,16) Puxa exemplares + itens da API, imprime trechos ao redor da tabela de itens e ancora nos va |
| `scripts/marca_tpl/_amostra_estado_sc.mjs` | — |
| `scripts/marca_tpl/_amostra_governancabrasil.mjs` | Amostra exemplares da CELULA plataforma ILIKE 'Governançabrasil%'. Rota por contratacoes_sc.plataforma (nao pelo gerador, que costuma ser 'outro'). |
| `scripts/marca_tpl/_amostra_ipm_plat.mjs` | Amostra exemplares da CELULA plataforma='IPM Sistemas' (rota por contratacoes_sc.plataforma) |
| `scripts/marca_tpl/_amostra_jville_blu.mjs` | — |
| `scripts/marca_tpl/_amostra_licitacoes_bb.mjs` | — |
| `scripts/marca_tpl/_amostra_licitanet_plat.mjs` | Amostra exemplares da CELULA plataforma ILIKE 'Licitanet%' (~1.110 processos). |
| `scripts/marca_tpl/_amostra_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_amostra_outro_concorrP.mjs` | — |
| `scripts/marca_tpl/_amostra_outro_credenc.mjs` | — |
| `scripts/marca_tpl/_amostra_outro_dispensa.mjs` | — |
| `scripts/marca_tpl/_amostra_outro_inexig.mjs` | AMOSTRA — decifra o template de docs da célula outro_inexig (gerador 'outro', modalidade Inexigibilidade=9, tipos 1,16,20) Puxa exemplares + itens da API por processo. Imprime a ta |
| `scripts/marca_tpl/_amostra_outro_pregaoE.mjs` | Amostra exemplares da celula outro_pregaoE (Pregao Eletronico, gerador 'outro', tipos 16/11/19) |
| `scripts/marca_tpl/_amostra_outro_pregaoP.mjs` | AMOSTRA — celula outro_pregaoP (Pregao Presencial modalidade_id=7, gerador 'outro', tipos 16,11,19,1) Puxa exemplares + itens da API e imprime a vizinhanca da tabela de itens p/ en |
| `scripts/marca_tpl/_amostra_outro_srp.mjs` | — |
| `scripts/marca_tpl/_amostra_publica_plat.mjs` | Amostra exemplares da CELULA plataforma ILIKE 'Pública Tecnologia%'. Rota por contratacoes_sc.plataforma (nao pelo gerador, que costuma ser 'outro'). |
| `scripts/marca_tpl/_analisa2_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_analisa2_publica_plat.mjs` | — |
| `scripts/marca_tpl/_analisa3_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_analisa4_bll.mjs` | — |
| `scripts/marca_tpl/_analisa4_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_analisa5_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_analisa_az_dispensa.mjs` | — |
| `scripts/marca_tpl/_analisa_bbmnet.mjs` | — |
| `scripts/marca_tpl/_analisa_betha_plat.mjs` | Decifra os templates da celula plataforma='Betha Sistemas'. |
| `scripts/marca_tpl/_analisa_bll_plat.mjs` | — |
| `scripts/marca_tpl/_analisa_compras_gov.mjs` | — |
| `scripts/marca_tpl/_analisa_estado_sc.mjs` | — |
| `scripts/marca_tpl/_analisa_ipm_plat.mjs` | — |
| `scripts/marca_tpl/_analisa_licitanet_plat.mjs` | — |
| `scripts/marca_tpl/_analisa_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_analisa_publica_plat.mjs` | — |
| `scripts/marca_tpl/_analise2_outro_concorrP.mjs` | — |
| `scripts/marca_tpl/_analise3_outro_concorrP.mjs` | — |
| `scripts/marca_tpl/_analise_outro_concorrP.mjs` | — |
| `scripts/marca_tpl/_anchor_bbmnet.mjs` | — |
| `scripts/marca_tpl/_api_contrata_brasil.mjs` | Testa a 2a API do PNCP (consulta/dados) para itens+resultados de processos Contrata+Brasil, procurando qualquer campo de marca/fabricante no JSON. |
| `scripts/marca_tpl/_calib.mjs` | find procs (modalidade 7, gerador outro) that HAVE homologated API items AND a marca-column doc; check value match |
| `scripts/marca_tpl/_cat_licitanet_plat.mjs` | — |
| `scripts/marca_tpl/_censo_bnc.mjs` | — |
| `scripts/marca_tpl/_census2_bll.mjs` | — |
| `scripts/marca_tpl/_census3_bll.mjs` | — |
| `scripts/marca_tpl/_census4_bll.mjs` | Tally REAL do token apos "Marca:" em TODO o corpus BLL (colon template) e presenca de tabela de propostas "Autor Marca/Modelo". Distingue marca REAL de FP (servico/propria/prose). |
| `scripts/marca_tpl/_census_bll.mjs` | — |
| `scripts/marca_tpl/_conta_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_cov2_bbmnet.mjs` | — |
| `scripts/marca_tpl/_cov_bbmnet.mjs` | — |
| `scripts/marca_tpl/_cover_bnc.mjs` | — |
| `scripts/marca_tpl/_ctx2_estado_sc.mjs` | — |
| `scripts/marca_tpl/_ctx_az_dispensa.mjs` | — |
| `scripts/marca_tpl/_ctx_compras_gov.mjs` | — |
| `scripts/marca_tpl/_ctx_estado_sc.mjs` | — |
| `scripts/marca_tpl/_debug_match.mjs` | — |
| `scripts/marca_tpl/_diag_dom_estado_sc.mjs` | — |
| `scripts/marca_tpl/_dump.mjs` | — |
| `scripts/marca_tpl/_dump2_bbmnet.mjs` | — |
| `scripts/marca_tpl/_dump2_betha_plat.mjs` | — |
| `scripts/marca_tpl/_dump2_publica.mjs` | — |
| `scripts/marca_tpl/_dump_bbmnet.mjs` | — |
| `scripts/marca_tpl/_dump_betha_plat.mjs` | — |
| `scripts/marca_tpl/_dump_bll.mjs` | — |
| `scripts/marca_tpl/_dump_licitanet_tr.mjs` | — |
| `scripts/marca_tpl/_dump_one.mjs` | — |
| `scripts/marca_tpl/_dump_publica.mjs` | — |
| `scripts/marca_tpl/_extract_all_bbmnet.mjs` | — |
| `scripts/marca_tpl/_find_bnc.mjs` | — |
| `scripts/marca_tpl/_find_publica.mjs` | — |
| `scripts/marca_tpl/_forn_bnc.mjs` | — |
| `scripts/marca_tpl/_hunt2_licitanet_plat.mjs` | — |
| `scripts/marca_tpl/_hunt_az_dispensa.mjs` | — |
| `scripts/marca_tpl/_hunt_bbmnet.mjs` | Caça padroes "Marca/Modelo:" PREENCHIDO na celula BBMNET, em TODA a celula (nao so amostra) |
| `scripts/marca_tpl/_hunt_bll_plat.mjs` | — |
| `scripts/marca_tpl/_hunt_licitacoes_bb.mjs` | — |
| `scripts/marca_tpl/_hunt_marcafab.mjs` | — |
| `scripts/marca_tpl/_hunt_marcamodelo.mjs` | — |
| `scripts/marca_tpl/_ins_bnc.mjs` | — |
| `scripts/marca_tpl/_ipm_survey.mjs` | Survey IPM/Atende.Net homologation tables in the outro/PregaoPresencial population. |
| `scripts/marca_tpl/_marca_ctx.mjs` | — |
| `scripts/marca_tpl/_peek5.mjs` | — |
| `scripts/marca_tpl/_pop_survey.mjs` | — |
| `scripts/marca_tpl/_probe_betha_plat.mjs` | — |
| `scripts/marca_tpl/_probe_bnc.mjs` | — |
| `scripts/marca_tpl/_probe_col.mjs` | — |
| `scripts/marca_tpl/_probe_coluna.mjs` | Probe: docs da célula com padrão de COLUNA marca real (spec…marca…preço). Testa o parser neles. |
| `scripts/marca_tpl/_probe_estado_sc.mjs` | — |
| `scripts/marca_tpl/_probe_fill.mjs` | Measure marca-fill: for template-A docs, extract token(s) between unidade label and qtde |
| `scripts/marca_tpl/_probe_homolog.mjs` | — |
| `scripts/marca_tpl/_probe_marca.mjs` | — |
| `scripts/marca_tpl/_probe_pncp_marca_licitanet.mjs` | SONDA: a marca por item dos processos Licitanet e recuperavel por alguma API do PNCP? Testa /itens e /itens/{n}/resultados em AMBAS as bases (consulta/v1 e pncp/v1) para 5 processo |
| `scripts/marca_tpl/_probe_universo.mjs` | — |
| `scripts/marca_tpl/_rand_betha_plat.mjs` | — |
| `scripts/marca_tpl/_raw_bnc.mjs` | — |
| `scripts/marca_tpl/_rows.mjs` | — |
| `scripts/marca_tpl/_scan_estado_sc.mjs` | — |
| `scripts/marca_tpl/_scan_marca_col.mjs` | — |
| `scripts/marca_tpl/_sig_bnc.mjs` | — |
| `scripts/marca_tpl/_stud3.mjs` | — |
| `scripts/marca_tpl/_survey_betha_plat.mjs` | Survey: quais assinaturas de template existem na CELULA inteira (plataforma='Betha Sistemas') e quantos docs cada uma tem. So conta docs com itens homologados+preco (o universo cas |
| `scripts/marca_tpl/_survey_bll.mjs` | — |
| `scripts/marca_tpl/_survey_compras_gov.mjs` | — |
| `scripts/marca_tpl/_survey_contrata_brasil.mjs` | — |
| `scripts/marca_tpl/_survey_estado_sc.mjs` | — |
| `scripts/marca_tpl/_survey_ipm_plat.mjs` | Survey: across IPM plataforma cell, how often does the winner-doc carry a FILLED marca column that we can anchor to a homologated API item? |
| `scripts/marca_tpl/_survey_licitacoes_bb.mjs` | — |
| `scripts/marca_tpl/_survey_licitanet_plat.mjs` | — |
| `scripts/marca_tpl/_survey_publica.mjs` | — |
| `scripts/marca_tpl/_test_dom_estado_sc.mjs` | — |
| `scripts/marca_tpl/_tipo16_licitacoes_bb.mjs` | — |
| `scripts/marca_tpl/_valida.mjs` | — |
| `scripts/marca_tpl/_valida2_bbmnet.mjs` | — |
| `scripts/marca_tpl/_valida3_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_valida_az_dispensa.mjs` | — |
| `scripts/marca_tpl/_valida_bbmnet.mjs` | — |
| `scripts/marca_tpl/_valida_betha_plat.mjs` | VALIDA betha_plat.mjs contra docs reais da plataforma. Mede: itens homolog totais vs marcados; 10 exemplos. |
| `scripts/marca_tpl/_valida_bll.mjs` | Valida bll_plat.parse contra amostras locais E um pull grande fresco do banco. |
| `scripts/marca_tpl/_valida_bnc.mjs` | — |
| `scripts/marca_tpl/_valida_bnc_qr.mjs` | — |
| `scripts/marca_tpl/_valida_compras_gov.mjs` | — |
| `scripts/marca_tpl/_valida_contrata_brasil.mjs` | — |
| `scripts/marca_tpl/_valida_ecustomize_srp.mjs` | — |
| `scripts/marca_tpl/_valida_estado_sc.mjs` | — |
| `scripts/marca_tpl/_valida_governancabrasil.mjs` | — |
| `scripts/marca_tpl/_valida_ipm_plat.mjs` | Valida o parser ipm_plat nos exemplares: casa itens homologados vs marcas extraidas. |
| `scripts/marca_tpl/_valida_licitacoes_bb.mjs` | — |
| `scripts/marca_tpl/_valida_licitanet_plat.mjs` | — |
| `scripts/marca_tpl/_valida_outro_concorrE.mjs` | — |
| `scripts/marca_tpl/_valida_outro_concorrP.mjs` | — |
| `scripts/marca_tpl/_valida_outro_inexig.mjs` | VALIDA o parser outro_inexig.mjs em 60 docs (amostra determinística) + caracteriza templates. |
| `scripts/marca_tpl/_valida_outro_pregaoP.mjs` | — |
| `scripts/marca_tpl/_valida_outro_srp.mjs` | — |
| `scripts/marca_tpl/_valida_publica_plat.mjs` | — |
| `scripts/marca_tpl/az_dispensa.mjs` | PARSER DETERMINÍSTICO DE MARCA — célula: az_dispensa   portal (gerador): az   ·   modalidade: Dispensa (modalidade_id=8)   ·   tipos de documento: 1,16,20  DECIFRAÇÃO DO TEMPLATE ( |
| `scripts/marca_tpl/bbmnet.mjs` | Parser DETERMINISTICO de MARCA — celula: BBMNET (Bolsa Brasileira de Mercadorias)   plataforma ILIKE '%BBMNET%'  -> "Novo BBMNET Licitacoes" (243) + "Bolsa Brasileira de Mercadoria |
| `scripts/marca_tpl/betha_plat.mjs` | Parser DETERMINISTICO de MARCA — CELULA plataforma='Betha Sistemas' (a MAIOR: 78.567 processos). Roteada por contratacoes_sc.plataforma (NAO pelo gerador — 96% dos docs sao gerador |
| `scripts/marca_tpl/bll_plat.mjs` | Parser DETERMINISTICO de MARCA — celula: plataforma='BLL Compras' (~3.753 processos)  Engenharia reversa do TEMPLATE GERADO pela plataforma BLL (portal bll.org.br / "BLL Compras"). |
| `scripts/marca_tpl/bnc.mjs` | Parser DETERMINISTICO de MARCA — celula: BNC   plataforma = 'Bolsa Nacional De Compras - BNC' (~2.774 processos)  Engenharia reversa (amostra de 60 procs c/ item Homologado + varre |
| `scripts/marca_tpl/compras_gov.mjs` | Parser DETERMINISTICO de MARCA — celula: compras_gov   roteada por contratacoes_sc.plataforma='Compras.gov.br' (sistema federal Comprasnet / Compras.gov.br).   tipos doc 1,2,11,16, |
| `scripts/marca_tpl/contrata_brasil.mjs` | Parser deterministico de MARCA para a celula: plataforma='Contrata+Brasil'   (Contrata +Brasil = plataforma federal da Central de Compras / MGI)  CONCLUSAO DA ENGENHARIA REVERSA (6 |
| `scripts/marca_tpl/ecustomize_pregaoE.mjs` | PARSER DETERMINISTICO DE MARCA — celula ecustomize_pregaoE   portal (gerador): portal_compras_publicas · modalidade: Pregao Eletronico (modalidade_id=6) · docs tipo 16,11,19  TEMPL |
| `scripts/marca_tpl/ecustomize_srp.mjs` | Parser deterministico de MARCA para a celula: slug=ecustomize_srp   portal(gerador)='portal_compras_publicas' | modalidade=Registro de Precos (c.srp=true)   tipos_doc=11,19,16  (na |
| `scripts/marca_tpl/estado_sc.mjs` | Parser deterministico de MARCA — celula: estado_sc plataforma (gerador): 'Secretaria de Estado da Administração de Santa Catarina' (SEA-SC) universo: ~15.485 processos, ~74.373 ite |
| `scripts/marca_tpl/governancabrasil.mjs` | Parser DETERMINISTICO de MARCA — celula: plataforma ILIKE 'Governançabrasil%' (~6.148 processos).  ENGENHARIA REVERSA (amostra de 60 + varredura de assinaturas em toda a celula, 5. |
| `scripts/marca_tpl/ipm_plat.mjs` | PARSER DETERMINÍSTICO DE MARCA — célula plataforma='IPM Sistemas' (ERP atende.net / IPM Sistemas Ltda). Roteada por contratacoes_sc.plataforma='IPM Sistemas' (o "gerador" do texto  |
| `scripts/marca_tpl/licitacoes_bb.mjs` | Parser DETERMINISTICO de MARCA — celula: plataforma='Licitações-E BB' (Banco do Brasil, Licitações-e)   591 processos SC. Documentos no PNCP: apenas tipo_documento_id 2 (edital/TR/ |
| `scripts/marca_tpl/licitanet_plat.mjs` | Parser DETERMINISTICO de MARCA — celula: plataforma ILIKE 'Licitanet%' (Licitanet Licitacoes Eletronicas LTDA)   ~1.110 processos · 8.260 itens homologados c/ preco (725 processos) |
| `scripts/marca_tpl/outro_concorrE.mjs` | Parser deterministico de MARCA — celula: outro_concorrE portal (gerador): outro | modalidade: Concorrencia Eletronica (modalidade_id=4) tipos de documento: 16,11,19  ACHADO (engenh |
| `scripts/marca_tpl/outro_concorrP.mjs` | Parser deterministico de MARCA para a celula: outro_concorrP   portal (gerador): outro   |   modalidade: Concorrencia Presencial (modalidade_id=5)   tipos de documento: 16,11,19,1  |
| `scripts/marca_tpl/outro_credenc.mjs` | Parser deterministico de MARCA para a celula: outro_credenc portal (gerador): "outro" | modalidade: Credenciamento (modalidade_id=12) | tipos doc: 1,16,20  ENGENHARIA REVERSA (amos |
| `scripts/marca_tpl/outro_dispensa.mjs` | Parser deterministico de MARCA para a celula: slug=outro_dispensa   portal(gerador)='outro' | modalidade=Dispensa (modalidade_id=8) | tipos_doc=1,16,20  CONCLUSAO DA ENGENHARIA REV |
| `scripts/marca_tpl/outro_inexig.mjs` | PARSER DETERMINÍSTICO DE MARCA — célula outro_inexig   slug: outro_inexig · gerador 'outro' · modalidade Inexigibilidade (modalidade_id=9) · tipos doc 1,16,20  ACHADO DA ENGENHARIA |
| `scripts/marca_tpl/outro_pregaoE.mjs` | Parser DETERMINISTICO de MARCA — celula: outro_pregaoE   gerador='outro' · modalidade Pregao Eletronico (modalidade_id=6) · tipos doc 16,11,19  A marca do produto do VENCEDOR vive  |
| `scripts/marca_tpl/outro_pregaoP.mjs` | PARSER DETERMINISTICO DE MARCA — celula outro_pregaoP   modalidade: Pregao Presencial (modalidade_id=7) · gerador: 'outro' · tipos doc: 16,11,19,1  A "outro" nesta modalidade e um  |
| `scripts/marca_tpl/outro_srp.mjs` | Parser deterministico de MARCA por item — celula: outro_srp portal (gerador): 'outro' | modalidade: Registro de Precos (c.srp=true) | tipos doc: 11,19,16  A gerador 'outro' agrega  |
| `scripts/marca_tpl/publica_plat.mjs` | PARSER DETERMINÍSTICO DE MARCA POR ITEM — plataforma "Pública Tecnologia" (contratacoes_sc.plataforma ILIKE 'Pública Tecnologia%', ~11.835 processos). SEM rede / SEM LLM. Engenhari |
| `scripts/match_item_catmat.mjs` | CASAMENTO item→CATMAT (trigrama pg_trgm) — classifica CADA descrição normalizada de bem (chave) no melhor PDM do catálogo. É o RETRIEVER validado pelo estudo (gabarito coloquial de |
| `scripts/mede_folha_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ mede_folha_uf.mjs — quanto de uma UF já tem folha nominal, em municí |
| `scripts/mede_limpeza_recorte.mjs` | MEDIÇÃO — a limpeza de ruído tabular melhora o recorte, ou só parece melhorar? Não roda o pipeline inteiro: pega o que JÁ foi gravado (o recorte vencedor de cada item) e compara a  |
| `scripts/mede_links_folha_pi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ mede_links_folha_pi.mjs — abre CADA link de pessoal que já está em `site |
| `scripts/migra_contratacoes_pncp.mjs` | CONSOLIDAÇÃO espelhando o PNCP: compra_raiox_sc → contratacoes_sc (entidade Contratação canônica do PNCP), com a chave canônica numero_controle (numeroControlePNCP) como coluna ger |
| `scripts/migra_estado_parser.mjs` | ESTADO DE EXTRAÇÃO POR DOCUMENTO, COM VERSÃO DO PARSER.  POR QUE (bug real, 2026-07-15): o estado vivia em `marca_ata_feitas`, por PROCESSO e COMPARTILHADO entre os extratores. Qua |
| `scripts/motor_fundeb_sc.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ MOTOR FUNDEB — reconstrói, do zero e do dado oficial, quanto o FUNDE |
| `scripts/motor_notificacoes.mjs` | MOTOR DE DELTA das notificações — computa os alertas ATUAIS por município (SQL direto sobre as bases), gera uma chave_delta que captura o ESTADO do fato, e registra em notificacao_ |
| `scripts/mutirao_etl.mjs` | MUTIRÃO DE RECUPERAÇÃO DAS FONTES DE ETL — em 3 ondas, na ordem de quem sustenta o produto.   node scripts/mutirao_etl.mjs 1      (só a onda 1)   node scripts/mutirao_etl.mjs 1 2 3 |
| `scripts/normaliza_competencia_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ normaliza_competencia_folha.mjs — põe TODA competência de folha no p |
| `scripts/normaliza_marca_visao.mjs` | NORMALIZA marca_visao — determinístico, sem API. Separa marca REAL de fornecedor-no-campo e genérico. |
| `scripts/normaliza_participantes.mjs` | — |
| `scripts/padroes_casamento_tr.mjs` | PADRÕES do casamento API×TR — lê logs/analise_casamento_tr.jsonl e procura COMPORTAMENTOS: por plataforma, por tamanho, distribuição de cobertura/posição, ambiguidade. node scripts |
| `scripts/painel_rodada.mjs` | PAINEL DE ACOMPANHAMENTO DA RODADA COMPLETA — gera um HTML standalone (sem servidor, sem CDN) mostrando em que fase a rodada está, o que já terminou, o que falhou e o que ainda não |
| `scripts/parse_rotas.mjs` | — |
| `scripts/parser_ata_pcp.mjs` | PARSER DETERMINÍSTICO — tabela "Vencedores" do motor Portal de Compras Públicas (ECustomize, Betha, e outros que usam o mesmo layout). Extrai por linha: codigo, produto, cnpjFornec |
| `scripts/parser_az.mjs` | PARSER DETERMINÍSTICO — AZ INFORMATICA ("Resultados" / "FORNECEDORES CLASSIFICADOS"). Rotear por arquivo_texto_sc.gerador='az' (assinatura no texto), NÃO pela plataforma do PNCP ([ |
| `scripts/parser_az_resultados.mjs` | LEITOR DO "RESULTADOS" DA COMPRASBR (AZ) — escrito a partir da leitura INTEGRAL dos 1.425 documentos.  ═══ AS GRAMÁTICAS, medidas em 05/ago/2026 lendo cada documento do começo ao f |
| `scripts/parser_betha.mjs` | PARSER DETERMINÍSTICO — ATA NATIVA DO BETHA (AtaSessaoFinal/AtaTotal gerados pelo próprio Betha, NÃO pelo Portal). Rotear por arquivo_texto_sc.gerador='betha' — a `plataforma` do P |
| `scripts/parser_bll_resultados.mjs` | LEITOR DOS DOCUMENTOS DE RESULTADO DA PLATAFORMA BLL — ancorado em CNPJ + valor.  A seleção de quais documentos chegam aqui NÃO é deste arquivo: é de gerador_documento.mjs, que rec |
| `scripts/parser_contrato_arp.mjs` | LEITOR DE CONTRATO E ATA DE REGISTRO DE PREÇOS — ancorado em valor + quantidade, dirigido pelo ITEM.  ═══ O QUE ESTE DOCUMENTO É, E O QUE ELE NÃO É ═══ Contrato e ARP são documento |
| `scripts/parser_dispensa_termo.mjs` | PARSER DETERMINÍSTICO — TERMO DE DISPENSA / INEXIGIBILIDADE (modalidade_id 8/9/12). Rotear por arquivo_texto_sc: modalidade 8/9/12 + documento de homologação/razão da escolha/propo |
| `scripts/parser_ecustomize.mjs` | PARSER DETERMINÍSTICO — ECustomize/Portal Compras Públicas, tabela DETALHADA de propostas (todos os fornecedores). Cada registro de proposta tem âncoras fortes: CNPJ completo, data |
| `scripts/parser_edital_itens.mjs` | LEITOR DA ESPECIFICAÇÃO DO ITEM NO EDITAL — o cabeçalho de cada edital ESTABELECE o modelo daquele edital.  ═══ POR QUE ESTE LEITOR NÃO TEM UM MODELO EMBUTIDO ═══ Não existe padrão |
| `scripts/parser_ipm.mjs` | PARSER DETERMINÍSTICO — IPM Sistemas / atende.net (id do gerador: 'ipm'). Rotear por arquivo_texto_sc.gerador='outro' + assinatura no texto/título (a plataforma do PNCP só diz quem |
| `scripts/parser_licitar_digital.mjs` | PARSER DETERMINÍSTICO — LICITAR DIGITAL (arquivo_texto_sc.gerador='licitar_digital'). Rotear pelo `gerador` (assinatura no texto), NÃO pela plataforma do PNCP ([[mapa_atas_platafor |
| `scripts/parser_pcp_vencedores.mjs` | LEITOR DO QUADRO DE VENCEDORES DO PORTAL DE COMPRAS PÚBLICAS — dirigido pelo CABEÇALHO do documento.  ═══ O QUE A FORMAÇÃO DA ATA ENSINOU (05/ago/2026) ═══ O quadro não tem um form |
| `scripts/parser_publica.mjs` | PARSER DETERMINÍSTICO — "Pública" (id: publica) — Termo de Homologação e Adjudicação gerado pelo sistema de Compras da plataforma Betha ("Sistema: Compras", assinatura "verificador |
| `scripts/parser_termo_homologacao.mjs` | LEITOR DE TERMO DE HOMOLOGAÇÃO / ADJUDICAÇÃO / JULGAMENTO — ancorado em CNPJ + valor.  ═══ POR QUE ESTE LEITOR NÃO SE CHAMA "COMPRAS.GOV" ═══ Lendo na íntegra todos os documentos d |
| `scripts/parser_termo_municipal.mjs` | LEITOR DO TERMO DE HOMOLOGAÇÃO MUNICIPAL — coluna de marca POSICIONAL, delimitada pelo espelho.  ═══ ONDE ELE FOI ENCONTRADO ═══ Nos processos SEM ROTA (portal_real nulo, 120.852 p |
| `scripts/parser_versao.mjs` | VERSÃO DOS PARSERS — o estado de leitura vive no DOCUMENTO (arquivo_texto_sc.parser_versao), não num marcador.  COMO USAR: mexeu em QUALQUER parser (parser_az / parser_betha / pars |
| `scripts/passo_verificacao.mjs` | Passo de mentira, usado só pelas cadeias "teste" e "teste_falha" do runner. Não toca em banco nem em rede. Serve para provar, sem risco: que a ordem é respeitada, que o ambiente ve |
| `scripts/pdf_layout.mjs` | EXTRAÇÃO DE PDF PRESERVANDO A GEOMETRIA — a linha e a coluna da tabela sobrevivem ao texto.  ═══ POR QUE ISTO EXISTE ═══ A extração antiga usa `extractText(doc, {mergePages:true})` |
| `scripts/pncp_depae_assinaturas.mjs` | — |
| `scripts/pncp_docs_merenda.mjs` | — |
| `scripts/pncp_generos_assinaturas.mjs` | — |
| `scripts/pncp_http.mjs` | HTTP DO PNCP — um lugar só. **FALHA NUNCA VIRA ZERO.**  ═══ POR QUE EXISTE ═══ O mesmo defeito estava em 17 scripts do projeto, em três formas:   `if (!r.ok) return []`             |
| `scripts/portais_comportamento.mjs` | COMPORTAMENTO DE TODOS OS PORTAIS — registro único (detector + fetcher + parser de marca). Para CADA portal: como DETECTAR (regex no edital), como BUSCAR a ata (recipe do endpoint  |
| `scripts/preenche_memory_entidade.mjs` | A entidade do iLAI já vem embutida na URL descoberta: ilai.memory.com.br/#/entidades/login/97MJGH/1/ ou #/97R635/1/share?resource=... — extrair daí evita uma segunda varredura de 7 |
| `scripts/preenche_memory_entidade_candidato.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ preenche_memory_entidade_candidato.mjs — extrai o código de entidade |
| `scripts/probe_cadprev.mjs` | PROBE (read-only) — cataloga a superfície da API CADPREV (apicadprev.trabalho.gov.br). Para cada recurso: status HTTP, se exige dt_exercicio, nomes dos campos e o campo identificad |
| `scripts/probe_farol_folha.mjs` | probe_farol_folha.mjs — sonda 3: qual campo é FUNÇÃO, e quanto custa um município grande. |
| `scripts/probe_folha.mjs` | — |
| `scripts/probe_folha_tcema.mjs` | probe_folha_tcema.mjs — o TCE-MA entrega folha NOMINAL dos 217 municípios com lotação, cargo e salário? A API é Spring paginado (?page=&size=, devolve {content,totalElements}). Med |
| `scripts/probe_folha_tcs.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ probe_folha_tcs.mjs — MEDE quais tribunais de contas entregam folha  |
| `scripts/promove_diagnostico_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ promove_diagnostico_camara.mjs — leva o que o diagnóstico com navega |
| `scripts/prova_completude_emendas_fed.mjs` | PROVA DE COMPLETUDE (FONTE→BASE) — Emendas federais EXECUÇÃO (Portal da Transparência). Risco: o coletor só captura localidadeDoGasto no padrão "Cidade - SC"; emendas de SC com loc |
| `scripts/prova_real_emendas_fed.mjs` | PROVA REAL — o motor federal (getCaptacaoEmendasSC) não "esquece" dado? Concilia a BASE (emendas_execucao_sc / emendas_indicacao_sc) com o que o MOTOR projeta, linha a linha e valo |
| `scripts/prova_real_notificacoes.mjs` | PROVA REAL dos motores de notificação/risco — concilia o que o MOTOR gera (notificacao_log) com uma consulta INDEPENDENTE na base. Foco: (a) false-positive (motor flagou quem não d |
| `scripts/pull_dotacao_ano.mjs` | — |
| `scripts/pull_dotacao_merenda.mjs` | — |
| `scripts/pull_empenhos_2024.mjs` | — |
| `scripts/pull_empenhos_merenda.mjs` | — |
| `scripts/pull_folha34.mjs` | — |
| `scripts/pull_folha_depae.mjs` | — |
| `scripts/pull_folha_sessao.mjs` | — |
| `scripts/pull_folha_sme.mjs` | — |
| `scripts/pull_fonte_ano.mjs` | — |
| `scripts/pull_inep_cozinha.mjs` | — |
| `scripts/pull_orc.mjs` | — |
| `scripts/pull_trilha.mjs` | — |
| `scripts/qlik_carolina.mjs` | — |
| `scripts/qlik_daop.mjs` | — |
| `scripts/qlik_debug.mjs` | — |
| `scripts/qlik_depae_exato.mjs` | — |
| `scripts/qlik_depae_final.mjs` | — |
| `scripts/qlik_depae_nomes.mjs` | — |
| `scripts/qlik_depae_roster.mjs` | — |
| `scripts/qlik_diretorias.mjs` | — |
| `scripts/qlik_faltantes.mjs` | — |
| `scripts/qlik_farol.mjs` | — |
| `scripts/qlik_farol_poc.mjs` | — |
| `scripts/qlik_folha_depae.mjs` | — |
| `scripts/qlik_folha_full.mjs` | — |
| `scripts/qlik_jgua2.mjs` | — |
| `scripts/qlik_jgua_depae.mjs` | — |
| `scripts/qlik_jgua_folha_escolar.mjs` | Jaraguá do Sul — folha das merendeiras (quadro próprio), QUADRO ESCOLAR PURO. Uma passada: filtra cargos de alimentação, EXCLUI lotações de Assistência/Proteção Social, e devolve a |
| `scripts/qlik_jgua_fundeb.mjs` | — |
| `scripts/qlik_jgua_fundeb2.mjs` | — |
| `scripts/qlik_jgua_licit2.mjs` | — |
| `scripts/qlik_jgua_sme.mjs` | — |
| `scripts/qlik_katherine.mjs` | — |
| `scripts/qlik_licitacao_equipe.mjs` | — |
| `scripts/qlik_lotacoes.mjs` | — |
| `scripts/qlik_nomefinder.mjs` | — |
| `scripts/qlik_nutri.mjs` | — |
| `scripts/qlik_processo.mjs` | — |
| `scripts/recarimba_gerador.mjs` | RE-CARIMBA arquivo_texto_sc.gerador RODANDO OS PARSERS (não por assinatura de texto).  POR QUE: assinatura não prova leitura. Medido em 800 docs COM MARCA: a assinatura dizia "port |
| `scripts/reclassifica_host_candidato.mjs` | Reclassifica `folha_host_candidato` pela URL COMPLETA, agora que ela está gravada inteira.  ⭐ A prova costuma estar na própria URL — só é preciso lê-la com a assinatura certa:    ` |
| `scripts/reclassifica_produto_camara.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ reclassifica_produto_camara.mjs — reconhece o produto pela URL JÁ VI |
| `scripts/recon_folha1.mjs` | — |
| `scripts/reconstroi_view_folha_brasil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ reconstroi_view_folha_brasil.mjs — faz `vw_folha_municipal_brasil` e |
| `scripts/recorte_bloco.mjs` | RECORTE DO BLOCO DE SPEC — a fronteira do trecho que descreve UM item dentro do documento. Módulo próprio (e não uma função solta no enriquece_item_documento) porque o teste precis |
| `scripts/recover_dca.mjs` | Recuperação dos municípios SC sem RREO: usa a DCA (Declaração de Contas Anuais) do SICONFI. DCA-Anexo I-C (receita), I-D (despesa por categoria), I-E (despesa por função). node scr |
| `scripts/rederiva_fatia.mjs` | RE-DERIVA A FATIA — fecha o ciclo evento→espelho→derivada. Terceiro consumidor de pncp_evento.  O consumidor de DADO (consome_evento_dado.mjs) atualiza o ESPELHO da fatia (contrata |
| `scripts/redescobre_portal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ redescobre_portal.mjs — segunda passada para municípios cujo "portal |
| `scripts/redescobre_portal_js.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ redescobre_portal_js.mjs — 3ª passada: abre o site institucional COM |
| `scripts/redetecta_portal_faltantes.mjs` | RE-DETECTA o portal real nos processos que ficaram SEM ROTA (portal_real null) — inclui o que faltou: Estado de Santa Catarina (e-lic.sc.gov.br / SEA-SC) e reforço dos demais. Atua |
| `scripts/reextrai_layout.mjs` | RE-EXTRAÇÃO COM GEOMETRIA — reescreve `texto` preservando linha e coluna, no lugar do fluxo achatado.    node scripts/reextrai_layout.mjs                       # editais e TR (o de |
| `scripts/refina_descricao.mjs` | REFINO da descrição enriquecida — passe LEVE sobre app.item_enriquecimento (não re-varre os 12GB):  1) descricao_refinada = isola o segmento de SPEC que casa com o item, cortando p |
| `scripts/registra_betha_portal_por_hash.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ registra_betha_portal_por_hash.mjs — registra portais Betha achados  |
| `scripts/registra_portaltp_candidato.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ registra_portaltp_candidato.mjs — promove candidatos "portaltp" (ach |
| `scripts/relatorio_folha_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ relatorio_folha_uf.mjs — a entrega de uma UF: quem tem folha nominal |
| `scripts/relista_sem_documento.mjs` | RE-LISTAGEM FOCADA — re-busca /arquivos SÓ de processos que ficaram SEM nenhum documento no espelho. Ignora a flag arquivos_proc_feitos (que já os marcou "listados") e vai direto a |
| `scripts/remede_edital.mjs` | RE-MEDE a cobertura lendo o EDITAL (tipo 2), nos MESMOS processos de logs/analise_casamento_tr.jsonl. Testa a hipótese: o item vive no Edital (que embute os anexos — art. 25 §3), n |
| `scripts/render_custo.mjs` | — |
| `scripts/render_final.mjs` | — |
| `scripts/render_html.mjs` | — |
| `scripts/render_modulo.mjs` | — |
| `scripts/render_portfolio.mjs` | — |
| `scripts/repoll_arquivos_homologados.mjs` | RE-POLL DOS DOCUMENTOS — re-consulta /arquivos no PNCP para TODO processo homologado e traz o que não temos.  POR QUE PRECISA EXISTIR: `ingest_arquivos_sc.mjs` busca a lista de doc |
| `scripts/reprocessa_subcoletados.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ reprocessa_subcoletados.mjs — pega a fila que a PROVA REAL deixou gr |
| `scripts/rerank_llm.mjs` | RERANKER-LLM (estágio 2 do retrieve-then-rerank). O retriever trigrama dá top-k candidatos (recall@3=100% no gabarito de SC → o certo está lá); o LLM escolhe o correto usando TODO  |
| `scripts/reroteia_dominio.mjs` | RE-ROTEIA por DOMÍNIO + PRIORIDADE (v2) — corrige a co-citação e o ERP-relay. Problemas do v1: (a) entre docs multi-portal, o distinct on escolhia arbitrário; (b) Atende.net (IPM)  |
| `scripts/resolve_entidade_ipm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ resolve_entidade_ipm.mjs — devolve o NOME da entidade às linhas do I |
| `scripts/resolve_govbr_homonimo.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ resolve_govbr_homonimo.mjs — o host do GovBR sai do NOME (`webapp1-{ |
| `scripts/roda.mjs` | RUNNER ÚNICO DAS CADEIAS — um motor só, para todas.    node scripts/roda.mjs <cadeia>            executa   node scripts/roda.mjs <cadeia> --plano    só mostra o que faria, sem exec |
| `scripts/roda_extratores_acervo.mjs` | RODA TODA A BATERIA DETERMINÍSTICA sobre o que JÁ ESTÁ NO ACERVO — sem rede, sem portal, sem LLM. Alvo: os itens homologados cujo processo já tem o documento de resultado guardado  |
| `scripts/roda_extratores_acervo2.mjs` | BATERIA 2 — o RESTO dos extratores, sobre o acervo. Roda depois da bateria 1 (determinística de família), nunca junto: az/betha/ecustomize/portal_vencedores compartilham `marca_ata |
| `scripts/roda_extratores_acervo3.mjs` | BATERIA 3 — COLETA. Sai do acervo e vai ao portal buscar o documento que falta. `auditoria/enriquece_marca.mjs` é a espinha: fila (homologado sem marca) → rota (portal_real, bolsa> |
| `scripts/rota_marca.mjs` | A ROTA DA MARCA — um local só para decidir QUEM extrai a marca de cada processo.  ═══ O ERRO QUE ISTO CORRIGE ═══ Havia nove extratores, cada um varrendo o universo inteiro pelo SE |
| `scripts/rota_por_link.mjs` | PRECEDÊNCIA DO LINK — onde o PNCP diz o portal de realização, o PNCP manda.  `linkSistemaOrigem` é o ÚNICO campo do PNCP que carrega onde a disputa correu. Conferido em 05/ago/2026 |
| `scripts/rota_por_modalidade.mjs` | ROTEAMENTO POR MODALIDADE — a modalidade PREDIZ o que existe. Sem isto são 5 problemas diferentes empilhados.  ═══ POR QUE (medido 2026-07-15) ═══ Rodei 15 casos misturando obra, s |
| `scripts/roteia_portais_descobertos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ roteia_portais_descobertos.mjs — pega o que `descobre_portal_real.mj |
| `scripts/roteia_portal_amplo.mjs` | ROTEADOR AMPLO do portal de origem — ataca os "SEM ROTA" que o detector antigo não alcança:   (1) o detector só olhava doc 'Edital' → Dispensa/Inexig (sem edital, mas com Aviso/TR/ |
| `scripts/roteia_portal_v3.mjs` | ROTEADOR DE PORTAL v3 — resolve os processos homologados sem rota, RESPEITANDO a lei do ERP:   O portal que RODA a licitação é sempre um NÃO-ERP (bolsa/portal de disputa: PCP, BLL, |
| `scripts/roteia_portaltp.mjs` | alimenta erp_portal_municipal (a fonte de alvos do coletor PortalTP) com os portais descobertos |
| `scripts/run_extrai_texto_paralelo.mjs` | SUPERVISOR da extração de texto — sobe N processos SHARD-ados em paralelo (cada um numa thread de JS própria → paraleliza o parse de PDF, que é síncrono e travaria numa thread só). |
| `scripts/run_reextrai_paralelo.mjs` | SUPERVISOR da re-extração com geometria — N processos em fatias DISJUNTAS por hash. Cada shard é uma thread de JS própria: o parse de PDF é síncrono e travaria numa thread só. Mesm |
| `scripts/sanea_valor_item_tcesc.mjs` | VALOR DO ITEM/CONTRATO NO TCE — dono único do saneamento. Quem precisa de valor do TCE lê daqui.  O ERRO NA FONTE (medido em 04/ago/2026, provado contra âncora independente):   em  |
| `scripts/scan_js.mjs` | — |
| `scripts/scrape_siaps_qualidade.mjs` | SIAPS público — classificação oficial do Componente de Qualidade (novo cofinanciamento, Port. 3.493/2024) por município/equipe/faixa. API REST pública: POST apisiaps.saude.gov.br/a |
| `scripts/scrape_simad_programas.mjs` | Raspa a tabela oficial código→nome do dropdown p_programa do SIMAD (FNDE), para decodificar/agrupar os repasses. node scripts/scrape_simad_programas.mjs |
| `scripts/scrape_sisab_equipe.mjs` | Scraper JSF dedicado do SISAB RelValidacao — produção por EQUIPE (INE) e por ficha, POR MUNICÍPIO. Replica a sequência ViewState/AJAX: GET → ajax unidGeo=municipio → ajax estadoMun |
| `scripts/scrape_sisab_indicadores.mjs` | Scraper JSF do SISAB indicadorPainel — ISF + 7 indicadores Previne por município. Replica ViewState/AJAX. Uso: node scripts/scrape_sisab_indicadores.mjs [uf] [quadrimestre]   ex: n |
| `scripts/scrape_sisab_indicadores_todos.mjs` | Loop: ISF + 7 indicadores Previne por município (SISAB indicadorPainel), todos os municípios de uma UF, um quadrimestre. Uso: node scripts/scrape_sisab_indicadores_todos.mjs SC 202 |
| `scripts/scrape_sisab_serie.mjs` | Série histórica de produção da APS (SISAB RelValidacao) por município — modo Estado, todas as competências. Estado mode: unidGeo=estado + estados=SC + colunas=ibge+municipio (todas |
| `scripts/seed.mjs` | PNIGP — Seed de dados simulados realistas (Painel do Prefeito) Gera municípios, indicadores setoriais, série histórica, índices e metas. Uso: node scripts/seed.mjs   (lê DATABASE_U |
| `scripts/seed_compras.mjs` | PNIGP — Seed de Compras Públicas (municípios + estados). Métricas inspiradas no PNCP / Compras Gov, correlacionadas ao ICEB do ente. Uso: node scripts/seed_compras.mjs |
| `scripts/seed_contratacoes.mjs` | PNIGP — Seed de Contratações Públicas (estilo PNCP) — municípios + estados. Gera licitações/contratos individuais por ente. Uso: node scripts/seed_contratacoes.mjs |
| `scripts/seed_estados.mjs` | PNIGP — Seed de dados estaduais simulados (Painel do Governador) Reutiliza as definições da tabela `indicadores`. Uso: node scripts/seed_estados.mjs |
| `scripts/seed_financas.mjs` | PNIGP — Seed de Finanças Públicas (receitas e despesas) — municípios + estados. Inspirado no SICONFI/FINBRA. Valores em R$, correlacionados ao ICEB e à população. Uso: node scripts |
| `scripts/setup_notificacoes.mjs` | Fundação do sistema de NOTIFICAÇÕES — cria as 4 tabelas e popula a notificacao_regras com o catálogo (Secretaria × Natureza × Prazo). Idempotente (UPSERT). Tabelas NOVAS — não alte |
| `scripts/snis_explore.mjs` | EXPLORAÇÃO do SNIS desagregado (água/esgoto) — captura como as opções carregam + os códigos. node scripts/snis_explore.mjs |
| `scripts/sonda_aossoftware_scpi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_aossoftware_scpi.mjs — acha o módulo de TRANSPARÊNCIA (SCPI) n |
| `scripts/sonda_appm_servidores.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_appm_servidores.mjs — `transparencia.appm.org.br/{slug}/servidores |
| `scripts/sonda_dcfiorilli_porta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_dcfiorilli_porta.mjs — acha a PORTA e o CAMINHO reais do módul |
| `scripts/sonda_dcfiorilli_producao.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_dcfiorilli_producao.mjs — acha o host de PRODUÇÃO dos municípi |
| `scripts/sonda_eddydata.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_eddydata.mjs — mede o bloco EddyData ("Transparência Pública" |
| `scripts/sonda_folha_municipal.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_folha_municipal.mjs — VISITA cada município da UF e responde,  |
| `scripts/sonda_genexus_wwp.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_genexus_wwp.mjs — mede o tamanho do bloco GeneXus WorkWithPlu |
| `scripts/sonda_pi_folha_pagamento.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_pi_folha_pagamento.mjs — procura a tela `/transparencia/folha-paga |
| `scripts/sonda_pi_v2_json.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_pi_v2_json.mjs — o PIAUÍ tem DOIS layouts na tela /servidores, e a |
| `scripts/sonda_receitas_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_receitas_folha.mjs — bate TODAS as receitas de API que já domi |
| `scripts/sonda_ss_pessoal.mjs` | Mede se o portal S&S Informática entrega PESSOAL: abre "Pessoal Servidores" em N municípios do CE e varre competências. A prova é o dado aparecer, não o menu existir ([[pnigp-sonda |
| `scripts/sonda_tc_download_aberto.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ sonda_tc_download_aberto.mjs — o TCE-PB fechou a Paraíba inteira com |
| `scripts/stn_capture.mjs` | Captura as chamadas à API ARIA do Tesouro feitas pelo dashboard de Transferências Constitucionais. Objetivo: descobrir o endpoint de VALORES por município. node scripts/stn_capture |
| `scripts/supervisor_coleta.mjs` | SUPERVISOR auto-recuperável da coleta PNCP/SC. Um único processo é dono do ciclo de vida: roda cada ETL como filho, monitora o PROGRESSO REAL no Neon e, se estagnar (sem avanço por |
| `scripts/testa_api_doc.mjs` | — |
| `scripts/testa_entidade.mjs` | — |
| `scripts/testa_recente.mjs` | — |
| `scripts/testa_unidades.mjs` | — |
| `scripts/teste_confianca_enriquecimento.mjs` | ⚠️ ESTE TESTE DOCUMENTA UMA TENTATIVA REVERTIDA — ele NÃO trava o comportamento de produção.   node scripts/teste_confianca_enriquecimento.mjs  Em 08/ago tentei usar o grau MEDIDO  |
| `scripts/teste_guarda_pesquisa_preco.mjs` | TESTE da guarda de pesquisa de preço no roteador. Sem banco, sem rede.   node scripts/teste_guarda_pesquisa_preco.mjs      (sai 1 se algum caso falhar)  POR QUE ESTE TESTE EXISTE A |
| `scripts/teste_parser_termo_homologacao.mjs` | TESTE DE FRONTEIRA do parser_termo_homologacao — não precisa de banco nem de rede.   node scripts/teste_parser_termo_homologacao.mjs      (sai 1 se qualquer caso falhar)  POR QUE E |
| `scripts/teste_recorte_enriquecimento.mjs` | TESTE DE FRONTEIRA do recorte do enriquecimento. Sem banco, sem rede.   node scripts/teste_recorte_enriquecimento.mjs      (sai 1 se algum caso falhar)  POR QUE EXISTE Em 08/ago, 8 |
| `scripts/transferegov.mjs` | CLIENTE DA API DO TRANSFEREGOV — um lugar só para o contrato, porque ele acabou de mudar inteiro.  ═══ POR QUE ISTO EXISTE, E POR QUE AGORA ═══ Comunicado Transferegov nº 23/2026:  |
| `scripts/trava.mjs` | TRAVA PELA LINHA DE COMANDO — para as cadeias que são arquivos .cmd, e não um processo node só.  POR QUE existe: `trava_processo.mjs` serve a quem roda a cadeia inteira dentro de U |
| `scripts/trava_processo.mjs` | TRAVA DE PROCESSO — exclusão mútua entre rodadas longas (orquestrador de coleta, cadeia da marca...).  POR QUE NÃO É pg_advisory_lock. O DATABASE_URL aponta para o endpoint "-poole |
| `scripts/validacao_continua.mjs` | VALIDAÇÃO CONTÍNUA — auditor independente do coletor (só lê + flaga, nunca atrapalha a coleta). A cada INTERVALO: aplica regras de integridade, marca anomalias IMPOSSÍVEIS como sus |
| `scripts/validacao_estado_vazamento.mjs` | VALIDAÇÃO DE INTEGRIDADE — premissa: Estado e municípios NUNCA na mesma comparação municipal. O Estado de SC existe no banco (cod_ibge='42', tipo='E', p/ o motor de peças e futura  |
| `scripts/validar_consistencia.mjs` | Validação de consistência/integridade dos dados oficiais (SC) após os ETLs. Cobertura por base, duplicatas (vazamento de CNPJ compartilhado), conexões, e amostra planejado × contra |
| `scripts/validate_msc.mjs` | FASE 1 — validação MSC↔RREO. Baixa a MSC orçamentária completa de um ente/ano e procura a agregação que reproduz o empenhado/dotação do RREO. node scripts/validate_msc.mjs |
| `scripts/validate_msc_40.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ VALIDAÇÃO MSC × SICONFI — a PROVA de que a despesa que servimos bate |
| `scripts/validate_msc_multi.mjs` | FASE 1 (validação multi-município) — confirma que MSC conta 6.2.2.1.3.04 (empenhado) reconcilia com o RREO. |
| `scripts/validate_subfuncao_db.mjs` | VALIDAÇÃO pós-reingestão — confirma que o despesa_subfuncao_sc GRAVADO (anos fechados) bate com o RREO oficial ao vivo. node scripts/validate_subfuncao_db.mjs   (N combos município |
| `scripts/varre_admrh.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_admrh.mjs — procura o portal ADMRH (`/rhsysportaltransp/`) em  |
| `scripts/varre_admrh_thema.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_admrh_thema.mjs — procura o ADMRH hospedado na NUVEM DA THEMA  |
| `scripts/varre_aossoftware_ne.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_aossoftware_ne.mjs — cadastra como alvo SCPI os municípios cuj |
| `scripts/varre_aossoftware_todos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_aossoftware_todos.mjs — recolhe TODOS os links `aossoftware.co |
| `scripts/varre_bloco_host.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_bloco_host.mjs — dá o SALTO que o identificador de ERP não dá: |
| `scripts/varre_cidadesmg_whitelabel.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_cidadesmg_whitelabel.mjs — o CidadesMG (Síntese Tecnologia) t |
| `scripts/varre_crtsh_subdominios.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_crtsh_subdominios.mjs — acha o portal de folha pelo CERTIFICAD |
| `scripts/varre_dbseller.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_dbseller.mjs — procura o portal DBSeller (Angular + API PHP) n |
| `scripts/varre_elotech_oxy.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_elotech_oxy.mjs — procura o portal Elotech nos municípios aind |
| `scripts/varre_equiplano_porta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_equiplano_porta.mjs — acha o portal Equiplano dos municípios e |
| `scripts/varre_fiorilli_ms.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_fiorilli_ms.mjs — os 16 municípios de MS que o cadastro do TCE-MS  |
| `scripts/varre_fiorilli_ms2.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_fiorilli_ms2.mjs — 2ª passada nos municípios de MS ainda sem folha |
| `scripts/varre_govbr_host.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_govbr_host.mjs — procura o PRONIM/GovBR nos municípios ainda s |
| `scripts/varre_gpecloud.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_gpecloud.mjs — procura o GPE Cloud pelo molde `{pm}{slug}-tran |
| `scripts/varre_grp_menu_api.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_grp_menu_api.mjs — lê o MENU do portal GRP/Thema pela API JSON |
| `scripts/varre_menu_transparencia_pi.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_menu_transparencia_pi.mjs — em vez de ADIVINHAR o caminho da folha |
| `scripts/varre_multiproduto.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_multiproduto.mjs — último mutirão: para cada município sem fol |
| `scripts/varre_portal_folhas_al.mjs` | procura em AL o mesmo portal próprio de São Sebastião: `transparencia.{slug}.al.gov.br/servidores/folhas/servidores/` (PHP + DataTables server-side). Prova = a grade existir com os |
| `scripts/varre_portalfacil.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_portalfacil.mjs — procura o Portal Fácil (`/tpc_serv_nome_lis. |
| `scripts/varre_portalfacil_dadosabertos.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_portalfacil_dadosabertos.mjs — enumera o catálogo do Portal Fá |
| `scripts/varre_pronim_host.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_pronim_host.mjs — acha o host do PRONIM/GovBR dos municípios q |
| `scripts/varre_rodape_fornecedor.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_rodape_fornecedor.mjs — identifica o fornecedor do portal pelo |
| `scripts/varre_scpi_hospedado.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_scpi_hospedado.mjs — acha o SCPI (Fiorilli) hospedado em domín |
| `scripts/varre_sys523_hostporta.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_sys523_hostporta.mjs — procura a TELA DE FOLHA do sys523/CECAM |
| `scripts/varre_tc_folha_nacional.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ varre_tc_folha_nacional.mjs — a pergunta que nunca foi feita de forma si |
| `scripts/varredura_frescor.mjs` | Varredura de FRESCOR + SÉRIE HISTÓRICA — consulta as PRÓPRIAS tabelas (não o max_ano do catálogo, que engana): para cada tabela com coluna de ano/competência, calcula a série (min– |
| `scripts/verifica_competencia_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ verifica_competencia_folha.mjs — invariantes da COLUNA COMPETÊNCIA e |
| `scripts/verifica_dist.mjs` | — |
| `scripts/verifica_municipio_folha.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ verifica_municipio_folha.mjs — ENTRA em cada município que falta e t |
| `scripts/verifica_noite.mjs` | VERIFICA A NOITE — responde "rodou tudo certo?" por MEDIÇÃO, e falha ALTO quando não.   node scripts/verifica_noite.mjs           (sai 1 se houver qualquer ALERTA)   HORAS=24 node  |
| `scripts/verifica_publicacao_folha_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ verifica_publicacao_folha_uf.mjs — vai ao SITE DE CADA MUNICÍPIO e v |
| `scripts/visita_pi_servidores.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ visita_pi_servidores.mjs — visita CADA município do Piauí na tela `/serv |
| `scripts/warm_compras.mjs` | Pré-aquece o cache de compras (PNCP) das maiores cidades de SC + Estado, chamando a API de produção sequencialmente (usa o IP do Vercel). node scripts/warm_compras.mjs |
| `scripts/zera_marca.mjs` | ZERA A CONSTRUÇÃO DE MARCA E MODELO, para reconstruir com a extração roteada por portal.  POR QUE. Medido em 05/ago/2026: das 246.720 linhas de item_marca_sc, 36.322 têm UNIDADE DE |

## 2b. Componentes (visões e molde do produto)

| Componente | O que faz |
|---|---|
| `accountability-aps.tsx` | Calendário legal de prestação de contas (obrigações reais — base neutra, sem juízo). |
| `acesso-financeiro-sc.tsx` | Aba Sistema Financeiro — infraestrutura de acesso (agências/cooperativas/correspondentes) + movimento (Pix). |
| `acompanhamento-funcao.tsx` | ACOMPANHAMENTO por FUNÇÃO — orçado (dotação) × realizado (empenhado) até o bimestre vigente, por função. |
| `acompanhamento.tsx` | ACOMPANHAMENTO intra-anual — execução do orçamento até o bimestre vigente vs ritmo esperado (proporcional). |
| `alertas-notificacao.tsx` | Modelos de NOTIFICAÇÃO de alertas — e-mail, SMS e WhatsApp — gerados a partir dos alertas REAIS do município. |
| `analisador-documentos.tsx` | Analisador de Documentos — cola-se um edital/TR pronto e recebe análise de conformidade com alertas graduados por |
| `analise-compras-itens.tsx` | Análise de compras por ITEM (descritivo, sem CATMAT): onde o município paga acima dos pares de SC (economia potencial) |
| `analise-educacao.tsx` | Análise #80 — cruza o GARGALO (IDEB abaixo da meta) com o RECURSO (FNDE recebido) e sugere a AÇÃO/pleito. |
| `analise-saude.tsx` | Análise #80 (saúde) — cruza GARGALO (indicadores de APS abaixo dos pares / mínimo de 15%) com RECURSO (FNS) e AÇÃO. |
| `assunto-atencao-primaria.tsx` | o que o numerador conta (a "produção" de cada indicador) |
| `assunto-captacao.tsx` | índice de criticidade da oportunidade por prazo até o fim da janela (urgência de agir) |
| `assunto-iegm.tsx` | conhecimento de cada dimensão (o que mede + como melhorar + cruzamento com nossos dados) |
| `atas-painel.tsx` | Atas de Registro de Preço — visão própria (preço registrado + quantidade máxima; gasto real = empenhos contra a ata). |
| `auditoria-lazy.tsx` | Auditoria sob demanda: o `diag` (~2,6 MB) é buscado via API ao abrir a aba (não vai no HTML inicial), |
| `baixar-csv.tsx` | Botão reutilizável de exportação CSV — leva o dado para a LOA/LDO, requerimentos, planilhas (recomendação do |
| `banco-precos.tsx` | PROTÓTIPO — Banco de Preços: busca por descrição sobre preços de referência (compras municipais SC + BPS saúde). |
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
| `construtor-processo.tsx` | Construtor de Processo Licitatório (Lei 14.133/2021) — o ciclo completo sobre uma CESTA DE ITENS compartilhada. |
| `construtor-tr.tsx` | Construtor de Termo de Referência (Lei 14.133/2021) — MVP do módulo "processo licitatório perfeito". |
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
| `eti-plano-documento.tsx` | Documento IMPRIMÍVEL do Plano de Expansão da ETI — gerado pelo sistema com os dados reais do município, |
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
| `mapa-ambiental.tsx` | Análise ambiental por município — mapa coroplético de SC (desmatamento PRODES ou focos INPE), com o município em destaque |
| `mapa-coropletico.tsx` | Mapa coroplético (MapLibre) — municípios de SC pintados por intensidade (desmatamento km² ou focos de queimada). |
| `mapa-leaflet.tsx` | Renderizador do mapa (Leaflet). Client-only — carregado via next/dynamic(ssr:false) pelo wrapper, |
| `mapa-maplibre.tsx` | Renderizador do mapa (MapLibre GL — WebGL/GPU). Client-only (via next/dynamic ssr:false). |
| `mapa-setores-wrap.tsx` | Wrapper client do mapa intraurbano com LAZY-LOAD: o GeoJSON (até ~1 MB) só é buscado quando |
| `mapa-setores.tsx` | Mapa choropleth INTRAURBANO — setores censitários pintados por variável selecionável (densidade populacional |
| `matriculas-card.tsx` | Matrículas (Censo Escolar) — a "produção" da cadeia da educação (💰 financiamento → 🏭 matrículas → ❤️ IDEB). |
| `metodologia-itens.tsx` | Nota metodológica ÚNICA (fonte de verdade) sobre como os itens de compra são tratados: |
| `minuta-loa.tsx` | MINUTA DA LOA — apresenta a sugestão do motor no formato OFICIAL (articulado + anexos da Lei 4.320/64 + LRF), |
| `mislabel-unidade.tsx` | Alerta de UNIDADE TROCADA no lançamento — item cujo preço/unidade básica destoa ≥100× da mediana do grupo (CATMAT+base). |
| `msc-despesa.tsx` | MSC ANCORADA AO RREO — despesa empenhada por natureza (pessoal/custeio/investimento) e por fonte (livres×vinculados). |
| `munic-gestao.tsx` | IBGE MUNIC — instrumentos de gestão do município (planos, conselhos, fundos, instrumentos legais). |
| `nota-tecnica-catmat.tsx` | Nota Técnica pública e versionada do Banco de Preços / classificação CATMAT-CATSER — torna auditável a cadeia |
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
| `pme-projeto-documento.tsx` | Documento IMPRIMÍVEL — "Projeto de Elaboração/Revisão do Plano Municipal de Educação (PME)". |
| `ppa-programa.tsx` | PPA por programa — detalhamento da despesa por FUNÇÃO → SUBFUNÇÃO (orçado×executado), o nível programático |
| `processo-fases.tsx` | CONTADOR POR FASE do processo licitatório. Lê /api/processo-fases/[codigo] (tabela processo_fase_sc). |
| `projetos-elegiveis.tsx` | Motor de projetos elegíveis — cruza os programas federais curados (programas_federais_sc) com as áreas em que o |
| `radar-crp-sc.tsx` | Bloco dedicado do Governo do Estado (ente próprio, com RPPS/CRP própria) — separado dos municípios. |
| `red-flags-fornecedores.tsx` | RED FLAGS DE FORNECEDORES — sinais de risco de integridade por fornecedor: concentração de mercado, sanção vigente |
| `repasses-saude-ficha.tsx` | Programas/repasses da saúde no MOLDE do Previne: o que é · por que importa · série · como melhorar. |
| `repasses-stn.tsx` | Repasses da União por município — matriz MENSAL + total anual por repasse + soma de todos (STN/Tesouro). |
| `resolver-alertas.tsx` | Resolver alertas — fecha o ciclo do serviço: o gestor marca um alerta como resolvido (e informa o impacto: |
| `resumo-compras.tsx` | Resumo executivo da aba Compras — 4 números-chave para o gestor leigo bater o olho. Tom neutro. |
| `resumo-executivo.tsx` | separa conformidade (legal) de desempenho (relativo): conformidade OK + posição ruim NÃO é "tudo bem" |
| `sazonalidade-preco.tsx` | Melhor mês de compra por grupo de produtos (SC). Índice relativo: 100 = preço típico; <100 = mais barato que o normal. |
| `sobrepreco-compras.tsx` | COMPRAS POR PREÇO UNITÁRIO — itens em que o município pagou acima da mediana de SC (e, quando há, da referência |
| `tce-apontamentos.tsx` | o TCE grava esta tipologia como identificador cru, sem rótulo legível; as outras 22 vêm em português |
| `termo.tsx` | Glossário central — explica siglas/jargão para o gestor não-técnico (público-alvo do PNIGP). |
| `variacao-interna.tsx` | VARIAÇÃO INTERNA DE PREÇOS — o próprio município comprou o mesmo item a preços diferentes. |
| `vies-previsao.tsx` | PROTÓTIPO — Viés de previsão de receita (semente do motor de sugestão de peças orçamentárias). |

## 3. Fontes de dados (catálogo de coleta)

| Fonte | Provedor | Ano + recente | Última coleta | Situação |
|---|---|---|---|---|
| Outorgas de uso da água por município (ANA, finalidade+série) | ana | — | há 14d | em dia |
| Barragens por município (ANA/SNISB — dano potencial + risco) | ana | 2025 | há 5h | em dia |
| Banda larga fixa por município (ANATEL, série 2007+) | anatel | — | há 5h | em dia |
| Geração distribuída de energia por município (ANEEL, série) | aneel | — | há 11d | em dia |
| CFEM — royalties de mineração por município (ANM, distribuição) | anm | 2026 | há 14d | em dia |
| Preços de combustíveis por município (ANP, semestral, série 2004+) | anp | 2021 | há 14d | em dia |
| Vendas de combustíveis por município (ANP, série 1990+) | anp | 2024 | há 5h | em dia |
| Cobertura de planos de saúde por município (ANS — pressão sobre o SUS) | ans | 2026 | há 14d | em dia |
| CMED/Anvisa PMVG — preço-teto legal de medicamentos (Conformidade Gov, auto-descobre URL); referência nacional p/ sobrepreço em saúde (SC = ICMS 17%) | anvisa | 2025 | há 19d | em dia |
| Desastres S2ID por município (Atlas Digital CEPED-UFSC/MIDR, série 1991+) | atlas | — | há 5h | em dia |
| IDHM + subíndices por município (Atlas Brasil PNUD, Censo 2010) | atlasbrasil | 2025 | há 14d | em dia |
| Sistema financeiro por município (BCB Olinda — agências/cooperativas/correspondentes + Pix série) | bcb | — | há 19d | em dia |
| ESTBAN — volumes bancários por município (BCB, crédito/poupança, série) | bcb | — | há 19d | em dia |
| PRONAF / Crédito Rural por município — valor contratado por ano (BCB SICOR/Matriz do Crédito Rural, OData; cdEstado=25) | bcb | 2025 | há 5h | em dia |
| BNDES desembolsos por município (crédito produtivo, série 1995+) | bndes | 2026 | há 14d | em dia |
| Espelho completo CADPREV (37 recursos: DAIR/DIPR/DRAA/RPPS_*) | cadprev | — | há 26d | em dia |
| Alertas de CRP (transições vencido/a vencer — varredura) | cadprev | — | há 5h | em dia |
| Déficit atuarial RPPS (CADPREV/DRAA) | cadprev | — | há 7d | em dia |
| Regularidade previdenciária CRP (CADPREV — Consulta Pública) | cadprev | — | há 5h | em dia |
| Equipamentos SUAS — fallback de geo por CEP (AwesomeAPI) | cadsuas | — | há 2h | pendente |
| Equipamentos SUAS — endereço/telefone (CadSUAS detalhe, HTTP) | cadsuas | — | há 5h | em dia |
| Equipamentos SUAS — geocodificação (Nominatim/OSM por endereço) | cadsuas | — | há 5h | em dia |
| Equipamentos SUAS por unidade (CadSUAS, Playwright): CRAS/CREAS/Centro POP/Acolhimento + nome/nº | cadsuas | — | há 5h | em dia |
| Estações de monitoramento de risco CEMADEN por município (defesa civil) | cemaden | 2025 | há 5h | em dia |
| Transferências (CGU) | cgu | — | há 5h | em dia |
| Transferências federais à prefeitura (CGU download em massa) | cgu | 2025 | há 5h | em dia |
| Habitação — MCMV (Minha Casa Minha Vida), unidades financiadas por município (Min. Cidades, gov.br/cidades — sem WAF); alimenta o casamento oportunidade×necessidade | cidades | 2025 | há 14d | em dia |
| Saneamento SINISA por município (água/esgoto/resíduos, Min. Cidades, ref 2024) | cidades | 2024 | há 14d | em dia |
| CNES — rede de saúde (Min. Saúde) | cnes | 2026 | há 5h | em dia |
| Unidades de conservação por município (MMA CNUC, interseção PostGIS) | cnuc | — | há 14d | em dia |
| Catálogo oficial CATMAT/CATSER (Compras.gov.br) — espinha de classificação | compras | — | há 5h | em dia |
| Referência NACIONAL de preços por CATMAT (Painel de Preços/Compras.gov.br), por unidade e por forma (avulso×escala) — enriquece o Banco de Preços e o sobrepreço | compras | 2025 | há 2h | pendente |
| PAA compras agricultura familiar por município (Conab) | conab | 2025 | há 5h | em dia |
| Bancada federal do estado (deputados + senadores) p/ módulo de Captação de Emendas — APIs Câmara + Senado | congresso | 2025 | há 19d | em dia |
| Lei Paulo Gustavo execução/saldo por município (MinC) | cultura | 2025 | há 5h | em dia |
| Comunidades quilombolas certificadas por município (Palmares) | cultura | — | há 5h | em dia |
| Lei Rouanet SALIC — aprovado/captado por município (MinC) | cultura | 2025 | há 16d | em dia |
| APAC oncologia e diálise por município (SIA-APAC) | datasus | — | há 5h | em dia |
| Equipamentos médicos por estabelecimento (CNES EQ) | datasus | 2024 | há 14d | em dia |
| Equipes de saúde (ESF) por município/estabelecimento (CNES EP) | datasus | 2024 | há 14d | em dia |
| Estabelecimentos de saúde por município (CNES — rede p/ regulação, API DEMAS) | datasus | 2025 | há 5h | em dia |
| Leitos hospitalares por estabelecimento (CNES LT) | datasus | 2024 | há 14d | em dia |
| Profissionais de saúde por município/estabelecimento (CNES PF) | datasus | 2024 | há 5h | em dia |
| Medicamentos de alto custo CEAF por município (SIA grupo 06) | datasus | — | há 5h | em dia |
| Previne Brasil — indicadores APS (SISAB) | datasus | — | há 19d | em dia |
| Saúde mental CAPS/RAAS por município (SIA-RAAS-PS) | datasus | — | há 5h | em dia |
| SIA — produção ambulatorial (DATASUS) | datasus | 2025 | há 5h | em dia |
| Produção ambulatorial SUS por complexidade (DATASUS SIA + SIGTAP) | datasus | — | há 14d | em dia |
| Internações SUS por município (DATASUS SIH DBC mensal) | datasus | 2024 | há 14d | em dia |
| SIH — produção hospitalar (DATASUS TabNet) | datasus | 2025 | há 5h | em dia |
| Óbitos por município (DATASUS SIM, descompressor DBC próprio) | datasus | 2026 | há 14d | em dia |
| Agravos de notificação SINAN por município (tuberculose/hanseníase/violência) | datasus | 2024 | há 14d | em dia |
| Nascimentos por município (DATASUS SINASC DBC) | datasus | 2026 | há 14d | em dia |
| Apresentação Camada 2 (descrição → quantidade do conteúdo p/ itens-container); derivado de itens_sc + Camada 1, via SQL | derivado | 2025 | há 12d | em dia |
| Apresentação Camada LLM (Haiku extrai qtd do resíduo ambíguo, com abstenção); derivado, usa ANTHROPIC_API_KEY + cache | derivado | 2025 | há 5h | em dia |
| Apresentação Camada 1 (rótulo → unidade básica + fator de desempacotamento); derivado de itens_sc, via SQL | derivado | 2025 | há 5h | em dia |
| Compras por ente/ano — DERIVADA do espelho (contratacoes_sc, sem re-fetch) | derivado | 2026 | há 2h | pendente |
| Red-flag de unidade trocada no lançamento — item que destoa ≥100× da mediana do grupo CATMAT+base (efeito colateral do Passe 2); derivado | derivado | 2025 | há 5h | em dia |
| Referência por UNIDADE BÁSICA (Passe 2) — CATMAT+base+forma, mediana + curadoria IQR (IN 65 art.6); derivado de itens_sc + item_catmat_map + apresentação | derivado | 2025 | há 2h | pendente |
| Análise de compras por PREÇO UNITÁRIO — livro de preços de referência de SC + sobrepreço por município (derivado de itens_sc, via SQL) | derivado | 2025 | há 19d | em dia |
| Red flags de fornecedores — concentração + sanção (CEIS/CNEP) + sobrepreço por fornecedor (derivado de contratos/itens/sancoes, via SQL) | derivado | 2025 | há 19d | em dia |
| Re-derivação por fatia (evento → derivadas do ente) | derivado | 2025 | há 2h | pendente |
| Indícios de sobrepreço em medicamentos (compras do município vs teto legal PMVG, por substância+dosagem); derivado de cmed_pmvg + itens_sc | derivado | 2025 | há 14d | em dia |
| Reconstrução do sobrepreço com DUPLO benchmark — mediana de SC + referência nacional + desvio/CV (IN 65); derivado de itens_sc + precos_referencia_sc + precos_nacional_ref | derivado | 2025 | há 18d | em dia |
| Variação INTERNA de preços — mesmo município comprou o mesmo item a preços diferentes (derivado de itens_sc, via SQL) | derivado | 2025 | há 19d | em dia |
| Bolsa Atleta por município (Min. Esporte — atletas + valor) | esporte | 2025 | há 2h | pendente |
| Matrículas FUNDEB oficiais (FNDE Antonieta de Barros) | fnde | 2026 | há 14d | em dia |
| Parâmetros FUNDEB — fatores/VAAT/VAAR (FNDE) | fnde | 2026 | há 14d | em dia |
| PDDE por município (FNDE — Plataforma Antonieta de Barros) | fnde | 2024 | há 14d | em dia |
| PDDE saldo parado (verba escolar não executada) por município (FNDE Antonieta de Barros) | fnde | 2025 | há 5h | em dia |
| PNAE % agricultura familiar (mínimo legal 30%) por município (FNDE) | fnde | 2025 | há 5h | em dia |
| PNLD reserva técnica — demanda de livros (FNDE — Antonieta de Barros) | fnde | 2025 | há 19d | em dia |
| Repasses federais FNS por bloco (Consulta Consolidada) | fns | 2026 | há 14d | em dia |
| Autos de infração ambiental por município (IBAMA, série 1990+) | ibama | — | há 19d | em dia |
| Áreas embargadas por município (IBAMA CSV) | ibama | — | há 5h | em dia |
| Agricultura e agricultura familiar por município — Censo Agropecuário 2017 (IBGE/SIDRA t/6778+6883): estabelecimentos + área, familiar vs não-familiar | ibge | 2025 | há 5h | em dia |
| Taxa de alfabetização 15+ Censo 2022 (IBGE SIDRA 9543) | ibge | 2025 | há 5h | em dia |
| População por cor/raça Censo 2022 (IBGE SIDRA 9605) | ibge | 2025 | há 14d | em dia |
| Domicílios + densidade domiciliar Censo 2022 (IBGE SIDRA 4712) | ibge | 2025 | há 5h | em dia |
| Georreferência dos entes (centroide/área/região — IBGE malhas; base p/ frete e variação de preço) | ibge | 2025 | há 5h | em dia |
| Indicadores (IBGE/CGU) | ibge | 2024 | há 15d | em dia |
| População indígena (IBGE Censo 2022) | ibge | — | há 5h | em dia |
| IBGE MUNIC — instrumentos de gestão (planos/conselhos/fundos/instrumentos legais) por município, da BASE DE DADOS oficial (xlsx), não SIDRA | ibge | 2025 | há 13d | em dia |
| PIB municipal preços correntes + per capita (IBGE SIDRA 5938) | ibge | 2025 | há 5h | em dia |
| População por faixa etária Censo 2022 + idosos/dependência (IBGE SIDRA 9514) | ibge | 2025 | há 5h | em dia |
| Saneamento por município (água/esgoto/lixo) — IBGE Censo 2022 via SIDRA (cobertura por domicílio) | ibge | 2025 | há 14d | em dia |
| Setores censitários Censo 2022 — perfil intraurbano (IBGE FTP) | ibge | 2025 | há 5h | em dia |
| % crianças 0-14 por setor → variável do mapa intraurbano (IBGE demografia) | ibge | 2025 | há 14d | em dia |
| Malha (polígonos) dos setores → mapa choropleth (IBGE GPKG) | ibge | 2025 | há 13d | em dia |
| % idosos por setor censitário → variável do mapa intraurbano (IBGE demografia) | ibge | 2025 | há 14d | em dia |
| Museus por município (IBRAM MuseusBr) | ibram | 2025 | há 14d | em dia |
| Assentamentos reforma agrária por município (INCRA/MDA SIPRA) | incra | — | há 5h | em dia |
| Censo Escolar — matrículas (INEP Sinopse) | inep | 2025 | há 13d | em dia |
| Educação especial/AEE por município (INEP Censo microdata) | inep | 2025 | há 5h | em dia |
| Número de turmas por etapa/rede (INEP Censo Escolar) | inep | 2025 | há 5h | em dia |
| Escolas por município + infraestrutura (INEP Censo Escolar) | inep | 2025 | há 13d | em dia |
| Taxa de evasão por etapa (INEP Fluxo/Transição) | inep | 2025 | há 46d | em dia |
| FNDE liberações por município (SIMAD, Playwright) | inep | 2025 | há 5h | em dia |
| IDEB — indicadores educacionais (INEP) | inep | 2025 | há 14d | em dia |
| Indicadores educacionais INEP (AFD/TDI/ATU/rendimento por município) | inep | 2025 | há 13d | em dia |
| Indicadores INEP por escola (georreferenciado) | inep | 2025 | há 13d | em dia |
| SAEB proficiência Port/Mat por etapa (INEP) | inep | 2025 | há 5h | em dia |
| Arboviroses (dengue/zika/chikungunya) por município (InfoDengue/SINAN) | infodengue | 2025 | há 4d | em dia |
| Dengue por município (SINAN via InfoDengue, série + incidência) | infodengue | 2025 | há 5d | em dia |
| Desmatamento PRODES por município (INPE, interseção PostGIS) | inpe | 2025 | há 14d | em dia |
| Focos de calor por município (INPE BDQueimadas, mensal) | inpe | 2026 | há 1d | em dia |
| IEGM — qualidade da gestão (TCE-SC/IRB, dados abertos) | irb | 2025 | há 14d | em dia |
| Cobertura vacinal SÉRIE 2015-2026 por município/vacina (SI-PNI LocalizaSUS, engine Qlik set-analysis) | localizasus | 2026 | há 5h | em dia |
| CAF — Cadastro Nacional da Agricultura Familiar (ex-DAP) por município: nº de agricultores familiares (MDA, XLSX mensal) | mda | 2025 | há 19d | em dia |
| IGD-M gestão PBF/CadÚnico por município (MDS/SAGI Solr) | mds | — | há 5h | em dia |
| SUAS repasse+SALDO na mesa por município (MDS/SAGI Solr) — recurso não usado | mds | 2025 | há 19d | em dia |
| Guardião de frescor (série + última competência) | meta | — | há 0h | em dia |
| Saldo de empregos formais por município (Novo CAGED/MTE, mensal) | mte | 2026 | há 19d | em dia |
| RAIS — estoque de emprego formal por município (MTE, anual) | mte | 2025 | há 13d | em dia |
| Novo PAC obras por município (ObrasGov/Casa Civil) | obrasgov | 2025 | há 9d | em dia |
| Obras por município — detalhe (ObrasGov) | obrasgov | 2025 | há 14d | em dia |
| Equipamentos esportivos georreferenciados (OSM — mapa camada Esporte) | osm | — | há 14d | em dia |
| Equipamentos segurança/justiça/defesa civil georreferenciados (OSM + SAP/SC): polícia, bombeiros, defesa civil, prisional, socioeducativo | osm | — | há 14d | em dia |
| Atas de Registro de Preço (PNCP Consulta) | pncp | — | há 19d | em dia |
| Classificação dos itens → CATMAT/CATSER (dicionário, matcher v2) | pncp | — | há 1d | pendente |
| Busca diária do PNCP (compras/contratos/atas — ano corrente) | pncp | — | há 21h | em dia |
| Contratos (PNCP ano corrente, append) | pncp | 2027 | há 37d | pendente |
| Empenhos por contrato (PNCP Lei 14.133 — acende quando publicarem) | pncp | — | há 16d | pendente |
| Consumo de eventos → espelho (a fatia que o evento aponta) | pncp | 2025 | há 2h | pendente |
| Coleta incremental PNCP — o que mudou (enche a fila de eventos) | pncp | 2025 | há 5h | em dia |
| Itens de TODOS os processos (preço unitário) | pncp | 2025 | há 19d | em dia |
| Notas fiscais / instrumentos de cobrança (PNCP — acende quando publicarem) | pncp | — | há 14d | em dia |
| PCA (PNCP) | pncp | — | há 4h | em dia |
| Preço de referência por item (mediana SC) + classificação ata/efetivada — base da análise de preços | pncp | 2025 | há 61d | em dia |
| Contratações PNCP — TODAS (entidade Contratação espelhando o PNCP: modalidade/plataforma/SRP/estimado×homologado; via bulk por data) | pncp | 2025 | há 19d | em dia |
| Sazonalidade de preço por categoria (melhor mês de compra, SC) | pncp | 2025 | há 60d | em dia |
| Acidentes em rodovias federais por município (PRF DATATRAN, série 2015+) | prf | 2025 | há 19d | em dia |
| Localidade dos fornecedores (CNPJ→UF/município) | receita | — | há 19d | em dia |
| Arrecadação federal por município (RFB, série 2019+) | rfb | 2025 | há 14d | em dia |
| Frota de veículos por município (SENATRAN) | senatran | 2025 | há 14d | em dia |
| Qualidade (15 indicadores) + Vínculo/CVAT — novo cofinanciamento (SIAPS) | siaps | 2025 | há 5h | em dia |
| CAR — Cadastro Ambiental Rural: nº de imóveis rurais por município (SICAR GeoServer WFS, contagem por município) | sicar | 2025 | há 14d | em dia |
| Acompanhamento intra-anual da execução (RREO do bimestre vigente) — receita prevista×realizada e despesa orçada×empenhada por município | siconfi | 2025 | há 15d | em dia |
| Acompanhamento por função (intra-anual) — orçado×realizado por função até o bimestre vigente (RREO Anexo 02 parcial) | siconfi | 2025 | há 15d | em dia |
| CNPJs do governo municipal (SICONFI+órgãos+RPPS) | siconfi | 2025 | há 15d | em dia |
| Despesa por subfunção (RREO an.2 — drill) | siconfi | 2025 | há 5h | em dia |
| Finanças (SICONFI RREO an.1/2) | siconfi | 2025 | há 5h | em dia |
| Metas Fiscais LDO (RREO an.6) | siconfi | 2025 | há 5h | em dia |
| MSC ancorada ao RREO — despesa empenhada por natureza e fonte (forma da MSC × total exato do RREO; reconcilia por construção) | siconfi | 2025 | há 15d | em dia |
| Receitas detalhadas (ICMS/FPM/IPTU/FUNDEB — RREO an.3) | siconfi | 2025 | há 5h | em dia |
| Pessoal/DCL (RGF) | siconfi | 2025 | há 4d | em dia |
| Previdência RPPS (RREO Anexo 04) | siconfi | 2025 | há 5h | em dia |
| Educação/RCL (RREO an.14/3) | siconfi | 2025 | há 5h | em dia |
| Salário-Educação por município (SICONFI DCA) | siconfi | 2025 | há 14d | em dia |
| Estatísticas vitais por município (IBGE Registro Civil — nascidos/óbitos, série) | sidra | 2024 | há 18d | em dia |
| Produção agropecuária (PAM/PPM) + empresas (CEMPRE) por município (IBGE SIDRA) | sidra | — | há 14d | em dia |
| Vítimas de crimes violentos letais por município (SINESP/MJSP, dados abertos) | sinesp | — | há 49d | em dia |
| Catálogo de Ações Orçamentárias Federais (SIOP dados abertos) — o que emenda financia por setor; cruza com acao_orcamentaria da indicação | siop | 2025 | há 14d | em dia |
| Saúde ASPS (SIOPS) | siops | 2025 | há 5h | em dia |
| Indicadores Previne + ISF (SISAB indicadorPainel — 10 quadrimestres) | sisab | 2025 | há 14d | em dia |
| Produção da APS (SISAB — fichas aprovadas, série mensal 2021+) | sisab | 2025 | há 19d | em dia |
| SNIS Água/Esgoto por município e prestador (atendimento, perdas, tratamento) — app Ministério das Cidades via Playwright; state-agnostic (UF/ANO) | snis | 2025 | há 14d | em dia |
| CAPAG capacidade de pagamento por município (STN/Tesouro) | tesouro | — | há 5h | em dia |
| Regularidade fiscal CAUC/CADIN (Tesouro) | tesouro | — | há 2h | pendente |
| Ranking da Qualidade da Informação Fiscal (Tesouro) por município | tesouro | 2025 | há 14d | em dia |
| Transferências da União por município, MENSAL (FPM/FUNDEB/ITR/Lei Kandir/CIDE/FEX/IOF/LC176) — CSV oficial STN/Tesouro Transparente; NACIONAL, state-agnostic (UF env) | tesouro | 2025 | há 14d | em dia |
| Precatórios por município (estoque e quantidade) — API do TJSC, Regime Especial de Precatórios; replicável por UF (CNJ Res. 303) | tjsc | 2025 | há 5h | em dia |
| Assistência social COMPLETA (MDS MI Social): série anual de repasse FNAS 2005→ + CadÚnico + Bolsa Família | transferegov | 2025 | há 14d | em dia |
| Convênios e contratos de repasse por município (SICONV/Transferegov, repositório detru — proposta+convenio) | transferegov | 2025 | há 25d | em dia |
| Emendas — INDICAÇÃO (SICONV/Transferegov, repositório detru: parlamentar, impositivo, valor destinado) | transferegov | 2025 | há 14d | em dia |
| Emendas — EXECUÇÃO orçamentária federal (Portal da Transparência: empenhado×pago → recurso na mesa) | transferegov | 2026 | há 5h | em dia |
| Elegibilidade dos programas (Transferegov: quem pode captar cada programa — base do casamento oportunidade×necessidade) | transferegov | 2025 | há 14d | em dia |
| Catálogo de programas Transferegov — gestão ágil (fundoafundo/programa_gestao_agil); complementa o catálogo unificado de 335 programas | transferegov | 2025 | há 5h | em dia |
| Programas federais curados de saúde/educação (Novo PAC, Requalifica UBS, Proinfância — casamento com carência; FNS/FNDE sem feed) | transferegov | 2025 | há 5h | em dia |
| Radar de Captação — programas + planos (Transferegov fundo a fundo, API viva) | transferegov | 2025 | há 5h | em dia |
| Assistência social / FNAS por município (MDS · MI Social/CadSUAS: CRAS, CREAS — déficit p/ casamento) | transferegov | 2025 | há 5h | em dia |
| Sanções a empresas/pessoas (CEIS + CNEP) — API Portal da Transparência; cruza com fornecedores (fornecedor sancionado) | transparencia | 2025 | há 4d | em dia |

## 4. Rotas e APIs (Next.js)

- `/`
- `/api/andamento-compras/[codigo]`
- `/api/auditoria-diag/[codigo]`
- `/api/banco-precos`
- `/api/caderno-emendas`
- `/api/cmed-pmvg`
- `/api/coleta-status`
- `/api/comparar`
- `/api/compras-item/[cnpj]/[ano]/[seq]`
- `/api/compras-sc/[codigo]`
- `/api/contratos-processo/[cnpj]/[ano]/[seq]`
- `/api/equipamentos-geo/[codigo]`
- `/api/etl-catalogo`
- `/api/inteligencia-item`
- `/api/modelo`
- `/api/notificacao-acao`
- `/api/notificacao-cadastro`
- `/api/plano-trabalho`
- `/api/preco-referencia/[q]`
- `/api/processo-fases/[codigo]`
- `/api/serie-anotacao`
- `/api/setores-geo/[codigo]`
- `/api/tce-processo/[cnpj]/[ano]/[seq]`
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

- status: **ok** · registros suspeitos (excluídos): 6 · sobrepreço unitário: 19083

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
