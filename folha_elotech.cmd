@echo off
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_elotech.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_elotech.mjs >> folha_elotech.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_elotech.log
endlocal
exit /b 0
