@echo off
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_genexus.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_genexus_srvbr.mjs >> folha_genexus.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_genexus.log
endlocal
exit /b 0
