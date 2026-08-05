@echo off
REM PNIGP — atualização diária das bases (orquestrador de ETL). Agendado via schtasks (PNIGP_ETL_diario).
REM ARMADILHA JA PAGA: o ERRORLEVEL tem que ser guardado ANTES do echo final. Todo echo bem-sucedido zera o
REM ERRORLEVEL, entao quem chamasse este arquivo por "call" e lesse %ERRORLEVEL% depois recebia SEMPRE 0 -
REM o resumo da rodada dava passo 1 como OK mesmo com o node quebrado. Guardar em RC e sair com exit /b RC.
REM SETLOCAL: sem ele, MODO/LOTE/CONC vazam para quem chamou e contaminam os passos seguintes da rodada.
setlocal
cd /d C:\Users\PC\pnigp
set MODO=run
echo. >> etl.log
echo ===== INICIO %DATE% %TIME% (MODO=run) ===== >> etl.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\etl_orquestrador.mjs >> etl.log 2>&1
set RC=%ERRORLEVEL%
echo ===== FIM %DATE% %TIME% (exit %RC%) ===== >> etl.log
endlocal & exit /b %RC%
