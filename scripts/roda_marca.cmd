@echo off
REM CADEIA DA MARCA — tarefa "PNIGP - Marca diaria" do Agendador do Windows.
REM Roda a cadeia inteira: evento (ao_homologar) -> fila -> 11 extratores -> conferencia -> consolida.
REM Incremental: cada etapa e resumivel e so toca o que homologou/mudou desde a rodada anterior.
REM Lock no Postgres: se houver rodada manual em curso, sai limpo sem corromper marca_ata_feitas.
REM POR QUE tarefa e nao background do harness: node longo lancado pelo shell MORRE quando o shell volta.
cd /d C:\Users\PC\pnigp
echo. >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
echo ===== INICIO %DATE% %TIME% ===== >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
"%LOCALAPPDATA%\nodejs\node.exe" scripts\auditoria\pipeline.mjs >> "%LOCALAPPDATA%\Temp\pnigp-marca.log" 2>&1
echo ===== FIM %DATE% %TIME% (exit %ERRORLEVEL%) ===== >> "%LOCALAPPDATA%\Temp\pnigp-marca.log"
