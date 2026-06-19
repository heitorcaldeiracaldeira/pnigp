@echo off
REM Auditor de integridade PNIGP — one-shot agendado a cada 5 min pelo Agendador do Windows.
REM O SO é o supervisor: se cair, a próxima execução (<=5min) o religa. Sobrevive a reboot.
cd /d C:\Users\PC\pnigp
set ONESHOT=1
"%LOCALAPPDATA%\nodejs\node.exe" scripts\validacao_continua.mjs >> "%LOCALAPPDATA%\Temp\pnigp-qa.log" 2>&1
