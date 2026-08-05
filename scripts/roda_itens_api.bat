@echo off
REM CONSUMIDOR DE EVENTO - tarefa "PNIGP - Itens API" do Agendador do Windows, de hora em hora.
REM
REM MIGRADA PARA O RUNNER em 05/ago/2026. Os parametros e o destino do log viraram DECLARACAO em
REM scripts/cadeias.mjs (CADEIAS.itens) e quem cumpre e scripts/roda.mjs. Aqui sobra o ponto de entrada.
REM Para ver a cadeia sem executar: node scripts/roda.mjs itens --plano
REM
REM A TRAVA NAO ESTA NA CADEIA, E SIM DENTRO DO consome_evento_dado.mjs - de proposito. O consumidor e
REM alcancavel por QUATRO portas: esta tarefa, a fonte eventos_dado do orquestrador, o
REM run_enriquecimento_diario.cmd e o runner. Trava posta em qualquer uma delas deixaria as outras tres
REM passando por baixo. E a fila nao se protege sozinha: o SELECT pega consumido_dado IS NULL LIMIT LOTE sem
REM FOR UPDATE SKIP LOCKED, entao dois consumidores escolhem exatamente os MESMOS eventos.
REM
REM O QUE CONTINUA VALENDO E ESTA REGISTRADO EM cadeias.mjs:
REM   resumivel pela flag consumido_dado - posicao no log, nao maquina de estado. Evento que falhou o fetch
REM   nao e marcado e volta no ciclo seguinte.
REM   POR QUE TAREFA E NAO BACKGROUND DO HARNESS: node longo lancado pelo shell MORRE quando o shell volta,
REM   medido em 15 e 22/jul. IgnoreNew no Agendador evita sobreposicao de gatilho.
REM   CRLF e ASCII puro neste arquivo; ERRORLEVEL guardado antes de qualquer echo.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs itens
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
