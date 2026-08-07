@echo off
REM COLETORES DE PLATAFORMA - tarefa "PNIGP - Coletores" do Agendador do Windows.
REM
REM POR QUE ESTA TAREFA EXISTE: os coletores vao a internet e NAO terminam numa corrida so. Medido em
REM 06/ago/2026, o coletor do PCP tem 19.729 processos na fila e parou no NONO com rate limit persistente,
REM porque busca o link do sistema de origem ao vivo na API do PNCP, uma chamada por processo. Os quatro
REM coletores sao idempotentes e retomam de onde pararam -- o que faltava era relancamento espacado.
REM
REM ONDE ESTAO AS DECISOES:
REM   quais coletores, em que ordem, com que limite e timeout .... scripts/cadeias.mjs, CADEIAS.coletores
REM   segue no primeiro erro ..................................... CADEIAS.coletores.aoFalhar = seguir
REM   a trava cadeia_coletores ................................... CADEIAS.coletores.trava
REM   o log pnigp-coletores.log .................................. CADEIAS.coletores.log
REM
REM ARMADILHAS DO .CMD que este arquivo respeita:
REM   CRLF obrigatorio - com LF o cmd.exe nao le o arquivo direito.
REM   O ERRORLEVEL e guardado ANTES de qualquer echo: echo bem-sucedido zera o ERRORLEVEL.
REM   POR QUE TAREFA E NAO BACKGROUND DO HARNESS: node longo lancado pelo shell MORRE quando o shell volta.
setlocal
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\roda.mjs coletores
set RC=%ERRORLEVEL%
endlocal & exit /b %RC%
