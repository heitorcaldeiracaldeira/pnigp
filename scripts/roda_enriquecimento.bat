@echo off
REM ENRIQUECIMENTO DA DESCRICAO DO ITEM - tarefa "PNIGP Enriquece Item Documento" (hoje DESATIVADA no Agendador).
REM
REM MIGRADA PARA O RUNNER em 05/ago/2026. Os parametros e o destino do log viraram declaracao em
REM scripts/cadeias.mjs (CADEIAS.enriquecimento). Para ver sem executar: node scripts/roda.mjs enriquecimento --plano
REM
REM A TAREFA ESTA DESATIVADA, e este arquivo so continua existindo para o dia em que for religada - o
REM enriquecimento hoje entra pela rodada completa e pelo run_enriquecimento_diario.cmd. Se ficar claro que
REM nao volta, o certo e apagar a tarefa e o arquivo juntos, em vez de deixar porta morta no repo.
REM
REM O QUE CONTINUA VALENDO, agora registrado em cadeias.mjs:
REM   RESUMIVEL/IDEMPOTENTE: NOT EXISTS em app.item_enriquecimento - cada execucao continua de onde parou.
REM   PARALELO: 1 processo por nucleo, fatias disjuntas por hash. O lancador reconstroi a fila antes de abrir
REM   os shards, entao NAO existe passo separado de fila - declarar um faria a varredura duas vezes.
REM   UM SO RUNNER: alem do IgnoreNew do Agendador, agora ha a trava cadeia_enriquecimento no banco, que vale
REM   tambem contra a rodada completa e contra o enriquecimento diario - o IgnoreNew so protege dentro da
REM   mesma tarefa, nao entre tarefas diferentes.
REM   POR QUE TAREFA E NAO BACKGROUND: node longo lancado pelo harness MORRE quando o shell volta.
REM   CRLF e ASCII puro; ERRORLEVEL guardado antes de qualquer echo.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs enriquecimento
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
