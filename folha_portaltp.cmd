@echo off
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_portaltp.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_portaltp.mjs >> folha_portaltp.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_portaltp.log
endlocal
exit /b 0
