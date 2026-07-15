#!/usr/bin/env bash
# Pipeline autônomo das ATAS, um pool por vez (Neon-safe): FASE 1 baixa o texto (arquivo_texto_sc),
# FASE 2 extrai marca/modelo (item_marca_sc) + disputa (contratacao_disputa_sc). Cada fase roda em LOOP
# que se relança sozinho se o Neon cair, retomando do que já está gravado. Só um script toca o Neon por vez.
cd /c/Users/PC/pnigp || exit 1
LOG=logs/atas_pipeline.log
: > "$LOG"

echo "=== FASE 1: download do texto das atas ($(date +%H:%M)) ===" | tee -a "$LOG"
for k in $(seq 1 80); do
  echo "--- download run $k $(date +%H:%M) ---" >> "$LOG"
  CONC=3 node scripts/ingest_arquivo_texto_sc.mjs >> "$LOG" 2>&1
  last=$(grep "documentos a baixar" "$LOG" | tail -1 | cut -c1-2)
  echo "[loop] download run $k concluído; inicio do proximo diz: '$last'" >> "$LOG"
  [ "$last" = "0 " ] && { echo "### DOWNLOAD COMPLETO ($(date +%H:%M)) ###" >> "$LOG"; break; }
  sleep 3
done

echo "=== FASE 2: extração de marca/modelo das atas ($(date +%H:%M)) ===" | tee -a "$LOG"
for k in $(seq 1 80); do
  echo "--- marca run $k $(date +%H:%M) ---" >> "$LOG"
  CONC=3 node scripts/ingest_marca_atas_sc.mjs >> "$LOG" 2>&1
  last=$(grep "atas a extrair" "$LOG" | tail -1 | cut -c1-2)
  echo "[loop] marca run $k concluído; inicio do proximo diz: '$last'" >> "$LOG"
  [ "$last" = "0 " ] && { echo "### MARCA COMPLETO ($(date +%H:%M)) ###" >> "$LOG"; break; }
  sleep 3
done

echo "=== PIPELINE COMPLETO ($(date +%H:%M)) ===" >> "$LOG"
