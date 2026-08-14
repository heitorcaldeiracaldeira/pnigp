@echo off
REM PNIGP - varre e coleta a folha nacional dos dois ERPs mais completos: e-Publica e Portal TP.
REM Ordem: descobre os portais dos dois -> coleta e-Publica -> coleta Portal TP.
REM Tudo com retomada (erp_varredura, folha_epublica_coleta, folha_portaltp_coleta): repetir e seguro.
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set CONC=16
echo ===== INICIO %DATE% %TIME% >> folha_erp.log
set ERPS=epublica,portaltp
echo --- varredura dos portais >> folha_erp.log
"%NODE%" scripts\descobre_erp_municipal.mjs >> folha_erp.log 2>&1
set ERPS=
echo --- coleta e-Publica >> folha_erp.log
"%NODE%" scripts\ingest_folha_epublica.mjs >> folha_erp.log 2>&1
echo --- coleta Portal TP >> folha_erp.log
"%NODE%" scripts\ingest_folha_portaltp.mjs >> folha_erp.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_erp.log
endlocal
exit /b 0
