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
set TIPOS=editais
set JANELA=07:00-02:00
"%LOCALAPPDATA%\nodejs\node.exe" scripts\run_reextrai_paralelo.mjs
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
