@echo off
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_megasoft.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_megasoft.mjs >> folha_megasoft.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_megasoft.log
endlocal
exit /b 0
