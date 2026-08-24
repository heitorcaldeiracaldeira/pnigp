cd /d C:\Users\PC\pnigp
set UF=SP
set LOG=C:\Users\PC\.claude\logs\folha_scpi_sp_%RANDOM%.log
node scripts\ingest_folha_scpi.mjs >> %LOG% 2>&1