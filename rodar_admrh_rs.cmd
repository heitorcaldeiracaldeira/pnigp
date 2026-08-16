@echo off
REM ADMRH: um municipio por vez (cada um abre navegador proprio e busca a ficha de valor por servidor)
cd /d C:\Users\PC\pnigp
set NODE_TLS_REJECT_UNAUTHORIZED=0
set COM_VALOR=1
set HOST=transparencia.lajeado.rs.gov.br
set IBGE=4311403
set MUN=Lajeado
node scripts\ingest_folha_admrh.mjs
set HOST=transparencia.taquara.rs.gov.br
set IBGE=4321204
set MUN=Taquara
node scripts\ingest_folha_admrh.mjs
set HOST=transparencia.saofranciscodepaula.rs.gov.br
set IBGE=4318200
set MUN=Sao Francisco de Paula
node scripts\ingest_folha_admrh.mjs
