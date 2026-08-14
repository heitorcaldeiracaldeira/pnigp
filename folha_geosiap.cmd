@echo off
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_geosiap.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_geosiap.mjs >> folha_geosiap.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_geosiap.log
endlocal
exit /b 0
