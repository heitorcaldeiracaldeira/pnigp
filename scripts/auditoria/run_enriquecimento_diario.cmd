@echo off
REM ENRIQUECIMENTO DIÁRIO INCREMENTAL — a cadeia completa, dirigida por evento, sem varrer o passado.
REM   FEEDER (só o que mudou no PNCP) -> EVENTO -> DESCRIÇÃO (docs do processo) -> MARCA (doc de resultado) -> consolida.
REM Tudo idempotente/resumível. Task "Enriquecimento diario" (diária, IgnoreNew).
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set UF=SC
set DIAS=2

REM --- FEEDER: ingestão INCREMENTAL do PNCP (pergunta "o que mudou?"; ~1.000/dia, não 241k) ---
"%NODE%" scripts\coleta_incremental_pncp.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\ingest_cadeia_pncp.mjs       >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\ingest_itens_sc.mjs          >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\ingest_arquivos_sc.mjs       >> logs\enriquecimento_diario.log 2>&1

REM --- EVENTO: (des)homologou -> reabre o proc (reconcilia marca + re-enriquece descrição) ---
"%NODE%" scripts\auditoria\ao_homologar.mjs   >> logs\enriquecimento_diario.log 2>&1

REM --- DESCRIÇÃO completa do item pelos DOCUMENTOS do processo (TR/Edital/ETP) ---
"%NODE%" scripts\constroi_fila_enriquecimento.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\enriquece_item_documento.mjs     >> logs\enriquecimento_diario.log 2>&1

REM --- MARCA pelo doc de resultado (acervo -> PNCP -> portal de origem) ---
set INCREMENTAL=1
set CONC=3
set USAR_LINK=1
"%NODE%" scripts\auditoria\enriquece_marca.mjs >> logs\enriquecimento_diario.log 2>&1
"%NODE%" scripts\auditoria\consolida_marca.mjs >> logs\enriquecimento_diario.log 2>&1
