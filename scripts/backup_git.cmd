@echo off
REM Backup do código/documentação no GitHub. Semanal via Agendador. NUNCA inclui backups/ nem .env (gitignored).
cd /d C:\Users\PC\pnigp
git add -A
git diff --cached --quiet && (echo nada a commitar) || (
  git commit -m "backup automatico (codigo+docs)" && git push origin main
)
