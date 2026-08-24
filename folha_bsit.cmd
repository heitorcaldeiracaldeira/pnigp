cd /d C:\Users\PC\pnigp
rem log por execucao: node antigo segurando o arquivo faz o >> falhar e o .cmd morre antes de rodar
set LOG=C:\Users\PC\.claude\logs\folha_bsit_%RANDOM%.log
node scripts\ingest_folha_bsit.mjs >> %LOG% 2>&1
