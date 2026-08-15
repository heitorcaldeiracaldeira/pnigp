@echo off
REM PNIGP - quadro de pessoal dos 185 municipios de PE (TCE-PE Dados Abertos, ListaServidores).
REM Job LONGO: 1.443 unidades jurisdicionadas pendentes, uma chamada cada. Roda pelo Agendador porque o
REM background da sessao morre em ~1h. O coletor retoma de onde parou (pula UJ ja gravada).
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_tcepe.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\ingest_folha_tcepe.mjs >> folha_tcepe.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_tcepe.log
endlocal
exit /b 0
