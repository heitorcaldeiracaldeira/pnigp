@echo off
REM EXTRAÇÃO DETERMINÍSTICA das atas, roteada pelo GERADOR do documento (arquivo_texto_sc.gerador) — NAO pela
REM plataforma do PNCP, que e so quem PUBLICOU (ver scripts\mapa_atas_plataformas.mjs).
REM   1) portal_compras_publicas -> parser_ecustomize (propostas de TODOS + marca + lances)
REM   2) betha                   -> parser_betha      (marca por item do vencedor + disputa por lote)
REM Em SERIE de proposito: 1 node por vez = Neon-safe (o download e tarefa separada). Rapido (sem LLM),
REM RESUMIVEL (marca_ata_feitas), relanca a cada 15 min.
cd /d C:\Users\PC\pnigp
echo ==== %DATE% %TIME% :: EXTRAI PORTAL COMPRAS PUBLICAS ==== >> logs\ecustomize_task.log
node scripts\extrai_ecustomize.mjs >> logs\ecustomize_task.log 2>&1
echo ==== %DATE% %TIME% :: EXTRAI BETHA ==== >> logs\ecustomize_task.log
node scripts\extrai_betha.mjs >> logs\ecustomize_task.log 2>&1
