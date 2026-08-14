@echo off
REM PNIGP - reprocessa a despesa de pessoal do RS (2025 e 2026) com a competencia correta.
REM O mes vem de dt_operacao, nao de mes_recebimento - ver comentario no ingest.
setlocal
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe
echo ===== INICIO %DATE% %TIME% >> folha_rs.log
set ANO=2025
echo --- ano 2025 >> folha_rs.log
"%NODE%" scripts\ingest_folha_tcers.mjs >> folha_rs.log 2>&1
set ANO=2026
echo --- ano 2026 >> folha_rs.log
"%NODE%" scripts\ingest_folha_tcers.mjs >> folha_rs.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_rs.log
endlocal
exit /b 0
