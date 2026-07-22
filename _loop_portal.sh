cd /c/Users/PC/pnigp
for i in $(seq 1 200); do
  out=$(LIMIT=3000 node scripts/detecta_portal_real.mjs 2>/dev/null | grep -oE "detectados nesta leva: [0-9]+")
  echo "$(date +%H:%M:%S) $out"
  n=$(echo "$out" | grep -oE "[0-9]+")
  [ -z "$n" ] && break
  [ "$n" -lt 1 ] && break
done
echo "DETECÇÃO COMPLETA"
