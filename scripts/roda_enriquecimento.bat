@echo off
REM Enriquecimento da descricao do item com os DOCUMENTOS do processo (TR/Edital/ETP...) — Tarefa Agendada, a cada 15 min.
REM POR QUE tarefa e nao background: node longo lancado pelo harness MORRE quando o shell volta. A tarefa sobrevive.
REM RESUMIVEL/IDEMPOTENTE: NOT EXISTS em app.item_enriquecimento — cada execucao continua de onde parou ate zerar a fila.
REM UM SO RUNNER: a task usa MultipleInstancesPolicy=IgnoreNew (o job leva horas > 15 min), entao um gatilho novo
REM  enquanto ainda roda e IGNORADO; quando a instancia termina/morre, o proximo gatilho retoma via idempotencia.
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
set CONC=5
set LIMIT=0
"%NODE%" scripts\enriquece_item_documento.mjs >> logs\enriquece_escala.log 2>&1
