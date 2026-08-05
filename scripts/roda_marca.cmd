@echo off
REM CADEIA DA MARCA — tarefa "PNIGP - Marca diaria" do Agendador do Windows.
REM Roda a cadeia inteira: evento (ao_homologar) -> fila -> 11 extratores -> conferencia -> consolida.
REM Incremental: cada etapa e resumivel e so toca o que homologou/mudou desde a rodada anterior.
REM Lock no Postgres: se houver rodada manual em curso, sai limpo sem corromper marca_ata_feitas.
REM POR QUE tarefa e nao background do harness: node longo lancado pelo shell MORRE quando o shell volta.
REM ARMADILHA JA PAGA: guardar o ERRORLEVEL do node ANTES de qualquer echo. Echo bem-sucedido zera o
REM ERRORLEVEL, entao o "(exit %ERRORLEVEL%)" da linha final imprimia 0 SEMPRE, e quem chamasse por "call"
REM lia 0 mesmo com a cadeia quebrada - a rodada dava o passo da marca como OK sem ele ter rodado.
REM SETLOCAL: isola o ambiente; sem ele, CONC/LOTE/LIMIT de outro passo chegam aos 17 extratores, que sao
REM calibrados para CONC=3 - o pipeline repassa process.env inteiro para cada etapa.
setlocal
cd /d C:\Users\PC\pnigp
echo. >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
echo ===== INICIO %DATE% %TIME% ===== >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
"%LOCALAPPDATA%\nodejs\node.exe" scripts\auditoria\pipeline.mjs >> "%LOCALAPPDATA%\Temp\pnigp-marca.log" 2>&1
set RC=%ERRORLEVEL%
echo ===== FIM %DATE% %TIME% (exit %RC%) ===== >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
endlocal & exit /b %RC%
