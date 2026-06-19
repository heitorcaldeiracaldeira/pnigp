#!/usr/bin/env bash
# Cadeia serializada (ritmo conservador): Compras 2025->2022, PCA 2024-2027, Itens, Validação.
# Resumível: cada ETL pula o que já foi feito. Continua mesmo se uma etapa falhar.
cd /c/Users/PC/pnigp || exit 1
LOG=/c/Users/PC/.claude/jobs/2783694f/tmp/chain.log
exec >>"$LOG" 2>&1
echo ""
echo "############ CADEIA INICIADA $(date '+%F %T') ############"

for ANO in 2025 2024 2023 2022; do
  echo ""
  echo "===== COMPRAS $ANO  $(date '+%T') ====="
  ANO=$ANO node scripts/ingest_compras_sc.mjs || echo "!! compras $ANO terminou com erro rc=$?"
done

echo ""
echo "===== PCA: reset feitos + 2024-2027  $(date '+%T') ====="
node scripts/_reset_pca_feitos.mjs || echo "!! reset pca falhou rc=$?"
ANOS=2024,2025,2026,2027 node scripts/ingest_pca_sc.mjs || echo "!! pca terminou com erro rc=$?"

echo ""
echo "===== ITENS  $(date '+%T') ====="
node scripts/ingest_itens_sc.mjs || echo "!! itens terminou com erro rc=$?"

echo ""
echo "===== VALIDACAO DE CONSISTENCIA  $(date '+%T') ====="
node scripts/validar_consistencia.mjs || echo "!! validacao terminou com erro rc=$?"

echo ""
echo "############ CADEIA CONCLUIDA $(date '+%F %T') ############"
