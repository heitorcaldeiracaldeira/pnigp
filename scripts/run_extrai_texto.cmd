@echo off
REM Tarefa PNIGP-Extrai-Texto — baixa o texto de TODOS os documentos pendentes (universo=todos) do PNCP.
REM Resumível (grava=feito) e idempotente: cada relance continua de onde parou. Relançada a cada 20 min pela
REM Task Scheduler com IgnoreNew (nunca sobrepõe). DESATIVAR quando pendentes = 0.
cd /d C:\Users\PC\pnigp
set NSHARD=4
set CONC=3
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\run_extrai_texto_paralelo.mjs >> logs\extrai_texto_task.log 2>&1
