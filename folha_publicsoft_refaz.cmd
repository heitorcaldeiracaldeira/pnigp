cd /d C:\Users\PC\pnigp
set REFAZ=1
set LOG=C:\Users\PC\.claude\logs\folha_publicsoft_refaz_%RANDOM%.log
node scripts\ingest_folha_publicsoft.mjs >> %LOG% 2>&1