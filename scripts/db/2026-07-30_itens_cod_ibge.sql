-- ═══════════════════════════════════════════════════════════════════════════════
-- 2026-07-30 · itens_sc: índice em cod_ibge (o full scan que sobrou da auditoria de 21/jul)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ACHADO (medição de 30/jul): itens_sc continuava com 225 varreduras completas/dia
-- (seq_tup_read 26,9 BI → 31,04 BI em 8,4 dias) e o banco lia ~3,36 TB/dia do pageserver.
-- A auditoria de 21/jul culpou o watermark, mas `ix_itens_atualiz` tinha só 5 idx_scan em 9 dias.
--
-- O culpado NÃO era a cadeia de ingestão — era o APP. `src/lib/queries.ts` filtra
-- `itens_sc WHERE cod_ibge = $1` em 13 queries distintas (getComprasCategorias,
-- getEconomicidade, getFornecedoresOrigem, getPrecosItens, getAtasVsEfetivadas…), e
-- VÁRIAS rodam no mesmo Promise.all de UMA página de município. Não havia índice em
-- cod_ibge: cada uma varria os 3,5 GB inteiros. Uma visita = ~13 × 3,58 GB ≈ 46 GB de leitura.
-- É também a causa real do "cold start de 22s" registrado em 22/jul — não era só o wake.
--
-- MEDIDO (Florianópolis, cod_ibge 4205407, 206k itens = 9,4% da tabela):
--   ANTES : Parallel Seq Scan            17.131 ms · 458.923 buffers (3,58 GB)
--   DEPOIS: Parallel Index Only Scan         32,58 ms ·     733 buffers (5,7 MB)  → 526× / 626× menos I/O
--
-- Dois índices, de propósito:
--   ix_itens_cod_ibge  (15 MB) — genérico, serve as queries que projetam descricao/unidade/fornecedor.
--   ix_itens_mun_valor (45 MB) — parcial + INCLUDE: torna os agregados count/sum um INDEX ONLY SCAN
--                                (Heap Fetches: 0). O predicado casa exatamente o que o app filtra.
-- Custo de storage dos dois: 60 MB ≈ US$ 0,02/mês a US$0,35/GB-mês. Paga-se sozinho em CU.
--
-- SEMPRE CONCURRENTLY (não trava produção) + statement_timeout=0 na MESMA conexão.
-- ═══════════════════════════════════════════════════════════════════════════════

SET statement_timeout = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_itens_cod_ibge
  ON public.itens_sc (cod_ibge);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_itens_mun_valor
  ON public.itens_sc (cod_ibge) INCLUDE (quantidade, unit_homologado)
  WHERE unit_homologado > 0 AND quantidade > 0;

-- Manutenção aplicada na mesma janela:
-- VACUUM zera o visibility map de itens_sc → o Index Only Scan do watermark
-- (ix_itens_atualiz) saiu de 941 Heap Fetches / 290 ms para 0 / 0,72 ms.
VACUUM (ANALYZE) public.itens_sc;

-- contratos_sc estava com last_analyge NULL (autoanalyze de 17/jul) e é o 2º pior em
-- seq scan (40.338 varreduras / 22,5 BI linhas lidas) — planner cego.
ANALYZE public.contratos_sc;

-- ── PENDENTE, exige Heitor NOMEAR cada um (nunca dropar por wildcard) ──────────
-- Voltaram 66 MB de índice morto (idx_scan = 0) em 22 índices, sendo 30 MB na própria itens_sc:
--   itens_sc.idx_itens_beneficio        15 MB
--   itens_sc.idx_itens_criterio         15 MB
--   contratacoes_sc.ix_contr_raw        16 MB
--   item_homologado_sc.ix_ihs_forn     9272 kB
--   itens_classificacao_sc.ix_classif_cod 5144 kB
--   pncp_evento.ix_evento_notif        2352 kB
--   catmat_pdm.ix_pdm_trgm             1584 kB
--   item_homologado_sc.ix_ihs_pdm      1264 kB
-- ⚠️ Qualificar o schema (app. vs public.) — o IF EXISTS mascara o drop que não pegou.
