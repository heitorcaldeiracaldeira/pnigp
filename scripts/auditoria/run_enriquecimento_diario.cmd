@echo off
REM ENRIQUECIMENTO DIÁRIO INCREMENTAL — a cadeia completa, dirigida por evento, sem varrer o passado.
REM   FEEDER (só o que mudou no PNCP) --- EVENTO --- DESCRIÇÃO (docs do processo) --- MARCA (doc de resultado) --- consolida.
REM Tudo idempotente/resumível. Task "Enriquecimento diario" (diária, IgnoreNew).
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set UF=SC
set DIAS=2

REM --- CONTRATAÇÕES (raio-x): metadata oficial das compras → contratacoes_sc. O mês corrente sempre re-busca
REM     (sem isto a base congela no 1º dia do mês). É o DONO fiel de contratacoes_sc.data_atualizacao. ---
"%NODE%" scripts\ingest_contratacoes_sc.mjs  >> logs\enriquecimento_diario.log 2>&1

REM --- FEEDER: detecta o que mudou no PNCP e enfileira em pncp_evento (~1.000/dia, não 241k) ---
"%NODE%" scripts\coleta_incremental_pncp.mjs >> logs\enriquecimento_diario.log 2>&1

REM --- CONSUMIDOR: busca SÓ a fatia que o evento aponta (item/resultado/contratação) e marca consumido_dado.
REM     Substitui o scan de contratacoes_sc (ingest_itens_sc, APOSENTADO: contratacoes_sc congelou quando a
REM     coleta velha foi desativada). LOTE alto p/ dar conta do dia inteiro numa rodada. Ver memória do gap. ---
set LOTE=15000
set CONC=6
"%NODE%" scripts\consome_evento_dado.mjs      >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\ingest_cadeia_pncp.mjs       >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\ingest_arquivos_sc.mjs       >> logs\enriquecimento_diario.log 2>&1

REM --- TRAVA DA MARCA - daqui para baixo esta cadeia toca as MESMAS tabelas que a "PNIGP - Marca diaria":
REM     ao_homologar mexe em marca_padrao_feitas e no watermark, os coletores compartilham marca_ata_feitas, e
REM     consolida_marca reescreve item_marca_conferida. Esta tarefa dispara 04:13 com limite de 3h e a da marca
REM     dispara 05:00 - as duas se cruzam por ate 2h. O IgnoreNew do Agendador NAO protege: sao tarefas
REM     distintas, cada uma com a sua contagem de instancias. Ate 05/ago so o pipeline.mjs pegava a trava, e
REM     quem entrava por aqui passava por baixo dela. Agora as duas portas obedecem a mesma trava.
set DONO=enriq-%RANDOM%%RANDOM%
"%NODE%" scripts\trava.mjs pega cadeia_marca %DONO% 45 >> logs\enriquecimento_diario.log 2>&1
if errorlevel 1 goto :sem_marca

REM --- EVENTO: (des)homologou --- reabre o proc (reconcilia marca + re-enriquece descrição) ---
"%NODE%" scripts\auditoria\ao_homologar.mjs   >> logs\enriquecimento_diario.log 2>&1

REM --- DESCRICAO completa do item pelos DOCUMENTOS do processo TR/Edital/ETP ---
REM     Passou a chamar a cadeia "enriquecimento" do runner, que e a MESMA porta usada pela rodada completa e
REM     pela tarefa "PNIGP Enriquece Item Documento". Antes daqui, esta linha chamava o enriquece_item_documento
REM     SOZINHO - a versao serial, um processo - enquanto as outras portas chamavam o lancador paralelo. Mesmo
REM     trabalho, parametros diferentes, e sem trava entre elas. Agora e a mesma cadeia, com a trava
REM     cadeia_enriquecimento, e a fila e reconstruida uma vez so pelo proprio lancador.
REM     MUDANCA DE COMPORTAMENTO A NOTAR: as 04:13 isto passa a usar todos os nucleos, e nao um processo. Como
REM     este .cmd e sequencial, o resto da cadeia so espera terminar mais cedo.
"%NODE%" scripts\roda.mjs enriquecimento >> logs\enriquecimento_diario.log 2>&1

REM --- MARCA pelos PORTAIS (acervo PNCP, autônomo, captcha-free) — DEPOIS da descrição. Idempotentes (*_feitas):
REM     por dia só pegam os procs novos. Ancoram por valor+CNPJ e gravam item_marca_conferida (portal proprio);
REM     a view app.item_auditoria projeta como 'marca_extraida' automaticamente. ---
set LIMIT=0
"%NODE%" scripts\auditoria\coletor_comprasbr_az.mjs                    >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\auditoria\coletor_compras_gov_termo.mjs               >> logs\enriquecimento_diario.log 2>&1
set LIMIT=300
"%NODE%" scripts\auditoria\coletor_bbmnet.mjs                          >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\auditoria\coletor_estado_de_santa_catarina_e_lic.mjs  >> logs\enriquecimento_diario.log 2>&1
REM os 5 portais de API-viva pelo ACERVO (PCP/BLL/BNC/Licitar/Licitanet) — doc de resultado espelhado no PNCP, captcha-free
set LIMIT=0
"%NODE%" scripts\auditoria\coletor_acervo_portais.mjs                  >> logs\enriquecimento_diario.log 2>&1
set LIMIT=

REM --- MARCA pelo doc de resultado (acervo --- PNCP --- portal de origem) + consolida as vias cruas ---
set INCREMENTAL=1
set CONC=3
set USAR_LINK=1
"%NODE%" scripts\trava.mjs bate cadeia_marca %DONO% >nul 2>&1
"%NODE%" scripts\auditoria\enriquece_marca.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\auditoria\consolida_marca.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\trava.mjs solta cadeia_marca %DONO% >> logs\enriquecimento_diario.log 2>&1
goto :fim

REM Cadeia da marca ja em curso. A DESCRICAO nao disputa nada com ela e roda do mesmo jeito - so a parte de
REM marca fica de fora, e volta amanha. As duas linhas repetidas abaixo sao de proposito: no cmd, desviar por
REM rotulo e mais seguro do que aninhar bloco, e este arquivo ja pagou o preco de bloco com parentese.
:sem_marca
echo ===== marca PULADA %DATE% %TIME% - outra execucao esta com a trava cadeia_marca ===== >> logs\enriquecimento_diario.log
"%NODE%" scripts\roda.mjs enriquecimento >> logs\enriquecimento_diario.log 2>&1

:fim
