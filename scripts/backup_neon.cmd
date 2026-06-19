@echo off
REM Backup lógico do Neon (dump local em backups/, gitignored). Semanal via Agendador.
cd /d C:\Users\PC\pnigp
"%LOCALAPPDATA%\nodejs\node.exe" scripts\backup_neon.mjs >> "%LOCALAPPDATA%\Temp\pnigp-backup.log" 2>&1
