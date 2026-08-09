@echo off
REM RE-EXTRACAO COM GEOMETRIA - tarefa "PNIGP - Reextrai Layout".
REM
REM A JANELA E DO PROPRIO SCRIPT, nao so do Agendador: JANELA=07:00-02:00 e checada DENTRO do laco, entao
REM uma corrida iniciada as 23h PARA sozinha as 02:00 em vez de varar a noite. A madrugada e da ETL das
REM fontes de pesquisa, que tambem sai para a internet e escreve no mesmo banco.
REM Parar nao custa nada: layout_v torna tudo retomavel, e sair e literalmente pausar.
REM
REM CRLF obrigatorio; ERRORLEVEL guardado ANTES de qualquer echo.
setlocal
cd /d C:\Users\PC\pnigp
set NSHARD=4
set CONC=3
REM alvo = edital/TR primeiro e, quando acabarem, os documentos de RESULTADO tipo 16, onde mora a marca.
set TIPOS=alvo
set JANELA=07:00-02:00
REM ESCREVE LOG. Ate 09/ago esta tarefa nao registrava nada: rodava de hora em hora e a saida ia para o
REM vazio. Quando o pacote `unpdf` sumiu do node_modules, a re-extracao passou a morrer na largada com
REM ERR_MODULE_NOT_FOUND -- de hora em hora, por horas -- e o Agendador registrava rc=0 porque o supervisor
REM saia limpo. Sem log, "parada" e indistinguivel de "trabalhando", e so a contagem no banco denunciou.
"%LOCALAPPDATA%\nodejs\node.exe" scripts\run_reextrai_paralelo.mjs >> logs\reextrai.log 2>&1
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
