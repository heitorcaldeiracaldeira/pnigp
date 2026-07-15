@echo off
REM DOWNLOAD do texto das atas (todas as plataformas/modalidades) — Tarefa Agendada do Windows (sobrevive ao kill de
REM node longo do harness). RESUMÍVEL, relança a cada 15 min ate zerar. Extração é tarefa separada (Neon-safe: 1 node por vez aqui).
cd /d C:\Users\PC\pnigp
set CONC=3
set PDF_TIMEOUT=30000
echo ==== %DATE% %TIME% :: DOWNLOAD ==== >> logs\atas_task.log
node scripts\ingest_arquivo_texto_sc.mjs >> logs\atas_task.log 2>&1
