cd /d C:\Users\PC\pnigp
set SO_SEM_MENSAL=1
set LOG=C:\Users\PC\.claude\logs\folha_scpi_semmensal_%RANDOM%.log
node scripts\ingest_folha_scpi.mjs >> %LOG% 2>&1