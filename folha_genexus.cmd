cd /d C:\Users\PC\pnigp
set LOG=C:\Users\PC\.claude\logs\folha_genexus_%RANDOM%.log
node scripts\ingest_folha_genexus_srvbr.mjs >> %LOG% 2>&1