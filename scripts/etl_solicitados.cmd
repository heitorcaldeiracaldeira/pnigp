@echo off
REM Atende pedidos manuais de coleta feitos na tela /etl (botão "Buscar dados"). A cada 15 min.
REM Roda só as fontes marcadas como solicitadas (supervisionado). Leve quando não há pedido.
cd /d C:\Users\PC\pnigp
set MODO=solicitados
"%LOCALAPPDATA%\nodejs\node.exe" scripts\etl_orquestrador.mjs >> "%LOCALAPPDATA%\Temp\pnigp-etl.log" 2>&1
