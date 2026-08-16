cd /d C:\Users\PC\pnigp
echo ==== PASSADA 2: janela larga nos que ficaram sem publicacao ==== >> C:\Users\PC\.claude\logs\folha_tcmba.log
node scripts\_tcmba_reabre.mjs >> C:\Users\PC\.claude\logs\folha_tcmba.log 2>&1
set JANELA=18
set SONDAR=3
node scripts\ingest_folha_tcmba.mjs >> C:\Users\PC\.claude\logs\folha_tcmba.log 2>&1
echo ==== PASSADA 3: autarquias, empresas, institutos e previdencias - SEM camaras e SEM consorcios ==== >> C:\Users\PC\.claude\logs\folha_tcmba.log
set TIPO=EXECUTIVO
set JANELA=12
node scripts\ingest_folha_tcmba.mjs >> C:\Users\PC\.claude\logs\folha_tcmba.log 2>&1
echo ==== FIM ==== >> C:\Users\PC\.claude\logs\folha_tcmba.log
