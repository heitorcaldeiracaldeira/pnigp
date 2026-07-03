@echo off
REM Busca diaria do PNCP — wrapper para o Agendador de Tarefas do Windows.
cd /d C:\Users\PC\pnigp
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\coleta_diaria_pncp.mjs >> logs\coleta_diaria_pncp.log 2>&1
