@echo off
REM Ingestão PNCP autônoma — chamada pela Tarefa Agendada do Windows a cada 15 min.
REM Resumível (itens_proc_feitos / arquivos_proc_feitos): cada execução continua de onde parou.
REM Roda em SÉRIE (itens; depois arquivos) para não competir pelo rate-limit do PNCP.
cd /d C:\Users\PC\pnigp
set NODE=C:\Users\PC\AppData\Local\nodejs\node.exe

REM 1) ITENS — enquanto houver pendente, esta execução avança; a próxima chamada da tarefa continua.
"%NODE%" scripts\ingest_itens_sc.mjs >> logs\itens_completo.log 2>&1

REM 2) ARQUIVOS (atas) — só começa a consumir a fila quando os itens já estão fechando; roda depois na mesma chamada.
"%NODE%" scripts\ingest_arquivos_sc.mjs >> logs\arquivos_completo.log 2>&1
