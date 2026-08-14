@echo off
REM PNIGP - carga das regioes restantes da RAIS 2025 (NORDESTE, SUL, MG_ES_RJ, SP).
REM A retomada por regiao vive em folha_rais_carga, entao repetir nao duplica nada.
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_rais.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_rais.mjs >> folha_rais.log 2>&1
set RC=%ERRORLEVEL%
echo ===== FIM exit %RC% %DATE% %TIME% >> folha_rais.log
endlocal
exit /b 0
