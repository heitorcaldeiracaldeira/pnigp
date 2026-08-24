@echo off
REM PNIGP - CAMADA DA FOLHA DAS CAMARAS MUNICIPAIS (frente aberta em 21/ago/2026).
REM   1) vw_folha_camara_brasil       - o mesmo contrato de colunas da folha das prefeituras, mais o CPF mascarado
REM   2) vw_folha_camara_pessoa       - uma linha por SERVIDOR, com a chave de identificacao declarada
REM   3) mapa_folha_camaras           - placar nacional (RAIS 1066 como denominador) e a fila do que falta
REM As tres sao DERIVADAS: nao coletam nada, so releem as tabelas folha_servidores_*. Rodar DEPOIS dos coletores.
REM Sem isto a camada envelhece calada - camara colhida hoje so apareceria quando alguem rodasse a mao.
setlocal
cd /d C:\Users\PC\pnigp
echo ===== INICIO %DATE% %TIME% >> folha_camaras.log
"C:\Users\PC\AppData\Local\nodejs\node.exe" scripts\roda.mjs folha_camaras >> folha_camaras.log 2>&1
echo ===== FIM %DATE% %TIME% >> folha_camaras.log
endlocal
exit /b 0
