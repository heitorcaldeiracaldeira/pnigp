@echo off
REM Enriquecimento de marca INCREMENTAL (dirigido por evento). NÃO varre o passado exausto —
REM só enriquece o que (des)homologou desde o watermark. ao_homologar detecta o evento;
REM enriquece_marca (INCREMENTAL) processa o delta; consolida ancora. Durável: task "Enriquece marca"
REM (IgnoreNew; se não houver evento novo, sai rápido). id fresco disponível → custo baixo.
cd /d C:\Users\PC\pnigp
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\ao_homologar.mjs >> logs\enriquece_marca.log 2>&1
set INCREMENTAL=1
set CONC=3
set USAR_LINK=1
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\enriquece_marca.mjs >> logs\enriquece_marca.log 2>&1
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\auditoria\consolida_marca.mjs >> logs\enriquece_marca.log 2>&1
