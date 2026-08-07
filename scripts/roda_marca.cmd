@echo off
REM CADEIA DA MARCA - tarefa "PNIGP - Marca diaria" do Agendador do Windows.
REM Roda a cadeia inteira: evento (ao_homologar) -> fila -> 11 extratores -> conferencia -> consolida.
REM Incremental: cada etapa e resumivel e so toca o que homologou/mudou desde a rodada anterior.
REM Lock no Postgres: se houver rodada manual em curso, sai limpo sem corromper marca_ata_feitas.
REM POR QUE tarefa e nao background do harness: node longo lancado pelo shell MORRE quando o shell volta.
REM ARMADILHA JA PAGA: guardar o ERRORLEVEL do node ANTES de qualquer echo. Echo bem-sucedido zera o
REM ERRORLEVEL, entao o "(exit %ERRORLEVEL%)" da linha final imprimia 0 SEMPRE, e quem chamasse por "call"
REM lia 0 mesmo com a cadeia quebrada - a rodada dava o passo da marca como OK sem ele ter rodado.
REM SETLOCAL: isola o ambiente; sem ele, CONC/LOTE/LIMIT de outro passo chegam aos 17 extratores, que sao
REM calibrados para CONC=3 - o pipeline repassa process.env inteiro para cada etapa.
REM MIGRADO PARA O RUNNER em 07/ago. Antes chamava o pipeline direto; agora passa por roda.mjs, como as
REM cadeias itens/tce/enriquecimento/coletores. O que se ganha: a cadeia vira DADO (cadeias.mjs), o log fica
REM padronizado, e a execucao entra no registro em vez de existir so no .log deste arquivo.
REM O carimbo de INICIO/FIM sai daqui porque o runner ja o escreve -- duplicar so suja o log.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs marca
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
