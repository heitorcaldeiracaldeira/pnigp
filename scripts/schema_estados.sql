-- PNIGP — Esquema do Painel do Governador (nível estadual)
-- Aditivo: não altera as tabelas municipais. Reutiliza a tabela `indicadores`.

DROP TABLE IF EXISTS metas_estados CASCADE;
DROP TABLE IF EXISTS indices_pnigp_estados CASCADE;
DROP TABLE IF EXISTS estado_indicador_valores CASCADE;
DROP TABLE IF EXISTS estados CASCADE;

CREATE TABLE estados (
  id             SERIAL PRIMARY KEY,
  uf             TEXT UNIQUE NOT NULL,
  nome           TEXT NOT NULL,
  regiao         TEXT NOT NULL,
  populacao      INTEGER NOT NULL,
  capital        TEXT NOT NULL,
  governador     TEXT,
  pib_per_capita NUMERIC(12,2)
);

CREATE TABLE estado_indicador_valores (
  estado_id    INTEGER NOT NULL REFERENCES estados(id) ON DELETE CASCADE,
  indicador_id INTEGER NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  ano          INTEGER NOT NULL,
  valor        NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (estado_id, indicador_id, ano)
);

CREATE TABLE indices_pnigp_estados (
  estado_id         INTEGER NOT NULL REFERENCES estados(id) ON DELETE CASCADE,
  ano               INTEGER NOT NULL,
  iceb              NUMERIC(5,1),
  invp              NUMERIC(5,1),
  igp360            NUMERIC(5,1),
  cap_planejamento  NUMERIC(5,1),
  cap_fiscal        NUMERIC(5,1),
  cap_gestao        NUMERIC(5,1),
  cap_transparencia NUMERIC(5,1),
  PRIMARY KEY (estado_id, ano)
);

CREATE TABLE metas_estados (
  id           SERIAL PRIMARY KEY,
  estado_id    INTEGER NOT NULL REFERENCES estados(id) ON DELETE CASCADE,
  indicador_id INTEGER NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  ano_alvo     INTEGER NOT NULL,
  valor_alvo   NUMERIC(14,2) NOT NULL,
  descricao    TEXT
);

CREATE INDEX idx_ev_indicador ON estado_indicador_valores (indicador_id, ano);
CREATE INDEX idx_ie_ano ON indices_pnigp_estados (ano);
