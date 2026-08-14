@echo off
REM PNIGP - serie 2025 da folha municipal de SC pelo Farol do TCE-SC.
REM Roda pelo agendador porque processo longo em segundo plano da sessao vinha sendo derrubado.
REM O ingest pula ente ja gravado, entao repetir e seguro e a retomada e automatica.
REM SEM PARENTESE e SEM FOR: bloco entre parenteses em .cmd ja custou caro antes.
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
echo ===== INICIO %DATE% %TIME% >> folha_sc.log
set MES=202506
call :RODA
set MES=202507
call :RODA
set MES=202508
call :RODA
set MES=202509
call :RODA
set MES=202510
call :RODA
set MES=202512
call :RODA
echo ===== SERIE COMPLETA %DATE% %TIME% >> folha_sc.log
endlocal
exit /b 0

:RODA
echo --- competencia %MES% inicio %TIME% >> folha_sc.log
"%NODE%" scripts\ingest_folha_farol.mjs >> folha_sc.log 2>&1
set RC=%ERRORLEVEL%
echo --- competencia %MES% fim exit %RC% %TIME% >> folha_sc.log
goto :EOF
