@echo off
REM CADEIA DO TCE/SC - tarefa "PNIGP - TCE diario" do Agendador do Windows.
REM
REM POR QUE TAREFA E NAO BACKGROUND DO HARNESS: node longo lancado pelo shell MORRE quando o shell volta.
REM Mesmo motivo do roda_marca.cmd.
REM
REM POR QUE EXISTE: sem isto, o casamento TCE x PNCP, o saneamento do valor e a FILA DE AVERIGUACAO que a
REM equipe da prefeitura ve na tela ficam parados no dia em que foram construidos a mao - enquanto o PNCP
REM recebe processo novo todo dia. Foi o gap que ja aconteceu com a extracao de marca: script pronto que
REM ninguem mandava rodar.
REM
REM ATENCAO AO SALVAR: este arquivo TEM QUE FICAR EM CRLF e em ASCII puro. Com quebra LF o cmd.exe se perde
REM ao processar "call", rotulo e "goto" (ele reposiciona por offset de byte no arquivo) e passa a executar
REM pedaco de comentario como comando - foi exatamente o que aconteceu na primeira versao deste arquivo.
REM
REM A ORDEM IMPORTA e a cadeia PARA no primeiro erro. Cada etapa consome a anterior:
REM   1 casa_tcesc_pncp                   : app.processo_tce_pncp (base: ente+numero+ano)
REM   2 sanea_valor_item_tcesc            : app.tce_item_valor / tce_contrato_valor - 1a passada
REM   3 casa_tcesc_objeto_valor           : acrescenta pares por objeto+valor (le o valor saneado)
REM   4 casa_tcesc_objeto_datas           : acrescenta pares por objeto+datas e grava confianca
REM   5 sanea_valor_item_tcesc            : 2a passada: agora o TETO ve o casamento COMPLETO
REM   6 casa_contrato_tcesc               : app.contrato_tce_pncp (le o valor saneado, nao recalcula)
REM   7 audita_casamento_tce              : app.tce_match_auditoria (so audita; NAO promove sozinho)
REM   8 constroi_tce_apontamentos         : quadro do municipio
REM   9 constroi_tce_apontamento_processo : liga apontamento ao nosso processo
REM  10 constroi_fila_divergencia_valor   : app.tce_divergencia_valor (a fila da equipe)
REM
REM POR QUE O SANEAMENTO RODA DUAS VEZES: o teto do valor sai do que a licitacao homologou, e so se chega a
REM licitacao pelo processo casado. Mas os casadores 3 e 4 usam o valor saneado como SINAL para casar. Uma
REM passada antes (teto parcial) alimenta os casadores; outra depois fecha o teto com o casamento inteiro.
REM Sem a 2a passada, todo par novo descoberto em 3 e 4 fica sem teto ate a rodada do dia seguinte.
REM
REM O passo 1 RECONSTROI app.processo_tce_pncp e a tabela nasce sem as colunas que 3 e 4 acrescentam - por
REM isso 9 quebrava com "column m.confianca does not exist" quando a ordem pulava esses dois.
REM
REM Se o passo 2 falhar e a cadeia seguisse, o 6 leria valor VELHO e a fila sairia com divergencia que nao
REM existe - por isso o corte no primeiro erro em vez de "religa e continua".
setlocal
cd /d C:\Users\PC\pnigp
set LOG=%LOCALAPPDATA%\Temp\pnigp-tce.log
set NODE=%LOCALAPPDATA%\nodejs\node.exe

REM TRAVA - o passo 1 faz DROP e reconstroi app.processo_tce_pncp. Duas execucoes sobrepostas, a tarefa das
REM 02:00 contra o passo 5 de uma rodada forcada, derrubam a tabela debaixo do passo 6 da outra. Ate 05/ago
REM esta cadeia nao tinha exclusao nenhuma: a justificativa toda dela e consistencia de dado, e o mecanismo
REM que garantiria isso faltava. Dono com %RANDOM% duplo para que duas execucoes nunca compartilhem dono.
set DONO=tce-%RANDOM%%RANDOM%
"%NODE%" scripts\trava.mjs pega cadeia_tce %DONO% 45 >> "%LOG%" 2>&1
if errorlevel 1 goto :ocupado

echo. >> "%LOG%"
echo ===== INICIO %DATE% %TIME% ===== >> "%LOG%"

call :etapa "1/10 casamento por numero de edital" scripts\casa_tcesc_pncp.mjs
if errorlevel 1 goto :falhou
call :etapa "2/10 saneamento do valor - 1a passada" scripts\sanea_valor_item_tcesc.mjs
if errorlevel 1 goto :falhou
call :etapa "3/10 casamento por objeto+valor" scripts\casa_tcesc_objeto_valor.mjs
if errorlevel 1 goto :falhou
call :etapa "4/10 casamento por objeto+datas" scripts\casa_tcesc_objeto_datas.mjs
if errorlevel 1 goto :falhou
call :etapa "5/10 saneamento do valor - 2a passada" scripts\sanea_valor_item_tcesc.mjs
if errorlevel 1 goto :falhou
call :etapa "6/10 casamento contrato" scripts\casa_contrato_tcesc.mjs
if errorlevel 1 goto :falhou
call :etapa "7/10 auditoria do casamento" scripts\audita_casamento_tce.mjs
if errorlevel 1 goto :falhou
call :etapa "8/10 quadro de apontamentos" scripts\constroi_tce_apontamentos.mjs
if errorlevel 1 goto :falhou
call :etapa "9/10 apontamento no processo" scripts\constroi_tce_apontamento_processo.mjs
if errorlevel 1 goto :falhou
call :etapa "10/10 fila de averiguacao" scripts\constroi_fila_divergencia_valor.mjs
if errorlevel 1 goto :falhou

echo ===== FIM %DATE% %TIME% (ciclo completo) ===== >> "%LOG%"
"%NODE%" scripts\trava.mjs solta cadeia_tce %DONO% >> "%LOG%" 2>&1
endlocal
exit /b 0

REM Ja havia cadeia em curso: sair com 0 e o certo. Nao e falha - e "tem alguem fazendo isso agora" - e sair
REM com erro faria a rodada completa reportar quebra onde nao houve. Mesma regra da cadeia da marca.
:ocupado
echo ===== NAO RODOU %DATE% %TIME% - outra execucao esta com a trava cadeia_tce ===== >> "%LOG%"
endlocal
exit /b 0

REM ARMADILHA JA PAGA: nada de bloco "if errorlevel 1 ( ... )" aqui, e nada de PARENTESE no rotulo da etapa.
REM O cmd.exe expande %~1 dentro do bloco AO PARSEAR: um ")" vindo do texto do rotulo fecha o bloco antes da
REM hora e o "exit /b 1" passa a rodar sempre - a cadeia abortava com o node saindo em 0. Por isso: goto.
REM A batida vai AQUI, uma por etapa: e um UPDATE de uma linha, custo nenhum, e o que importa para a trava
REM nao e a duracao da cadeia inteira e sim o intervalo entre duas batidas - por isso a tolerancia de 45 min
REM cobre o passo mais lento, que tem statement_timeout de 1790s.
:etapa
echo. >> "%LOG%"
echo --- %~1 :: %TIME% --- >> "%LOG%"
"%NODE%" scripts\trava.mjs bate cadeia_tce %DONO% >nul 2>&1
"%NODE%" %~2 >> "%LOG%" 2>&1
if errorlevel 1 goto :etapa_erro
exit /b 0

:etapa_erro
echo *** FALHOU: %~1 >> "%LOG%"
exit /b 1

:falhou
echo ===== FIM %DATE% %TIME% (INTERROMPIDO - a etapa acima falhou; nada a jusante rodou) ===== >> "%LOG%"
"%NODE%" scripts\trava.mjs solta cadeia_tce %DONO% >> "%LOG%" 2>&1
endlocal
exit /b 1
