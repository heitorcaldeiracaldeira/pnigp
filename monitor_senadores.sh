#!/usr/bin/env bash
Z=/c/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/tse2018.zip
for i in $(seq 1 120); do
  SZ=$(stat -c%s "$Z" 2>/dev/null || echo 0)
  if [ "$SZ" -ge 636334218 ]; then
    sleep 3
    cd /c/Users/PC/pnigp
    /c/Users/PC/AppData/Local/nodejs/node.exe scripts/ingest_votos_senadores_sc.mjs > senadores.log 2>&1
    exit 0
  fi
  sleep 30
done
echo "timeout 2018" > senadores.log
