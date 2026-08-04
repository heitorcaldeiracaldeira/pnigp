# MODELO e-Sfinge TCE-SC · AppLicitacoesExterno · 17 tabelas · 2026-08-04


## LinkTable — 11.737.085 linhas · 44 campos
   cpf_cnpj  ·  201.545 valores distintos  [CHAVE]
   identificador_sfi_processo_licitatorio  ·  1.080.094 valores distintos  [CHAVE]
   idparticipante  ·  961.498 valores distintos  [CHAVE]
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   identificador_unidade  ·  1.700 valores distintos
   nome_unidade  ·  1.700 valores distintos
   descricao_poder_orgao  ·  6 valores distintos
   identificador_ente  ·  358 valores distintos
   nome_ente  ·  358 valores distintos
   nome_ente_uf  ·  295 valores distintos
   regiao  ·  16 valores distintos
   macroregiao  ·  9 valores distintos
   descricao_tipo_esfera  ·  2 valores distintos
   indicativo_exclusividade_me_epp  ·  2 valores distintos
   identificador_unidade_licitacao  ·  1.626 valores distintos
   nome_unidade_licitacao  ·  1.626 valores distintos
   nome_participante_rfb  ·  124.313 valores distintos
   descricao_tipo_pessoa  ·  4 valores distintos
   CPF_CNPJ_Incognito  ·  136.939 valores distintos
   identificador_unidade_contrato  ·  1.664 valores distintos
   nome_unidade_contrato  ·  1.664 valores distintos
   tipo_contrato_geral  ·  12 valores distintos
   nome_rfb  ·  133.606 valores distintos
   iditem  ·  3.855.468 valores distintos
   descricao_item_licitacao  ·  2.085.683 valores distintos
   descricao_unidade_medida  ·  4.329 valores distintos
   numero_sequencial_item  ·  8.181 valores distintos
   numero_lote  ·  1.461 valores distintos
   quantidade_item_licitado  ·  55.185 valores distintos
   sem_cotacao  ·  1 valores distintos
   identificador_cotacao  ·  10.047.847 valores distintos
   iditem_cotacao  ·  3.855.468 valores distintos
   descricaoitem_cotacao  ·  2.085.683 valores distintos
   id_participante_cotacao  ·  953.202 valores distintos
   cpf_cnpj_participante  ·  129.049 valores distintos
   quantidade_item_cotado  ·  55.729 valores distintos
   numero_sequencial_item_cotacao  ·  8.181 valores distintos
   valor_total_cotado_item  ·  1.441.520 valores distintos
   indicativo_vencedor  ·  2 valores distintos
   unidademedidacotacao  ·  4.329 valores distintos
   numero_ordem_classificacao  ·  302 valores distintos
   valor_orcado_item_cotacao  ·  176.017 valores distintos
   quantidade_item_licitacao_cotacao  ·  55.185 valores distintos
   valor_orcado_item  ·  171.564 valores distintos

## ChavesQP — 8.173.976 linhas · 2 campos
   chave  ·  4.086.988 valores distintos  [CHAVE]
   cpf_cnpj  ·  201.545 valores distintos  [CHAVE]

## Publicidade — 5.025.766 linhas · 4 campos
   identificador_sfi_processo_licitatorio  ·  1.080.094 valores distintos  [CHAVE]
   data_publicacao  ·  11.195 valores distintos
   descricao_tipo_meio_comunicacao  ·  14 valores distintos
   nome_veiculo_comunicacao  ·  58.110 valores distintos

## quadro_participantes — 4.086.988 linhas · 12 campos
   chave  ·  4.086.988 valores distintos  [CHAVE]
   participante1_cpf_cnpj  ·  146.814 valores distintos
   participante1_cpf_cnpj_formatado  ·  146.814 valores distintos
   participante1_nome  ·  141.113 valores distintos
   participante1_venceu_itens  ·  3.648 valores distintos
   participante1_perdeu_itens  ·  6.024 valores distintos
   participante2_cpf_cnpj  ·  146.814 valores distintos
   participante2_nome  ·  141.113 valores distintos
   participante2_venceu_itens  ·  3.648 valores distintos
   quantidade_total_itens  ·  5.268 valores distintos
   participante2_perdeu_itens  ·  6.024 valores distintos
   quantidade_total_licitacoes  ·  646 valores distintos

## ArquivoTextoLicitacao — 1.262.311 linhas · 5 campos
   identificador_sfi_processo_licitatorio  ·  1.080.094 valores distintos  [CHAVE]
   url_arquivo_sigma  ·  1.250.573 valores distintos
   nome_arquivo  ·  880.243 valores distintos
   descricao_natureza_arquivo_texto  ·  48 valores distintos
   indicativo_sigilo_orcamento_texto  ·  2 valores distintos

## Trilhas — 1.000.156 linhas · 8 campos
   idparticipante  ·  961.498 valores distintos  [CHAVE]
   idparticipanteaux  ·  42.708 valores distintos
   tipologia  ·  22 valores distintos
   observacao  ·  35.292 valores distintos
   numero_tipologia  ·  18 valores distintos
   cpf_cnpj_trilha  ·  19.581 valores distintos
   nome_trilha  ·  19.372 valores distintos
   campo_auxiliar  ·  325 valores distintos

## Participantes — 961.363 linhas · 6 campos
   idparticipante  ·  961.498 valores distintos  [CHAVE]
   descricao_tipo_unidade_licitacao  ·  11 valores distintos
   nome_participante_sfinge  ·  204.865 valores distintos
   possui_cotacao  ·  2 valores distintos
   data_hora_inicio_transmissao_participante  ·  379.561 valores distintos
   data_inicio_transmissao_participante  ·  1.770 valores distintos

## ArquivoTextoContrato — 752.531 linhas · 4 campos
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   url_arquivo_sigma_contrato  ·  738.871 valores distintos
   nome_arquivo_contrato  ·  602.639 valores distintos
   descricao_natureza_arquivo_texto_contrato  ·  27 valores distintos

## LinkTableContrato — 696.777 linhas · 13 campos
   idContratoFilho  ·  348.476 valores distintos  [CHAVE]
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   idContratoPai  ·  367.800 valores distintos  [CHAVE]
   codigo_registro_contrato  ·  654.014 valores distintos
   data_assinatura  ·  3.996 valores distintos
   data_vencimento  ·  6.343 valores distintos
   descricao_objetivo  ·  310.995 valores distintos
   numero_contrato  ·  251.312 valores distintos
   ultima_situacao_obra  ·  9 valores distintos
   ultimo_ano_mes_medicao  ·  91 valores distintos
   ultimo_ano_mes_situacao_obra  ·  71 valores distintos
   data_hora_inicio_transmissao_contrato  ·  1.834 valores distintos
   contrato_com_despesa  ·  2 valores distintos

## Item_contrato — 505.870 linhas · 9 campos
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   id_item_contratado  ·  497.710 valores distintos
   descricao_item_contratado  ·  248.291 valores distintos
   descricao_unidade_medida_contratado  ·  1.710 valores distintos
   valor_unitario_contratado  ·  161.804 valores distintos
   numero_sequencial_item_contratado  ·  1.109 valores distintos
   valor_total_contratado  ·  205.977 valores distintos
   tipo_item  ·  2 valores distintos
   quantidade_item_contratado  ·  20.491 valores distintos

## Medicao — 456.822 linhas · 5 campos
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   ano_mes  ·  110 valores distintos
   data_medicao  ·  2.563 valores distintos
   numero_medicao  ·  399.905 valores distintos
   valor_medicao  ·  270.824 valores distintos

## ProcessoLicitatorio — 409.691 linhas · 64 campos
   identificador_sfi_processo_licitatorio  ·  1.080.094 valores distintos  [CHAVE]
   data_atualizacao_sigma  ·  1 valores distintos
   identificador  ·  409.691 valores distintos
   numero_processo_licitatorio  ·  0 valores distintos
   numero_edital  ·  91.026 valores distintos
   data_limite_entrega_propostas  ·  0 valores distintos
   nome_responsavel_juridico  ·  0 valores distintos
   data_aprovacao_acessoria_juridica  ·  0 valores distintos
   descricao_objeto_licitacao  ·  369.615 valores distintos
   data_abertura_certame  ·  2.274 valores distintos
   data_planilha_custos  ·  0 valores distintos
   data_pesquisa  ·  0 valores distintos
   descricao_orgao_referencia_preco  ·  0 valores distintos
   data_homologacao  ·  2.030 valores distintos
   valor_garantia_proposta  ·  0 valores distintos
   cpf_pregoeiro  ·  0 valores distintos
   cpf_pregoeiro_formatado  ·  1 valores distintos
   competencia  ·  33 valores distintos
   identificador_tipo_objeto_licitacao  ·  10 valores distintos
   descricao_tipo_objeto_licitacao  ·  10 valores distintos
   identificador_sfi_comissao_licitacao  ·  1 valores distintos
   identificador_tipo_cotacao  ·  3 valores distintos
   descricao_tipo_cotacao  ·  3 valores distintos
   identificador_modalidade_licitacao  ·  16 valores distintos
   descricao_modalidade_licitacao  ·  16 valores distintos
   identificador_sfi_texto_juridico  ·  409.691 valores distintos
   numero_legislacao  ·  90.998 valores distintos
   descricao_ementa  ·  363.857 valores distintos
   identificador_tipo_texto_juridico  ·  1 valores distintos
   descricao_tipo_texto_juridico  ·  1 valores distintos
   identificador_tipo_licitacao  ·  19 valores distintos
   descricao_tipo_licitacao  ·  19 valores distintos
   identificador_tipo_natureza_licitacao  ·  14 valores distintos
   descricao_tipo_natureza_licitacao  ·  14 valores distintos
   codigo_tipo_natureza_licitacao  ·  14 valores distintos
   codigo_unidade  ·  1.626 valores distintos
   codigo_ente  ·  358 valores distintos
   associacao  ·  21 valores distintos
   modulo_sfinge  ·  1 valores distintos
   data_homologacao_pregoeiro  ·  0 valores distintos
   indicativo_registro_preco  ·  0 valores distintos
   indicativo_ambito_internacional  ·  0 valores distintos
   identificador_responsavel  ·  0 valores distintos
   indicativo_parecer_juridico_favoravel  ·  0 valores distintos
   indicativo_propositura_recurso  ·  0 valores distintos
   indicativo_propositura_impugnacao  ·  0 valores distintos
   indicativo_realizacao_despesas  ·  0 valores distintos
   identificador_situacao_processo_licitatorio  ·  0 valores distintos
   descricao_situacao_processo_licitatorio  ·  0 valores distintos
   identificador_especificacao_ramo_obra_servico_engenharia  ·  11 valores distintos
   data_prevista_publicacao  ·  2.335 valores distintos
   descricao_especificacao_ramo_obra_servico_engenharia  ·  11 valores distintos
   identificador_remessa_online  ·  409.691 valores distintos
   codigo_registro  ·  409.681 valores distintos
   indicativo_sigilo_orcamento  ·  2 valores distintos
   status  ·  8 valores distintos
   processo_com_despesa  ·  2 valores distintos
   processo_reenviado  ·  2 valores distintos
   data_hora_inicio_transmissao_licitacao  ·  1.783 valores distintos
   descricao_especificacao_ramo_obras_servico_engenharia  ·  8 valores distintos
   descricao_especificacao_ramo_concessoes_servico_engenharia  ·  7 valores distintos
   descricao_objeto_licitacao_concessao  ·  363 valores distintos
   Ano Certame  ·  19 valores distintos
   valor_total_previsto  ·  210.874 valores distintos

## ContratoFilhos — 348.479 linhas · 3 campos
   idContratoFilho  ·  348.476 valores distintos  [CHAVE]
   tipo_contrato  ·  12 valores distintos
   valor_contrato_filho  ·  153.963 valores distintos

## ContratoPai — 348.306 linhas · 7 campos
   idContratoPai  ·  367.800 valores distintos  [CHAVE]
   valor_contrato_superior  ·  156.731 valores distintos
   data_assinatura_superior  ·  2.674 valores distintos
   data_vencimento_superior  ·  5.082 valores distintos
   descricao_objetivo_superior  ·  214.122 valores distintos
   numero_contrato_superior  ·  82.762 valores distintos
   descricao_tipo_unidade_contrato  ·  11 valores distintos

## SituacaoObra — 250.378 linhas · 4 campos
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   ano_mes_situacao  ·  107 valores distintos
   descricao_tipo_situacao_obra_servico_engenharia  ·  9 valores distintos
   ultimo_mes  ·  2 valores distintos

## TipologiaContrato — 162.142 linhas · 11 campos
   idcontrato  ·  798.658 valores distintos  [CHAVE]
   cpf_cnpj_trilha_contratos  ·  27.037 valores distintos
   data_assinatura_contrato_tipologia  ·  6.256 valores distintos
   valor_contrato_tipologia  ·  62.323 valores distintos
   data_hora_inicio_transmissao_tipologia_contrato  ·  91.111 valores distintos
   nome_unidade_tipologia_contrato  ·  1.647 valores distintos
   nome_ente_tipologia_contrato  ·  351 valores distintos
   observacao_contrato  ·  95.146 valores distintos
   tipologia_contrato  ·  23 valores distintos
   campo_auxiliar_contrato  ·  1.269 valores distintos
   numero_tipologia_contrato  ·  16 valores distintos

## Ocorrencia — 45.391 linhas · 4 campos
   identificador_sfi_processo_licitatorio  ·  1.080.094 valores distintos  [CHAVE]
   data_ocorrencia_licitacao  ·  1.766 valores distintos
   descricao_justificativa_ocorrencia_licitacao  ·  22.710 valores distintos
   descricao_tipo_ocorrencia_licitacao  ·  14 valores distintos

---
TOTAL: 17 tabelas · 205 campos · 36.224.032 linhas
