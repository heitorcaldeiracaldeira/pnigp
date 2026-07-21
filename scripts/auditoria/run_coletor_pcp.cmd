@echo off
REM Coletor PCP durável — marca dos portais de origem (Portal de Compras Publicas).
REM Idempotente via app.pcp_feitas_sc; roda o acervo todo. Relancado pela task Windows
REM "Coletor PCP marca" (IgnoreNew: nao dobra se ja estiver rodando; retoma se caiu).
cd /d C:\Users\PC\pnigp
set LIMIT=0
set CONC=3
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\coletor_pcp.mjs >> logs\coletor_pcp.log 2>&1
