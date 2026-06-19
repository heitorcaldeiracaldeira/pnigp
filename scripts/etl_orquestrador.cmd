@echo off
REM Orquestrador de coleta PNIGP — roda diariamente via Agendador de Tarefas do Windows.
REM Detecta novidade por fonte e coleta só o que falta (incremental, idempotente).
cd /d C:\Users\PC\pnigp
set MODO=run
"%LOCALAPPDATA%\nodejs\node.exe" scripts\etl_orquestrador.mjs >> "%LOCALAPPDATA%\Temp\pnigp-etl.log" 2>&1
