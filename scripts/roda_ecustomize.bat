@echo off
REM EXTRAÇÃO DETERMINÍSTICA ECustomize — parser_ecustomize (propostas de TODOS os fornecedores + marca + lances), sobre o
REM texto já baixado. Rápido (sem LLM), RESUMÍVEL (marca_ata_feitas), relança a cada 15 min. Tarefa separada do download.
cd /d C:\Users\PC\pnigp
echo ==== %DATE% %TIME% :: EXTRAI ECUSTOMIZE ==== >> logs\ecustomize_task.log
node scripts\extrai_ecustomize.mjs >> logs\ecustomize_task.log 2>&1
