@echo off
REM CLASSIFICACAO DO ITEM - tarefa "PNIGP - Classificacao", diaria as 01:00.
REM O horario e ANTES do PNIGP-ETL-Diario (02:00) de proposito: o orquestrador constroi o banco de
REM precos a partir do item_catmat_map que ESTA cadeia produz. Invertido, o preco sai de mapa velho.
REM A ordem dos passos mora em scripts/cadeias.mjs (CADEIAS.classificacao) e foi DERIVADA das dependencias
REM reais de cada script: catmat -> catser -> sigtap (le os dois mapas) -> camada unica -> portao.
REM Depende de itens_sc fresco (cadeia `itens`), NAO do enriquecimento.
REM O ultimo passo e um PORTAO: sai 1 se o ponto de operacao regredir, e a tarefa marca falha de proposito.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs classificacao
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%