# PNIGP — Documentação do Sistema (gerada automaticamente)

> Gerada em 2026-08-04 por `scripts/gerar_documentacao.mjs`. Reflete o estado real do código e do banco. **Não editar à mão.**

## 1. Banco de dados (Neon)

| Tabela | Registros | Colunas |
|---|---|---|

## 2. Coleta (ETLs e scripts)

| Script | O que faz |
|---|---|
| `scripts/_arquivo_ml_catmat/_diag_catmat.mjs` | — |
| `scripts/_arquivo_ml_catmat/export_catmat_train.mjs` | Exporta o corpus rotulado (catmat_catalogo: descrição→PDM/classe) + as chaves distintas de bens de SC, p/ o treino do classificador TF-IDF+SVM (train_classify_catmat.py). Ponte por |
| `scripts/_atafull.mjs` | — |
| `scripts/_blast_dbc.mjs` | _blast_dbc.mjs — DESCOMPRESSOR DBC (DATASUS). Um .dbc é um .dbf cujos REGISTROS estão comprimidos por PKWARE DCL "implode"; o cabeçalho DBF fica intacto. Descompressão = algoritmo  |
| `scripts/_cadprev.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _cadprev.mjs — infraestrutura compartilhada dos ETLs do CADPREV/SPRE |
| `scripts/_censo_celulas.mjs` | — |
| `scripts/_compras_gov.mjs` | — |
| `scripts/_coord.mjs` | — |
| `scripts/_derivadas_compras.mjs` | FONTE ÚNICA da SQL das derivadas de compras (Lei 1, andar 2). Um lugar só — os builders full e a re-derivação por fatia (rederiva_fatia.mjs) chamam daqui, para nunca divergirem.  C |
| `scripts/_diag_direta.mjs` | — |
| `scripts/_diag_disp.mjs` | — |
| `scripts/_diag_disp2.mjs` | — |
| `scripts/_diag_disp3.mjs` | — |
| `scripts/_diag_enriq.mjs` | — |
| `scripts/_diag_enriq2.mjs` | — |
| `scripts/_diag_marca.mjs` | — |
| `scripts/_diag_outro.mjs` | — |
| `scripts/_diag_tipos.mjs` | — |
| `scripts/_diag_valor_api.mjs` | — |
| `scripts/_disputa.mjs` | — |
| `scripts/_docs_por_portal.mjs` | — |
| `scripts/_docs_portal_modalidade.mjs` | — |
| `scripts/_estado_sc.mjs` | — |
| `scripts/_forn_contrata.mjs` | — |
| `scripts/_gov_estado.mjs` | — |
| `scripts/_limpa_feitas.mjs` | — |
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
| `scripts/_medir5.mjs` | — |
| `scripts/_mods.mjs` | — |
| `scripts/_parse_betha.mjs` | — |
| `scripts/_parse_fontes.mjs` | — |
| `scripts/_pcp_harvest_tmp.mjs` | HARVESTER Portal de Compras Públicas (SC) — colhe o relatório "VENCEDORES DO PROCESSO" (relatorio_gerado), parseia colunar (Modelo | Marca/Fabricante), ancora marca por VALOR (melh |
| `scripts/_plataformas.mjs` | — |
| `scripts/_precos_norm.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _precos_norm.mjs — fragmentos SQL de NORMALIZAÇÃO da descrição e CAN |
| `scripts/_proc_html.mjs` | — |
| `scripts/_prova_marca_bloco.mjs` | — |
| `scripts/_prova_marca_valor.mjs` | — |
| `scripts/_rem3.mjs` | — |
| `scripts/_reset_pca_feitos.mjs` | Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT). |
| `scripts/_storage.mjs` | ABSTRAÇÃO DE ARMAZENAMENTO DE OBJETO (binário) — backend plugável por env `ARQUIVO_STORAGE`. A CHAVE do objeto é a mesma em qualquer backend → migrar de `local` p/ `s3` é só re-apo |
| `scripts/_t1.mjs` | — |
| `scripts/_tem_marca_col.mjs` | — |
| `scripts/_uf.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ _uf.mjs — FONTE ÚNICA DA VERDADE DA UF (chave-mestra da nacionalizaç |
| `scripts/_unidade.mjs` | — |
| `scripts/alerta_crp.mjs` | ALERTA de CRP — varre o último CRP de cada ente (rpps_crp_sc), classifica por urgência e detecta TRANSIÇÕES desde a última varredura (entrou em vencido / ≤30d / ≤90d, ou regularizo |
| `scripts/analisa_documentacao.mjs` | ANÁLISE DOCUMENTAL do processo licitatório (fase interna, Lei 14.133) — por MODALIDADE. Por peça exigida: DOCUMENTO PRÓPRIO (arquivos_sc.tipo) vs EMBUTIDA (marcador no texto) vs NÃ |
| `scripts/analise_casamento_tr.mjs` | ANÁLISE DO CASAMENTO API × TR em 200 pregões variados — mede a DISTRIBUIÇÃO real do problema de casar item da API com item do documento, para dimensionar o casador (não é o casador |
| `scripts/analise_item_documentos.mjs` | ANÁLISE POR ITEM/LOTE JUNTANDO TODOS OS DOCUMENTOS — monta, para cada item da API, a EVIDÊNCIA que cada documento do processo traz dele (DFD→ETP→TR→Edital…), na ordem da construção |
| `scripts/ancora_item_documento.mjs` | ACHA A LINHA DO ITEM NO DOCUMENTO — ancorando no NÚMERO, não na palavra.  POR QUE: a descrição curta não tem token que ancore. Caso real (Florianópolis 2024/94 item 1): a descrição |
| `scripts/arquiva_documento_binario.mjs` | CAMADA DE ARQUIVO DO BINÁRIO — guarda o PDF EM SI (não só o texto), com hash de integridade e índice em arquivo_binario_sc. É a cópia à prova de exclusão do PNCP: quando o PNCP apa |
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
| `scripts/auditoria/coletor_compras_gov.mjs` | COLETOR Compras.gov (SIASG / dados-abertos) — marca ANCORADA POR VALOR. State-agnostic (UF/EST por env). ⭐ ACHADO (jul/2026, provado ao vivo): o módulo BANCO DE PREÇOS expõe a marc |
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
| `scripts/auditoria/pipeline.mjs` | AUDITORIA · pipeline — REFRESH do flag por evento → extração/reconcile da marca. Idempotente e LEVE. Entra no ciclo de ingestão: a cada nova leva do PNCP, roda isto → processos que |
| `scripts/auditoria/receitas_portais.mjs` | RECEITAS POR PORTAL — busca o TEXTO do doc de resultado (onde vive a marca) em CADA portal cracked. Estrutura: resolveId(portal, docAcervo, proc) → id do processo NO portal (1º do  |
| `scripts/auditoria_dados_sc.mjs` | Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada). Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_ |
| `scripts/backfill_gerador_sc.mjs` | BACKFILL do arquivo_texto_sc.gerador nos textos ja baixados. Idempotente (so quem esta NULL) e resumivel. O gerador (assinatura NO TEXTO) e o que roteia o parser — a plataforma do  |
| `scripts/backfill_raw_arquivos_sc.mjs` | BACKFILL DO RAW EM arquivos_sc — cópia fiel do PNCP (regra 1). Catalogamos os documentos sem guardar o JSON cru; aqui re-busca /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos e grava o |
| `scripts/backfill_unidade_pncp.mjs` | BACKFILL da entidade `unidadeOrgao` do PNCP nas contratações já ingeridas.  POR QUE: o ingest DESCARTAVA `unidadeOrgao` (que traz o município do processo) e DEDUZIA o cod_ibge de u |
| `scripts/backup_neon.mjs` | Backup LÓGICO do Neon — dump de todas as tabelas em JSONL.gz local (backups/, gitignored). Dado sensível: NUNCA vai pro GitHub. Camada primária = PITR nativo do Neon; isto é o dump |
| `scripts/baixa_folha.mjs` | — |
| `scripts/build_andamento_compras.mjs` | DERIVADA (andar 2, Lei 1) — app.andamento_compras_sc: por município × modalidade × STATUS DO ITEM × valor. O andamento vive no ITEM (situacao: Homologado/Em andamento/Deserto/Fraca |
| `scripts/build_apresentacao_desc_sc.mjs` | APRESENTAÇÃO — Camada 2 (descrição): p/ itens cujo RÓTULO é container sem número (frasco/caixa/pacote — Camada 1 só deu conf 0.5), extrai a QUANTIDADE do CONTEÚDO que está no TEXTO |
| `scripts/build_apresentacao_llm.mjs` | APRESENTAÇÃO — Camada LLM (Haiku): extrai a QUANTIDADE DO CONTEÚDO das descrições-resíduo que a Camada 2 determinística não resolveu (container sem qtd / rótulo desconhecido) MAS q |
| `scripts/build_apresentacao_sc.mjs` | APRESENTAÇÃO — Camada 1 (rótulo): parseia o rótulo `unidade` de cada item-bem em UNIDADE BÁSICA + FATOR de desempacotamento, gravando o dicionário `item_apresentacao_sc` (chave = r |
| `scripts/build_completude_documento.mjs` | ANÁLISE — COMPLETUDE LEGAL DOS DOCUMENTOS (lente do auditor). Para cada ETP/TR/PB, checa no TEXTO extraído se as seções que a Lei 14.133 exige estão presentes → score + o que falta |
| `scripts/build_compras_sc.mjs` | DERIVADA (andar 2, Lei 1) — compras_sc reconstruída DO ESPELHO (contratacoes_sc), sem tocar a API do PNCP. FULL rebuild. A SQL vive em _derivadas_compras.mjs (mesma usada pela re-d |
| `scripts/build_item_homologado_sc.mjs` | CASAMENTO ITEM A ITEM — a base do banco de SUCESSO. Uma linha por item HOMOLOGADO, com tudo ligado. SEM mediana, SEM média, SEM grupo: agregação apaga justamente o que é copiável ( |
| `scripts/build_mislabel_unidade_sc.mjs` | RED-FLAG — provável UNIDADE TROCADA no lançamento. Efeito colateral valioso do Passe 2: ao reduzir à unidade básica, um item cujo preço/unidade básica destoa MUITO (≥20×) da median |
| `scripts/build_precos_basica_sc.mjs` | REFERÊNCIA POR UNIDADE BÁSICA (Passe 2 do mapa de preços) — reagrupa as compras pela CHAVE DE COMPARABILIDADE (CATMAT + unidade básica + forma), reduzindo cada preço à unidade bás |
| `scripts/build_precos_compras.mjs` | BANCO DE PREÇOS de referência de SC (mediana/quartis por item×UNIDADE CANONICALIZADA) + constatações de sobrepreço. A canonicalização de unidades é essencial: o dado bruto tem ~4.8 |
| `scripts/build_processo_fase_sc.mjs` | CONTADOR POR FASE — cada processo em UMA fase (partição limpa dos 241k). Tabela derivada, rebuildável, indexada: o app lê em <200ms. NÃO é view (view pesada não responde count em 1 |
| `scripts/build_red_flags_fornecedores.mjs` | RED FLAGS DE FORNECEDORES — sinais de risco de integridade por (município, fornecedor): CONCENTRAÇÃO (fatia do total contratado), SANCIONADO (CEIS/CNEP vigente) e SOBREPREÇO (itens |
| `scripts/build_sobrepreco_medicamentos.mjs` | Indícios de sobrepreço em MEDICAMENTOS vs o teto legal (CMED/PMVG). Conservador: casa por SUBSTÂNCIA + DOSAGEM, compara o preço/comprimido pago ao MAIOR PMVG/comprimido daquela dos |
| `scripts/build_sobrepreco_nacional.mjs` | RECONSTRÓI o estudo de sobrepreço com DUPLO benchmark: mediana de SC (interno) + referência NACIONAL (Painel de Preços, forma AVULSA — comparável ao unitário municipal) + desvio-pa |
| `scripts/build_tabela_escolas.mjs` | — |
| `scripts/build_variacao_interna.mjs` | VARIAÇÃO INTERNA DE PREÇOS — itens que o MESMO município comprou a preços unitários diferentes (incoerência interna). Economia = padronizar pelo MENOR preço que o próprio município |
| `scripts/campos_contratacao_pncp.mjs` | MAPA DECLARATIVO DOS 45 CAMPOS DA CONTRATAÇÃO — origem = destino. TODOS. Nenhum descartado.  POR QUE ASSIM: catar campo a campo às 4h da manhã é como eu erro. Um INSERT com 45 parâ |
| `scripts/campos_item_pncp.mjs` | MAPA DECLARATIVO DOS 36 CAMPOS DO ITEM DO PNCP — origem = destino (a lei do projeto: espelhar, não inventar).  POR QUE ASSIM: um INSERT com 40 parâmetros posicionais é onde eu erra |
| `scripts/casa_conjunto.mjs` | CASADOR DE CONJUNTO — roda o casador endurecido contra CADA documento da construção e CONSOLIDA por item:  · melhor acerto (a fonte certa por item — o "union" que o estudo dos 200  |
| `scripts/casa_itens.mjs` | CASADOR ENDURECIDO — liga cada item da API à sua linha no documento, por CONTEÚDO + POSIÇÃO, com CONFIANÇA. Conserta o caso ambíguo (serviço/lote, descrições quase iguais) sem queb |
| `scripts/casa_tcesc_pncp.mjs` | CASAMENTO TCE-SC ↔ PNCP — derivada (Lei 1). O TCE indexa por ENTE + NÚMERO DO EDITAL; nós por cnpj+ano+seq. Chave: município normalizado + número do edital + ano. O `numero_edital` |
| `scripts/checa_anos.mjs` | — |
| `scripts/checa_map.mjs` | — |
| `scripts/classifica_especificacao.mjs` | ESPECIFICAÇÃO × PLANILHA POBRE × CLÁUSULA — o bloco achado no documento é mesmo a especificação do item?  ⚠️ ESTE ARQUIVO EXISTE PORQUE REGEX TEM QUE MORAR EM .mjs. Tentei injetar  |
| `scripts/coleta_diaria_pncp.mjs` | BUSCA DIÁRIA DO PNCP — roda todo dia os coletores do PNCP do ano corrente (compras, contratos, atas), que são idempotentes (upsert). Captura as contratações novas publicadas. Seque |
| `scripts/coleta_incremental_pncp.mjs` | COLETA INCREMENTAL DO PNCP — pergunta "o que mudou?" em vez de varrer tudo.  ═══ O PROBLEMA (medido 2026-07-15) ═══ A varredura completa custa ~1,1 MILHÃO de GETs (241.302 processo |
| `scripts/confere_marca_comprasnet.mjs` | CONFERÊNCIA marca→item (Compras.gov / comprasnet, texto — sem OCR). Doc correto = Termo com "Marca/Fabricante". Extrai a marca da PROPOSTA ADJUDICADA (vencedor), amarra ao nº do it |
| `scripts/confere_marca_lote.mjs` | CONFERE em lote a marca já colhida pelos parsers de portal (item_marca_sc) contra o itens_sc. Trava: item (numero) + VALOR (unit ≈ unit_homologado). Grava no mesmo item_marca_confe |
| `scripts/consome_evento_dado.mjs` | CONSUMIDOR DE DADO — lê a fila `pncp_evento` e preenche SÓ A FATIA que o evento aponta.  ═══ O CONCEITO (validado 2026-07-15) ═══ O PNCP é um LOG (Inclusão/Retificação/Exclusão sob |
| `scripts/constroi_doc_tem_marca.mjs` | CONSTRÓI/ATUALIZA o flag app.doc_tem_marca — marca cada doc com padrão de marca (A=Marca/Fabricante, B=Item…Marca:Modelo:). O extrator lê fatias LEVES daqui em vez de varrer `texto |
| `scripts/constroi_fila_enriquecimento.mjs` | CONSTRÓI a fila materializada do enriquecimento — 1 VARREDURA (não 12). Os shards depois leem fatias LEVES daqui, em vez de cada um varrer os 344MB de arquivo_texto_sc. É o ajuste  |
| `scripts/detecta_layout.mjs` | DETECTA O LAYOUT RODANDO OS PARSERS — não por assinatura.  POR QUE: assinatura de texto NÃO prova que o parser lê. Medido 2026-07-15 numa simulação (que evitou a regressão):   · a  |
| `scripts/detecta_portal_real.mjs` | DETECTA o portal REAL da compra (a bolsa onde a disputa rodou) a partir do EDITAL — não do rótulo `plataforma` (que é o ERP/relay). É o roteador: sabendo o portal real × modalidade |
| `scripts/diagnostico_gestor.mjs` | MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis. Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso). Regras ancoradas e |
| `scripts/dl_epub_js.mjs` | — |
| `scripts/dl_tr.mjs` | — |
| `scripts/enrich_equipamentos_suas_endereco.mjs` | ETL fase 2 — endereço/telefone de cada equipamento do SUAS (CadSUAS, página de detalhe por código). A página de detalhe (aba=endereco_contatos) responde a HTTP simples (≠ da busca, |
| `scripts/enriquece_descricao_marca.mjs` | ENRIQUECE a descrição do item com o que aprendemos do doc de resultado: marca VENCEDORA (conferida, trava dupla) + marcas CANDIDATAS (concorreram) + preço homologado. Junta itens_s |
| `scripts/enriquece_item_documento.mjs` | ENRIQUECEDOR — consome o corpus JÁ GUARDADO (arquivo_texto_sc + itens_sc) e, por item, percorre TODOS os documentos da construção DO PRIMEIRO AO ÚLTIMO (DFD→ETP→TR→Edital…), locali |
| `scripts/enriquece_paralelo.mjs` | LANÇADOR — usa TODOS OS NÚCLEOS pro enriquecimento. Abre 1 processo por core, cada um numa FATIA disjunta (shard por hash do processo) → sem overlap, sem corrida. Cada processo gra |
| `scripts/enviar_notificacoes.mjs` | CARTEIRO das notificações — pega os deltas pendentes (status='detectado'), resolve os destinatários no cadastro (verificados, ativos, válidos, canal e-mail, secretaria/áreas casand |
| `scripts/enviar_notificacoes_whatsapp.mjs` | CARTEIRO WhatsApp — envia os deltas pendentes aos destinatários com canal_pref='whatsapp'. Usa a Meta WhatsApp Cloud API. IMPORTANTE: mensagem PROATIVA (iniciada pela empresa) exig |
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
| `scripts/extrai_marca_ancora.mjs` | EXTRATOR DE MARCA POR ÂNCORA DE VALOR — o método que o Bento (Heitor) ensinou, provado ponta a ponta:   a marca de produto NÃO está na spec do edital (art. 41 veda) nem colada na d |
| `scripts/extrai_marca_multi.mjs` | EXTRATOR UNIFICADO — roda os parsers determinísticos NOVOS (Pública, LicitarDigital, Dispensa/Inexig, IPM), casa cada item ao PNCP pela DESCRIÇÃO (casaItens), determina o VENCEDOR  |
| `scripts/extrai_marca_padrao.mjs` | EXTRAI marca dos templates de TEXTO A/B (inline) — LEVE: lê a fila `doc_tem_marca` (não varre os 12GB), extrai pares crus {marca,valor} do texto e grava EM LOTE em app.item_marca_p |
| `scripts/extrai_marca_router.mjs` | ROTEADOR DE MARCA — o passo AUTOMÁTICO que roda a cada ciclo: quando um item vem HOMOLOGADO (unit_homologado>0) e o documento de resultado já foi baixado, extrai a marca pelo parse |
| `scripts/extrai_marca_visao.mjs` | EXTRAI MARCA POR VISÃO — doc de resultado que é PDF IMAGEM (sem texto) → Haiku-visão lê item→fornecedor→marca→valor. Fonte: PNCP /arquivos/{sd} (o arquivo que a plataforma subiu).  |
| `scripts/extrai_portal_vencedores.mjs` | EXTRATOR — bloco "Vencedores" do Portal de Compras Públicas (arquivo_texto_sc.gerador='portal_vencedores').  POR QUE EXISTE: o Portal emite DUAS tabelas. O parser_ecustomize lê a d |
| `scripts/fecha_gap.mjs` | — |
| `scripts/find_bundle.mjs` | — |
| `scripts/folha_jsession.mjs` | — |
| `scripts/folha_longpoll.mjs` | — |
| `scripts/gabarito_marca_descricao.mjs` | GABARITO — A MARCA ESTÁ NA DESCRIÇÃO DO ITEM? (amostra rotulada; método do CATMAT, ver [[pnigp-catmat-classificacao]])  ═══ POR QUE ESTE SCRIPT EXISTE ═══ Medir presença de marca e |
| `scripts/gen_docx_competitiva.mjs` | Gera o .docx da Análise Competitiva (Node puro, sem dependência). node scripts/gen_docx_competitiva.mjs |
| `scripts/geocode_equipamentos_cep.mjs` | Fallback de geocodificação por CEP — para os equipamentos do SUAS cujo endereço completo o Nominatim não encontrou. CEP→coordenada via AwesomeAPI (cep.awesomeapi.com.br). Marca geo |
| `scripts/geocode_equipamentos_suas.mjs` | Geocodifica os equipamentos do SUAS (CadSUAS só tem endereço, não lat/lon) via Nominatim/OSM. Respeita a política do Nominatim: 1 req/seg, User-Agent identificado. Idempotente/resu |
| `scripts/gera_relatorio_extracao.mjs` | Gera um HTML de conclusão da extração de texto do PNCP (arquivo_texto_sc). Queries LEVES (sem subconsulta correlacionada) p/ NAO competir com a extração. Uso pelo vigia (.claude/wa |
| `scripts/gerar_documentacao.mjs` | Gerador de documentação automática do sistema PNIGP. Introspecta: ETLs (cabeçalho dos scripts), tabelas do Neon (+contagens), rotas/páginas, catálogo de coleta e tarefas agendadas  |
| `scripts/harvest_painel_gold.mjs` | COLETOR DE GABARITO — Painel de Preços federal (dadosabertos.compras.gov.br) como corpus rotulado real. Resolve a raiz do problema de classificação: SC não publica CATMAT (0 rótulo |
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
| `scripts/ingest_precos_referencia_sc.mjs` | ⛔ DESATIVADO EM 15/07/2026 — NÃO RODAR. Script de jun/2026, código morto e PERIGOSO. Ele faz `DROP TABLE precos_referencia_sc` e recria com schema pobre (k, n_compras…). Mas a `p |
| `scripts/ingest_previne_sc.mjs` | ETL — Previne Brasil (indicadores de desempenho da APS / SISAB) por município de SC. Fonte: CSV oficial por quadrimestre (Portal de Dados Abertos do SUS, S3). Agrega numerador/deno |
| `scripts/ingest_processos_sc.mjs` | ETL — TODOS os processos de contratação do PNCP em SC (todas as modalidades, todos os anos). Fonte: API Consulta /v1/contratacoes/publicacao (exige codigoModalidadeContratacao; lim |
| `scripts/ingest_prodes_sc.mjs` | ETL — INPE PRODES (desmatamento) por município. Fonte: terrabrasilis WFS (yearly_deforestation, Mata Atlântica). Os polígonos têm state+year+area_km mas NÃO município → interseção  |
| `scripts/ingest_producao_aps_serie.mjs` | Ingere a série histórica de produção da APS (SISAB) → producao_aps_serie_sc. Insert EM LOTE (rápido). |
| `scripts/ingest_programa_beneficiario_sc.mjs` | ETL — ELEGIBILIDADE: quem pode captar cada programa (Transferegov fundoafundo/programa_beneficiario, API viva). Responde "quais municípios são elegíveis" — base do casamento oportu |
| `scripts/ingest_programas_agil.mjs` | ETL — programas "gestão ágil" do Transferegov (fundoafundo/programa_gestao_agil), somados ao catálogo programas_transferegov. Complementa fundoafundo/programa. node scripts/ingest_ |
| `scripts/ingest_programas_federais_curados.mjs` | ETL — REGISTRO CURADO de programas federais de infraestrutura (saúde/educação) que o município pode pleitear. FNS/FNDE não expõem "janela aberta" por API limpa (SISMOB/Habilita são |
| `scripts/ingest_pronaf_sc.mjs` | ETL — PRONAF / Crédito Rural por município de SC. Fonte: BCB SICOR (Olinda OData v2). Entitysets agregados CusteioMunicipioProduto (VlCusteio+codIbge) e InvestMunicipioProduto (VlI |
| `scripts/ingest_qualidade_aps.mjs` | Ingere a classificação oficial do Componente de Qualidade → qualidade_aps_sc. |
| `scripts/ingest_qualidade_indicadores.mjs` | Ingere o conceito por indicador do Componente de Qualidade → qualidade_indicadores_sc. |
| `scripts/ingest_queimadas_sc.mjs` | ETL — INPE queimadas (focos de calor) por município. Fonte: dataserver-coids.inpe.br (CSVs mensais Brasil). Download via CURL (timeout confiável — o fetch do Node pendura na conexã |
| `scripts/ingest_quilombos_sc.mjs` | ETL — Comunidades Quilombolas Certificadas (Fundação Palmares) por município. Fonte: dados.cultura.gov.br (XLSX). node scripts/ingest_quilombos_sc.mjs |
| `scripts/ingest_raas_saude_mental_sc.mjs` | ETL — Saúde mental (RAAS Psicossocial / CAPS) por município. Fonte: DATASUS SIA RAAS-PS (DBC). Usa _blast_dbc.mjs. Atendimentos + registros psicossociais por município de residênci |
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
| `scripts/ingest_sazonalidade_preco_sc.mjs` | ⛔ DESATIVADO EM 15/07/2026 — NÃO RODAR. Script de jun/2026, código morto (a análise saiu do ar: comparava por valor TOTAL; foi refeita por VALOR UNITÁRIO). Faz `DROP TABLE sazonal |
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
| `scripts/ingest_tcesc_participantes.mjs` | ESPELHO FIEL do e-Sfinge (TCE-SC) — PARTICIPANTES por ITEM, que o PNCP não tem. O PNCP publica só o VENCEDOR; o TCE publica TODOS os licitantes, quem venceu CADA item e a ordem de  |
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
| `scripts/lote_do_item.mjs` | ITEM ↔ LOTE — a lógica, com testes.  ═══ O QUE O USUÁRIO ENSINOU (2026-07-16), e que muda tudo ═══ **O TR vem PRIMEIRO. O sistema publica DEPOIS.** O servidor digita os itens no si |
| `scripts/mapa_atas_plataformas.mjs` | MAPA DAS ATAS POR PLATAFORMA (SC) — artefato do estudo profundo de 2026-07-15. O tipo_documento do PNCP NÃO distingue a ata (joga quase tudo em "Outros Documentos"); o único discri |
| `scripts/marca_destravada_por_rota.mjs` | O QUE A ROTA DESTRAVA — quanto de MARCA passa a ser alcançável depois do roteador v3. Separa o que é extraível JÁ (doc de resultado no acervo, custo zero, sem rede) do que vira FIL |
| `scripts/marca_estado_processo.mjs` | ESTADO da marca por processo (homologado c/ itens) — roteado pelo portal REAL. Mata o falso negativo: nunca "sem marca"; sempre CONFERIDA / doc-no-acervo / a-buscar[portal] / sem-r |
| `scripts/marca_participantes_comprasnet.mjs` | MARCAS PARTICIPANTES por item (Compras.gov / comprasnet) — captura TODAS as marcas que concorreram (vencedor + perdedores), ligadas à DESCRIÇÃO do item. Corpus descrição→marcas con |
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
| `scripts/migra_contratacoes_pncp.mjs` | CONSOLIDAÇÃO espelhando o PNCP: compra_raiox_sc → contratacoes_sc (entidade Contratação canônica do PNCP), com a chave canônica numero_controle (numeroControlePNCP) como coluna ger |
| `scripts/migra_estado_parser.mjs` | ESTADO DE EXTRAÇÃO POR DOCUMENTO, COM VERSÃO DO PARSER.  POR QUE (bug real, 2026-07-15): o estado vivia em `marca_ata_feitas`, por PROCESSO e COMPARTILHADO entre os extratores. Qua |
| `scripts/motor_fundeb_sc.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ MOTOR FUNDEB — reconstrói, do zero e do dado oficial, quanto o FUNDE |
| `scripts/motor_notificacoes.mjs` | MOTOR DE DELTA das notificações — computa os alertas ATUAIS por município (SQL direto sobre as bases), gera uma chave_delta que captura o ESTADO do fato, e registra em notificacao_ |
| `scripts/normaliza_marca_visao.mjs` | NORMALIZA marca_visao — determinístico, sem API. Separa marca REAL de fornecedor-no-campo e genérico. |
| `scripts/normaliza_participantes.mjs` | — |
| `scripts/padroes_casamento_tr.mjs` | PADRÕES do casamento API×TR — lê logs/analise_casamento_tr.jsonl e procura COMPORTAMENTOS: por plataforma, por tamanho, distribuição de cobertura/posição, ambiguidade. node scripts |
| `scripts/parse_rotas.mjs` | — |
| `scripts/parser_ata_pcp.mjs` | PARSER DETERMINÍSTICO — tabela "Vencedores" do motor Portal de Compras Públicas (ECustomize, Betha, e outros que usam o mesmo layout). Extrai por linha: codigo, produto, cnpjFornec |
| `scripts/parser_az.mjs` | PARSER DETERMINÍSTICO — AZ INFORMATICA ("Resultados" / "FORNECEDORES CLASSIFICADOS"). Rotear por arquivo_texto_sc.gerador='az' (assinatura no texto), NÃO pela plataforma do PNCP ([ |
| `scripts/parser_betha.mjs` | PARSER DETERMINÍSTICO — ATA NATIVA DO BETHA (AtaSessaoFinal/AtaTotal gerados pelo próprio Betha, NÃO pelo Portal). Rotear por arquivo_texto_sc.gerador='betha' — a `plataforma` do P |
| `scripts/parser_dispensa_termo.mjs` | PARSER DETERMINÍSTICO — TERMO DE DISPENSA / INEXIGIBILIDADE (modalidade_id 8/9/12). Rotear por arquivo_texto_sc: modalidade 8/9/12 + documento de homologação/razão da escolha/propo |
| `scripts/parser_ecustomize.mjs` | PARSER DETERMINÍSTICO — ECustomize/Portal Compras Públicas, tabela DETALHADA de propostas (todos os fornecedores). Cada registro de proposta tem âncoras fortes: CNPJ completo, dat |
| `scripts/parser_ipm.mjs` | PARSER DETERMINÍSTICO — IPM Sistemas / atende.net (id do gerador: 'ipm'). Rotear por arquivo_texto_sc.gerador='outro' + assinatura no texto/título (a plataforma do PNCP só diz quem |
| `scripts/parser_licitar_digital.mjs` | PARSER DETERMINÍSTICO — LICITAR DIGITAL (arquivo_texto_sc.gerador='licitar_digital'). Rotear pelo `gerador` (assinatura no texto), NÃO pela plataforma do PNCP ([[mapa_atas_platafor |
| `scripts/parser_publica.mjs` | PARSER DETERMINÍSTICO — "Pública" (id: publica) — Termo de Homologação e Adjudicação gerado pelo sistema de Compras da plataforma Betha ("Sistema: Compras", assinatura "verificador |
| `scripts/parser_versao.mjs` | VERSÃO DOS PARSERS — o estado de leitura vive no DOCUMENTO (arquivo_texto_sc.parser_versao), não num marcador.  COMO USAR: mexeu em QUALQUER parser (parser_az / parser_betha / pars |
| `scripts/pncp_depae_assinaturas.mjs` | — |
| `scripts/pncp_docs_merenda.mjs` | — |
| `scripts/pncp_generos_assinaturas.mjs` | — |
| `scripts/pncp_http.mjs` | HTTP DO PNCP — um lugar só. **FALHA NUNCA VIRA ZERO.**  ═══ POR QUE EXISTE ═══ O mesmo defeito estava em 17 scripts do projeto, em três formas:   `if (!r.ok) return []`             |
| `scripts/portais_comportamento.mjs` | COMPORTAMENTO DE TODOS OS PORTAIS — registro único (detector + fetcher + parser de marca). Para CADA portal: como DETECTAR (regex no edital), como BUSCAR a ata (recipe do endpoint  |
| `scripts/probe_cadprev.mjs` | PROBE (read-only) — cataloga a superfície da API CADPREV (apicadprev.trabalho.gov.br). Para cada recurso: status HTTP, se exige dt_exercicio, nomes dos campos e o campo identificad |
| `scripts/probe_folha.mjs` | — |
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
| `scripts/recon_folha1.mjs` | — |
| `scripts/recover_dca.mjs` | Recuperação dos municípios SC sem RREO: usa a DCA (Declaração de Contas Anuais) do SICONFI. DCA-Anexo I-C (receita), I-D (despesa por categoria), I-E (despesa por função). node scr |
| `scripts/rederiva_fatia.mjs` | RE-DERIVA A FATIA — fecha o ciclo evento→espelho→derivada. Terceiro consumidor de pncp_evento.  O consumidor de DADO (consome_evento_dado.mjs) atualiza o ESPELHO da fatia (contrata |
| `scripts/redetecta_portal_faltantes.mjs` | RE-DETECTA o portal real nos processos que ficaram SEM ROTA (portal_real null) — inclui o que faltou: Estado de Santa Catarina (e-lic.sc.gov.br / SEA-SC) e reforço dos demais. Atua |
| `scripts/refina_descricao.mjs` | REFINO da descrição enriquecida — passe LEVE sobre app.item_enriquecimento (não re-varre os 12GB):  1) descricao_refinada = isola o segmento de SPEC que casa com o item, cortando p |
| `scripts/relista_sem_documento.mjs` | RE-LISTAGEM FOCADA — re-busca /arquivos SÓ de processos que ficaram SEM nenhum documento no espelho. Ignora a flag arquivos_proc_feitos (que já os marcou "listados") e vai direto a |
| `scripts/remede_edital.mjs` | RE-MEDE a cobertura lendo o EDITAL (tipo 2), nos MESMOS processos de logs/analise_casamento_tr.jsonl. Testa a hipótese: o item vive no Edital (que embute os anexos — art. 25 §3), n |
| `scripts/render_custo.mjs` | — |
| `scripts/render_final.mjs` | — |
| `scripts/render_html.mjs` | — |
| `scripts/render_modulo.mjs` | — |
| `scripts/render_portfolio.mjs` | — |
| `scripts/repoll_arquivos_homologados.mjs` | RE-POLL DOS DOCUMENTOS — re-consulta /arquivos no PNCP para TODO processo homologado e traz o que não temos.  POR QUE PRECISA EXISTIR: `ingest_arquivos_sc.mjs` busca a lista de doc |
| `scripts/rerank_llm.mjs` | RERANKER-LLM (estágio 2 do retrieve-then-rerank). O retriever trigrama dá top-k candidatos (recall@3=100% no gabarito de SC → o certo está lá); o LLM escolhe o correto usando TODO  |
| `scripts/reroteia_dominio.mjs` | RE-ROTEIA por DOMÍNIO + PRIORIDADE (v2) — corrige a co-citação e o ERP-relay. Problemas do v1: (a) entre docs multi-portal, o distinct on escolhia arbitrário; (b) Atende.net (IPM)  |
| `scripts/roda_extratores_acervo.mjs` | RODA TODA A BATERIA DETERMINÍSTICA sobre o que JÁ ESTÁ NO ACERVO — sem rede, sem portal, sem LLM. Alvo: os itens homologados cujo processo já tem o documento de resultado guardado  |
| `scripts/roda_extratores_acervo2.mjs` | BATERIA 2 — o RESTO dos extratores, sobre o acervo. Roda depois da bateria 1 (determinística de família), nunca junto: az/betha/ecustomize/portal_vencedores compartilham `marca_ata |
| `scripts/roda_extratores_acervo3.mjs` | BATERIA 3 — COLETA. Sai do acervo e vai ao portal buscar o documento que falta. `auditoria/enriquece_marca.mjs` é a espinha: fila (homologado sem marca) → rota (portal_real, bolsa> |
| `scripts/rota_por_modalidade.mjs` | ROTEAMENTO POR MODALIDADE — a modalidade PREDIZ o que existe. Sem isto são 5 problemas diferentes empilhados.  ═══ POR QUE (medido 2026-07-15) ═══ Rodei 15 casos misturando obra, s |
| `scripts/roteia_portal_amplo.mjs` | ROTEADOR AMPLO do portal de origem — ataca os "SEM ROTA" que o detector antigo não alcança:   (1) o detector só olhava doc 'Edital' → Dispensa/Inexig (sem edital, mas com Aviso/TR/ |
| `scripts/roteia_portal_v3.mjs` | ROTEADOR DE PORTAL v3 — resolve os processos homologados sem rota, RESPEITANDO a lei do ERP:   O portal que RODA a licitação é sempre um NÃO-ERP (bolsa/portal de disputa: PCP, BLL, |
| `scripts/run_extrai_texto_paralelo.mjs` | SUPERVISOR da extração de texto — sobe N processos SHARD-ados em paralelo (cada um numa thread de JS própria → paraleliza o parse de PDF, que é síncrono e travaria numa thread só). |
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
| `scripts/stn_capture.mjs` | Captura as chamadas à API ARIA do Tesouro feitas pelo dashboard de Transferências Constitucionais. Objetivo: descobrir o endpoint de VALORES por município. node scripts/stn_capture |
| `scripts/supervisor_coleta.mjs` | SUPERVISOR auto-recuperável da coleta PNCP/SC. Um único processo é dono do ciclo de vida: roda cada ETL como filho, monitora o PROGRESSO REAL no Neon e, se estagnar (sem avanço por |
| `scripts/testa_api_doc.mjs` | — |
| `scripts/testa_entidade.mjs` | — |
| `scripts/testa_recente.mjs` | — |
| `scripts/testa_unidades.mjs` | — |
| `scripts/validacao_continua.mjs` | VALIDAÇÃO CONTÍNUA — auditor independente do coletor (só lê + flaga, nunca atrapalha a coleta). A cada INTERVALO: aplica regras de integridade, marca anomalias IMPOSSÍVEIS como sus |
| `scripts/validacao_estado_vazamento.mjs` | VALIDAÇÃO DE INTEGRIDADE — premissa: Estado e municípios NUNCA na mesma comparação municipal. O Estado de SC existe no banco (cod_ibge='42', tipo='E', p/ o motor de peças e futura  |
| `scripts/validar_consistencia.mjs` | Validação de consistência/integridade dos dados oficiais (SC) após os ETLs. Cobertura por base, duplicatas (vazamento de CNPJ compartilhado), conexões, e amostra planejado × contra |
| `scripts/validate_msc.mjs` | FASE 1 — validação MSC↔RREO. Baixa a MSC orçamentária completa de um ente/ano e procura a agregação que reproduz o empenhado/dotação do RREO. node scripts/validate_msc.mjs |
| `scripts/validate_msc_40.mjs` | ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ VALIDAÇÃO MSC × SICONFI — a PROVA de que a despesa que servimos bate |
| `scripts/validate_msc_multi.mjs` | FASE 1 (validação multi-município) — confirma que MSC conta 6.2.2.1.3.04 (empenhado) reconcilia com o RREO. |
| `scripts/validate_subfuncao_db.mjs` | VALIDAÇÃO pós-reingestão — confirma que o despesa_subfuncao_sc GRAVADO (anos fechados) bate com o RREO oficial ao vivo. node scripts/validate_subfuncao_db.mjs   (N combos município |
| `scripts/varredura_frescor.mjs` | Varredura de FRESCOR + SÉRIE HISTÓRICA — consulta as PRÓPRIAS tabelas (não o max_ano do catálogo, que engana): para cada tabela com coluna de ano/competência, calcula a série (min– |
| `scripts/verifica_dist.mjs` | — |
| `scripts/warm_compras.mjs` | Pré-aquece o cache de compras (PNCP) das maiores cidades de SC + Estado, chamando a API de produção sequencialmente (usa o IP do Vercel). node scripts/warm_compras.mjs |

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
| `termo.tsx` | Glossário central — explica siglas/jargão para o gestor não-técnico (público-alvo do PNIGP). |
| `variacao-interna.tsx` | VARIAÇÃO INTERNA DE PREÇOS — o próprio município comprou o mesmo item a preços diferentes. |
| `vies-previsao.tsx` | PROTÓTIPO — Viés de previsão de receita (semente do motor de sugestão de peças orçamentárias). |

## 3. Fontes de dados (catálogo de coleta)

| Fonte | Provedor | Ano + recente | Última coleta | Situação |
|---|---|---|---|---|

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
