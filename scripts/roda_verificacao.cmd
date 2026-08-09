@echo off
REM VERIFICACAO DIARIA - tarefa "PNIGP - Verificacao diaria".
REM
REM Roda scripts\verifica_noite.mjs e ESCREVE LOG. O script sai com codigo 1 quando ha ALERTA, entao o
REM Agendador registra a falha em LastTaskResult e o alerta existe mesmo sem ninguem abrir o arquivo.
REM
REM POR QUE ESTA TAREFA EXISTE: em 09/ago a re-extracao ficou HORAS parada porque o pacote `unpdf` sumiu do
REM node_modules. A tarefa dela rodava de hora em hora, o Agendador registrava rc=0 (o supervisor saia
REM limpo) e nao havia log -- "parada" era indistinguivel de "trabalhando". So a contagem no banco
REM denunciou, e por acaso. Este verificador faz essa contagem todo dia: fila com pendente e ZERO
REM processado em 24h vira alerta.
REM
REM CRLF obrigatorio; ERRORLEVEL guardado ANTES de qualquer echo (todo echo bem-sucedido zera o ERRORLEVEL).
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\verifica_noite.mjs >> logs\verificacao.log 2>&1
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
