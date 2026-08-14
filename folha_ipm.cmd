@echo off
REM PNIGP - IPM/Atende.net: descobre os portais no Brasil inteiro e coleta a folha.
REM A descoberta e tambem o levantamento de qual municipio usa o ERP IPM, por estado.
REM Retomada: erp_portal_municipal (descoberta) e folha_ipm_coleta (coleta) - repetir e seguro.
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
echo ===== INICIO %DATE% %TIME% >> folha_ipm.log
set FASE=descobrir
set CONC=20
echo --- descoberta nacional >> folha_ipm.log
"%NODE%" scripts\ingest_folha_ipm.mjs >> folha_ipm.log 2>&1
set FASE=coletar
echo --- coleta da folha >> folha_ipm.log
"%NODE%" scripts\ingest_folha_ipm.mjs >> folha_ipm.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_ipm.log
endlocal
exit /b 0
