@echo off
REM RODADA COMPLETA FORCADA - tarefa "PNIGP - Rodada completa", sob demanda (sem gatilho diario).
REM Pedido do Heitor 04/ago/2026: "force uma atualizacao completa com os dados do pncp, itens, enriquecimento
REM do descritivo, marca modelo, casamento com os dados do TCE ... para verificacao".
REM
REM NAO tem gatilho diario de proposito: as cadeias ja tem horario proprio na madrugada e dispara-las juntas
REM faria as cinco disputarem o mesmo banco. Esta tarefa e para rodar TUDO de uma vez, quando alguem manda.
REM
REM ORDEM E DEPENDENCIA:
REM   1 etl_orquestrador MODO=run  : coleta do PNCP e das demais fontes devidas
REM   2 consome_evento_dado        : drena a fila de eventos, mantem itens_sc fresco
REM   3 enriquece_paralelo         : descricao do item a partir dos documentos, 1 processo por nucleo
REM   4 auditoria/pipeline         : cadeia da marca/modelo, 16 etapas + consolida
REM   5 roda_tce                   : casamento TCE x PNCP, saneamento do valor e fila de averiguacao
REM O TCE vem por ultimo porque le itens_sc e contratos_sc ja atualizados pelos passos 1 e 2.
REM
REM AQUI NAO SE PARA NO PRIMEIRO ERRO, ao contrario do roda_tce.cmd: as cinco cadeias sao independentes o
REM bastante, e numa rodada DE VERIFICACAO esconder as quatro que funcionam por causa de uma que quebrou e
REM pior do que seguir e reportar. O resumo no fim diz o codigo de saida de cada uma.
REM
REM ARMADILHAS JA PAGAS neste arquivo: precisa de CRLF e ASCII puro; nenhum sinal de MAIOR-QUE em linha REM,
REM porque o cmd.exe redireciona mesmo dentro de comentario e cria arquivo vazio na raiz do repo; e nenhum
REM parentese no rotulo passado a :etapa, porque o fecha-parentese encerra o bloco na expansao de %~1.
setlocal
cd /d C:\Users\PC\pnigp
set LOG=%LOCALAPPDATA%\Temp\pnigp-tudo.log
set NODE=%LOCALAPPDATA%\nodejs\node.exe

echo. >> "%LOG%"
echo ===== RODADA COMPLETA - INICIO %DATE% %TIME% ===== >> "%LOG%"

set MODO=run
call :etapa "1/5 coleta PNCP e fontes devidas" scripts\etl_orquestrador.mjs
set E1=%ERRORLEVEL%
set MODO=

set LOTE=25000
set CONC=6
call :etapa "2/5 consumidor de evento - itens" scripts\consome_evento_dado.mjs
set E2=%ERRORLEVEL%

set LIMIT=0
call :etapa "3/5 enriquecimento do descritivo" scripts\enriquece_paralelo.mjs
set E3=%ERRORLEVEL%

call :etapa "4/5 cadeia da marca e modelo" scripts\auditoria\pipeline.mjs
set E4=%ERRORLEVEL%

echo. >> "%LOG%"
echo --- 5/5 casamento TCE e fila :: %TIME% --- >> "%LOG%"
call scripts\roda_tce.cmd
set E5=%ERRORLEVEL%

echo. >> "%LOG%"
echo ===== RESUMO DA RODADA %DATE% %TIME% ===== >> "%LOG%"
echo   1 coleta PNCP .............. exit %E1% >> "%LOG%"
echo   2 itens por evento ......... exit %E2% >> "%LOG%"
echo   3 enriquecimento descritivo. exit %E3% >> "%LOG%"
echo   4 marca e modelo ........... exit %E4% >> "%LOG%"
echo   5 TCE e fila ............... exit %E5% >> "%LOG%"
echo ===== RODADA COMPLETA - FIM %DATE% %TIME% ===== >> "%LOG%"
endlocal
exit /b 0

:etapa
echo. >> "%LOG%"
echo --- %~1 :: %TIME% --- >> "%LOG%"
"%NODE%" %~2 >> "%LOG%" 2>&1
if errorlevel 1 goto :etapa_erro
exit /b 0

:etapa_erro
echo *** FALHOU: %~1 >> "%LOG%"
exit /b 1
