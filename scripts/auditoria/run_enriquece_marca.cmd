@echo off
REM Enriquecimento de marca — motor unificado (sucessor do coletor PCP; cobre TODOS os portais).
REM Cadeia: acervo -> PNCP -> portal de origem (id do doc; linkSistemaOrigem com backoff se USAR_LINK).
REM Idempotente (app.enriq_marca_feitas_sc); durável pela task "Enriquece marca" (IgnoreNew; retoma se cair).
cd /d C:\Users\PC\pnigp
set LIMIT=0
set CONC=3
set USAR_LINK=1
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\enriquece_marca.mjs >> logs\enriquece_marca.log 2>&1
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\consolida_marca.mjs >> logs\enriquece_marca.log 2>&1
