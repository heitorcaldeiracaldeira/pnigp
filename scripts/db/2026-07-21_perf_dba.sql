-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORIA DE DESEMPENHO (DBA) — aplicada em produção (Neon) 2026-07-21
-- Registro versionado das mudanças de índice/extensão feitas via CONCURRENTLY.
-- Reproduzível: rodar num banco novo replica a otimização. Idempotente (IF [NOT] EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- P1 ─ Índices que faltavam na tabela QUENTE itens_sc (54k seq-scans, 26,9 bi linhas lidas).
--      O filtro do watermark incremental (data_atualizacao > wm) full-scaneava 4 GB por rodada.
--      Verificado: virou Index Scan, 0,247 ms (era segundos/minutos).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_itens_atualiz ON itens_sc (data_atualizacao) WHERE unit_homologado IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_itens_homolog ON itens_sc (cnpj, ano, seq)   WHERE unit_homologado IS NOT NULL;

-- P2 ─ Dropar índices MORTOS (idx_scan=0) / DUPLICADOS — alivia escrita nas tabelas quentes + espaço (~230 MB).
--      (schema qualificado: item_enriquecimento e alguns ficam em 'app'.)
DROP INDEX CONCURRENTLY IF EXISTS public.ix_doctexto_nc;      -- duplicata exata de ix_arqtexto_nc (numero_controle)
DROP INDEX CONCURRENTLY IF EXISTS app.ix_ienr_cod;           -- 49 MB, 0 uso · item_enriquecimento (escrita pesada)
DROP INDEX CONCURRENTLY IF EXISTS app.ix_ienr_cat;           -- 40 MB, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS public.idx_itens_criterio;  -- 15 MB, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS public.idx_itens_beneficio; -- 15 MB, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS public.ix_arq_cod;          -- arquivos_sc cod_ibge, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS public.ix_classif_cod;      -- itens_classificacao_sc, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS app.ix_compl_nc;           -- documento_completude_sc, 0 uso
DROP INDEX CONCURRENTLY IF EXISTS app.ix_fila_nfases;        -- fila_enriquecimento, 0 uso
-- PRESERVADOS de propósito (0 uso mas são de FEATURE): catmat_pdm.ix_pdm_trgm (motor CATMAT, intocável),
--   item_homologado_sc.ix_ihs_forn/ix_ihs_pdm (marca/CATMAT).

-- Observabilidade ─ instalar pg_stat_statements (parar de voar cego nas queries caras).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Achado do pg_stat_statements: a query nº1 de custo era o count(*) FILTER de progresso do
-- enriquece_item_documento (960 chamadas × 12s, full-scan de 2,1M) → corrigido no script (só conta se houve trabalho)
-- + task "PNIGP Enriquece Item Documento" (15min) DESABILITADA (coberta pela cadeia diária).

-- ─── 2ª leva (mais melhoria, via pg_stat_statements) ───
-- max(ano_compra) FROM contratos_sc (94x, full-scan 2M) → index scan:
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_contratos_ano ON contratos_sc (ano_compra);
-- sobrepreço KPI (validacao_continua, 286x, full-scan 4GB): índice PARCIAL com predicado cross-column
-- (o count casa o predicado → Index Only Scan, sempre atual, sem materializar tabela):
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_itens_sobrepreco ON itens_sc (ano) WHERE unit_homologado > unit_estimado AND unit_estimado > 0;
-- + scripts/backup_neon.mjs: paginação OFFSET (O(n²), 26s/página na arquivo_texto de 12GB) → KEYSET por ctid (O(n)).
