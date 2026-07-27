-- Torna o JOIN contratos_sc × sancoes sargável (getFornecedoresSancionadosSC).
-- Antes: Seq Scan em sancoes (25k linhas) + Sort por regexp_replace(ni) A CADA consulta (roda por página de município).
-- Fix: índice de EXPRESSÃO no NI só-dígitos de sancoes — NÃO coluna GENERATED STORED (reescreveria a tabela sob lock).
-- O índice casa a expressão exata do JOIN, então o planner o usa sem alterar a query.
-- contratos_sc NÃO ganha índice: já é filtrada por cod_ibge (idx_contratos_sc_ente) e o sort restante é pequeno (~3MB, em memória);
-- um índice de expressão em 2M linhas custaria ~80MB p/ pouco ganho.
-- CONCURRENTLY = sem lock em produção; rodar com statement_timeout=0 e FORA de transação.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sancoes_ni_digits
  ON sancoes ((regexp_replace(ni, '[^0-9]', '', 'g')));

ANALYZE sancoes;
