@echo off
REM CATALOGOS FEDERAIS - tarefa "PNIGP - Catalogos", MENSAL (dia 5, 03:00).
REM Mensal e nao diaria porque CATMAT/CATSER/SIGTAP mudam por COMPETENCIA. O SIGTAP publica a competencia
REM do mes no comeco dele; dia 5 da folga. Depois de rodar isto, a cadeia `classificacao` do dia seguinte
REM ja casa contra os catalogos novos.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs catalogos
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%