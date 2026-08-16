@echo off
REM Abase RS - passada DEDICADA e lenta. O host devolve HTTP 429 sob rajada e chega a bloquear o IP:
REM com 10s entre requisicoes ainda vinha 429, entao a saida e rodar na madrugada, sozinho, sem concorrencia.
REM Retomada garantida: o coletor pula quem ja esta 'ok' em folha_abase_coleta.
cd /d C:\Users\PC\pnigp
set NODE_TLS_REJECT_UNAUTHORIZED=0
set UF=RS
set PAUSA=8000
set PAUSA_MUN=15000
set SONDAS=2
node scripts\ingest_folha_abase.mjs >> C:\Users\PC\pnigp\log_abase_rs.txt 2>&1
