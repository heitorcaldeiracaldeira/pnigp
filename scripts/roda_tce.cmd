@echo off
REM CADEIA DO TCE - tarefa "PNIGP - TCE diario" do Agendador do Windows, diaria as 02:00.
REM
REM MIGRADA PARA O RUNNER em 05/ago/2026. Este arquivo era 109 linhas com os 10 passos, a trava, o rotulo
REM :etapa, o corte no primeiro erro e o formato do log. Tudo isso agora e DECLARACAO em scripts/cadeias.mjs
REM e quem cumpre e scripts/roda.mjs, igual para todas as cadeias. Aqui sobra o que so o Agendador precisa:
REM um .cmd para apontar.
REM
REM ONDE FORAM PARAR AS COISAS:
REM   os 10 passos, na ordem, com timeout de cada um ....... scripts/cadeias.mjs, CADEIAS.tce.passos
REM   "para no primeiro erro" .............................. CADEIAS.tce.aoFalhar = "parar"
REM   a trava cadeia_tce, tolerancia 45 min ................ CADEIAS.tce.trava
REM   o log em pnigp-tce.log .............................. CADEIAS.tce.log
REM   o motivo de cada dependencia entre passos ........... comentarios em cadeias.mjs, ao lado do passo
REM
REM Para ver a cadeia sem executar: node scripts/roda.mjs tce --plano
REM
REM ARMADILHAS QUE CONTINUAM VALENDO PARA ESTE ARQUIVO:
REM   CRLF e ASCII puro. Com quebra LF o cmd.exe se perde ao processar call, rotulo e goto, porque reposiciona
REM   por offset de byte, e passa a executar pedaco de comentario como comando.
REM   O ERRORLEVEL tem que ser guardado ANTES de qualquer echo: echo bem-sucedido zera o ERRORLEVEL, e quem
REM   chamasse por call leria 0 mesmo com a cadeia quebrada.
REM   POR QUE TAREFA E NAO BACKGROUND DO HARNESS: node longo lancado pelo shell MORRE quando o shell volta.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs tce
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
