@echo off
REM PNIGP - varredura nacional: qual ERP cada municipio usa (portal que responde).
REM Receitas em scripts\_erp_receitas.mjs - um ERP novo e uma linha la, nao uma sessao inteira.
REM Retomada em erp_varredura (registra ate o negativo, para nao repetir teste).
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set CONC=16
echo ===== INICIO %DATE% %TIME% >> erp_varredura.log
"%NODE%" scripts\descobre_erp_municipal.mjs >> erp_varredura.log 2>&1
echo ===== FIM %DATE% %TIME% >> erp_varredura.log
endlocal
exit /b 0
