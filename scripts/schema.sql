-- PNIGP — Esquema do Painel do Prefeito (MVP)
-- Dados municipais, indicadores setoriais e índices compostos do PNIGP.

DROP TABLE IF EXISTS metas CASCADE;
DROP TABLE IF EXISTS indices_pnigp CASCADE;
DROP TABLE IF EXISTS indicador_valores CASCADE;
DROP TABLE IF EXISTS indicadores CASCADE;
DROP TABLE IF EXISTS municipios CASCADE;

-- Municípios -----------------------------------------------------------------
CREATE TABLE municipios (
  id             SERIAL PRIMARY KEY,
  codigo_ibge    TEXT UNIQUE NOT NULL,
  nome           TEXT NOT NULL,
  uf             TEXT NOT NULL,
  regiao         TEXT NOT NULL,                 -- Norte/Nordeste/Centro-Oeste/Sudeste/Sul
  populacao      INTEGER NOT NULL,
  porte          TEXT NOT NULL,                 -- pequeno / medio / grande / metropole
  prefeito       TEXT,
  pib_per_capita NUMERIC(12,2)
);

-- Definições de indicadores --------------------------------------------------
CREATE TABLE indicadores (
  id             SERIAL PRIMARY KEY,
  codigo         TEXT UNIQUE NOT NULL,
  nome           TEXT NOT NULL,
  area           TEXT NOT NULL,                 -- saude/educacao/seguranca/fiscal/social/economia
  unidade        TEXT NOT NULL,
  fonte          TEXT NOT NULL,                 -- DATASUS, INEP, SINESP, SICONFI...
  direcao_melhor TEXT NOT NULL CHECK (direcao_melhor IN ('alta','baixa')),
  descricao      TEXT
);

-- Série histórica de valores por município -----------------------------------
CREATE TABLE indicador_valores (
  municipio_id INTEGER NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  indicador_id INTEGER NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  ano          INTEGER NOT NULL,
  valor        NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (municipio_id, indicador_id, ano)
);

-- Índices compostos do PNIGP (0-100) -----------------------------------------
CREATE TABLE indices_pnigp (
  municipio_id      INTEGER NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  ano               INTEGER NOT NULL,
  iceb              NUMERIC(5,1),   -- Índice de Capacidade Estatal Brasileira
  invp              NUMERIC(5,1),   -- Índice Nacional de Valor Público
  igp360            NUMERIC(5,1),   -- Índice Integrado de Gestão Pública
  -- Subcomponentes do ICEB
  cap_planejamento  NUMERIC(5,1),
  cap_fiscal        NUMERIC(5,1),
  cap_gestao        NUMERIC(5,1),
  cap_transparencia NUMERIC(5,1),
  PRIMARY KEY (municipio_id, ano)
);

-- Metas da gestão ------------------------------------------------------------
CREATE TABLE metas (
  id           SERIAL PRIMARY KEY,
  municipio_id INTEGER NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  indicador_id INTEGER NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  ano_alvo     INTEGER NOT NULL,
  valor_alvo   NUMERIC(14,2) NOT NULL,
  descricao    TEXT
);

CREATE INDEX idx_valores_indicador ON indicador_valores (indicador_id, ano);
CREATE INDEX idx_indices_ano ON indices_pnigp (ano);
