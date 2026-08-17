cd /d C:\Users\PC\pnigp
rem LOG POR EXECUCAO: um node antigo segurando o arquivo faz o redirecionamento >> falhar e o .cmd
rem morre ANTES de rodar qualquer coisa - a tarefa sai com resultado 1 e nada aparece no log.
rem Ja derrubou a tarefa do TCM-BA do mesmo jeito. %RANDOM% da um nome livre a cada execucao.
set LOG=C:\Users\PC\.claude\logs\folha_nucleogov_%RANDOM%.log
node scripts\ingest_folha_nucleogov.mjs >> %LOG% 2>&1
