@echo off
REM PNIGP - identifica o ERP de TODOS os portais do Radar pela assinatura da pagina (pais inteiro, todo selo).
REM Retomada por checado_em na radar_portal - repetir e seguro, so pega quem falta.
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set CONC=14
set SELO=TODOS
echo ===== INICIO %DATE% %TIME% >> identifica_erp.log
"%NODE%" scripts\identifica_erp_por_pagina.mjs >> identifica_erp.log 2>&1
echo ===== FIM %DATE% %TIME% >> identifica_erp.log
endlocal
exit /b 0
