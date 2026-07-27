@echo off
REM ENRIQUECIMENTO DIÁRIO INCREMENTAL — a cadeia completa, dirigida por evento, sem varrer o passado.
REM   FEEDER (só o que mudou no PNCP) -> EVENTO -> DESCRIÇÃO (docs do processo) -> MARCA (doc de resultado) -> consolida.
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

REM --- EVENTO: (des)homologou -> reabre o proc (reconcilia marca + re-enriquece descrição) ---
"%NODE%" scripts\auditoria\ao_homologar.mjs   >> logs\enriquecimento_diario.log 2>&1

REM --- DESCRIÇÃO completa do item pelos DOCUMENTOS do processo (TR/Edital/ETP) ---
"%NODE%" scripts\constroi_fila_enriquecimento.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\enriquece_item_documento.mjs     >> logs\enriquecimento_diario.log 2>&1

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

REM --- MARCA pelo doc de resultado (acervo -> PNCP -> portal de origem) + consolida as vias cruas ---
set INCREMENTAL=1
set CONC=3
set USAR_LINK=1
"%NODE%" scripts\auditoria\enriquece_marca.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\auditoria\consolida_marca.mjs >> logs\enriquecimento_diario.log 2>&1
