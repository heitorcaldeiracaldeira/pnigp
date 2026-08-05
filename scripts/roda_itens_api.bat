@echo off
REM CONSUMIDOR DE EVENTO (pncp_evento) — Tarefa "PNIGP - Itens API", resumivel, session-independent.
REM SUBSTITUIU o scan ingest_itens_sc.mjs (APOSENTADO 22/jul): o scan varria contratacoes_sc inteira e usava a
REM maquina de estado itens_proc_feitos; agora o consumidor busca SO a fatia que o evento aponta
REM (item/resultado/contratacao) e marca consumido_dado. Drena o backlog E mantem itens_sc fresco entre as
REM rodadas da cadeia diaria. contratacoes_sc segue populada por ingest_contratacoes_sc (o scan so LIA, nao INSERIA).
REM POR QUE tarefa e nao background: node longo lancado pelo harness MORRE quando o shell volta (medido 15 e 22/jul).
REM Resumivel pela flag consumido_dado (posicao no log, nao maquina de estado). IgnoreNew evita sobreposicao.
REM Fix 22/jul: cat 1 (contratacao) usa a API /consulta (a /pncp devolvia 301 morto e travava a fila).
REM SETLOCAL: LOTE e CONC sao DESTE passo. Sem isolar, eles vazam para quem chamou por "call" e seguem vivos
REM nos passos seguintes da rodada completa - o CONC=6 daqui chegava aos 17 extratores de marca, calibrados
REM para CONC=3. E o exit /b explicito devolve o codigo do node a quem chamou.
REM Node por caminho absoluto, e nao "node" do PATH: sob o Agendador o PATH nao e o mesmo do shell interativo.
setlocal
cd /d C:\Users\PC\pnigp
set LOTE=25000
set CONC=6
"%LOCALAPPDATA%\nodejs\node.exe" scripts\consome_evento_dado.mjs >> "%TEMP%\pnigp_consome_eventos.log" 2>&1
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
