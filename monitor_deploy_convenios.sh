#!/usr/bin/env bash
cd /c/Users/PC/pnigp
# espera até 120 min pela conclusão da coleta limpa de convênios
for i in $(seq 1 240); do
  if grep -q "Convênios concluído" conv_captados.log 2>/dev/null; then
    echo "[monitor] coleta concluída, validando e deployando…" > deploy_convenios.log
    npx tsc --noEmit >> deploy_convenios.log 2>&1
    vercel --prod --force --yes >> deploy_convenios.log 2>&1
    echo "[monitor] deploy finalizado" >> deploy_convenios.log
    exit 0
  fi
  sleep 30
done
echo "[monitor] timeout: coleta não concluiu em 120min" > deploy_convenios.log
