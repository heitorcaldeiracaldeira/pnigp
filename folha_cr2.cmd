@echo off
REM PNIGP - folha nominal dos municipios CR2 (94 no Para) via folha.governotransparente.com.br. Sem captcha.
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_cr2.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_cr2.mjs >> folha_cr2.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_cr2.log
endlocal
exit /b 0
