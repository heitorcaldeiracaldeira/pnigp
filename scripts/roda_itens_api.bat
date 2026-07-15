@echo off
REM ITENS + TODOS OS RESULTADOS por item (API do PNCP) — Tarefa Agendada do Windows.
REM POR QUE tarefa e nao background: node longo lancado pelo harness MORRE quando o shell volta. Tentei nohup e
REM run_in_background em 2026-07-15: as duas vezes o processo sumiu sem gravar nada. A tarefa sobrevive.
REM RESUMIVEL: itens_proc_feitos.versao (ingest_versao.mjs). Relanca a cada 15 min ate zerar a fila.
REM
REM VELOCIDADE: o gargalo e HTTP (~1,1 milhao de GETs em /resultados, um por item premiado), NAO o Neon
REM (medido: 3 conexoes de 901, 0 query ativa, 0 lock; INSERT ja e 1 por processo em lote).
REM CONC=8 processos x CONC_RES=12 GETs = ~96 requisicoes em voo. O backoff de 429 (ate ~32s, 8 tentativas) segura.
REM Se o PNCP comecar a 429 em massa, baixar CONC primeiro (nao CONC_RES).
cd /d C:\Users\PC\pnigp
set CONC=8
set CONC_RES=12
node scripts\ingest_itens_sc.mjs >> "%TEMP%\pnigp_itens_api.log" 2>&1
