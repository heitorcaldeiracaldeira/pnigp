@echo off
REM PNIGP — atualização diária das bases (orquestrador de ETL). Agendado via schtasks (PNIGP_ETL_diario).
cd /d C:\Users\PC\pnigp
set MODO=run
echo. >> etl.log
echo ===== INICIO %DATE% %TIME% (MODO=run) ===== >> etl.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\etl_orquestrador.mjs >> etl.log 2>&1
echo ===== FIM %DATE% %TIME% ===== >> etl.log
