@echo off
REM PNIGP - AUDITORIA DA FOLHA. Roda as tres provas que pegam o que o livro-razao marca como 'ok' e esta errado:
REM   1) entidade declarada x municipio  2) host compartilhado / linhas sem nome / folhas gemeas
REM   3) homonimos do GovBR (so relata; APLICAR=1 apaga)
REM So RELATA - apagar continua sendo decisao caso a caso. Leva ~2 min. Rodar DEPOIS dos coletores de folha.
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_auditoria.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\roda.mjs folha_auditoria >> folha_auditoria.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_auditoria.log
endlocal
exit /b 0
