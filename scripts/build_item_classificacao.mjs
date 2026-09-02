// CAMADA ÚNICA DE CLASSIFICAÇÃO DO ITEM — uma resposta por descrição, com procedência.
//   node scripts/build_item_classificacao.mjs
//
// ═══ O PROBLEMA QUE ISTO RESOLVE ═══
// Em 01/set/2026 o item passou a ter TRÊS motores e nenhuma resposta única:
//   item_catmat_map   material → PDM do CATMAT       (trigrama · acerto medido 90,1% nos aceitos)
//   item_catser_map   serviço  → CATSER              (trigrama · acerto medido 92,9% nos aceitos)
//   item_sigtap_map   serviço  → procedimento do SUS (PARSE do código no texto · determinístico)
// Nada juntava os três, e o caminho para o produto (`build_precos_basica_sc.mjs` →
// `precos_referencia_sc`) só conhece o CATMAT. Ou seja: dois motores construídos hoje e **consumidor
// nenhum** — o padrão [[pnigp-produtor-na-cadeia-consumidor-fora]] pelo avesso, produtor sem consumidor.
// Esta tabela é o ponto único de junção: quem consome não precisa saber que existem três motores.
//
// ═══ A PRECEDÊNCIA, E POR QUE ELA É ESTA ═══
// Ordem escolhida por MEDIÇÃO contra `app.gabarito_item`, não por gosto:
//   1. SIGTAP válido ......... o código está escrito no texto E existe na tabela do SUS. Não há
//                             similaridade envolvida: é leitura, não adivinhação. Ganha de tudo.
//   2. CATMAT aceito ......... material, 90,1% de acerto nos aceitos, falso aceite 10,5%
//   3. CATSER aceito ......... serviço, 92,9% de acerto nos aceitos, falso aceite 0,0%
//   4. SIGTAP hierarquia ..... código inválido (série 9xx = código LOCAL do município, ou competência
//                             antiga) mas grupo/subgrupo/forma válidos por prefixo. Classificação PARCIAL:
//                             entra depois dos exatos, e marcada como parcial — nunca se passa por exata.
//   5. sem classificação ..... e isso é um estado explícito, não uma linha ausente. Abstenção tem de ser
//                             visível: linha que some vira "não medimos" e depois vira "não existe".
//
// ⚠️ A mesma `chave` pode existir nos dois mapas (a mesma descrição é usada como material num processo e
// como serviço em outro). O desempate é o `material_ou_servico` que a FONTE declara para aquele item —
// nunca o motor que respondeu primeiro.
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });

await db.query(`CREATE SCHEMA IF NOT EXISTS app`);
await db.query(`DROP TABLE IF EXISTS app.item_classificacao`);
await db.query(`CREATE TABLE app.item_classificacao (
  chave TEXT PRIMARY KEY,
  taxonomia TEXT,            -- SIGTAP | CATMAT | CATSER | SIGTAP_HIERARQUIA | NULL
  codigo TEXT,
  nome TEXT,
  classe TEXT,
  exata BOOLEAN,             -- false = classificação parcial (só hierarquia)
  deterministica BOOLEAN,    -- true = código lido do texto, sem similaridade
  sim NUMERIC,               -- NULL quando determinística
  n_itens INT,
  atualizado TIMESTAMPTZ DEFAULT now())`);

// tipo declarado pela FONTE para cada chave (o desempate) — a chave é a descrição normalizada,
// então uma mesma chave pode aparecer como M e como S; vale o tipo majoritário das linhas dela.
await db.query(`DROP TABLE IF EXISTS _tipo_chave`);
await db.query(`CREATE TEMP TABLE _tipo_chave AS
  SELECT chave, tipo FROM (
    SELECT chave, tipo, row_number() OVER (PARTITION BY chave ORDER BY n DESC) rn FROM (
      SELECT c.chave, i.material_ou_servico tipo, count(*) n
      FROM (SELECT chave FROM item_catmat_map UNION SELECT chave FROM item_catser_map) c
      JOIN itens_sc i ON lower(regexp_replace(btrim(i.descricao), '\\s+', ' ', 'g')) = c.chave
      WHERE i.material_ou_servico IS NOT NULL
      GROUP BY 1, 2) t
  ) u WHERE rn = 1`);
await db.query(`CREATE INDEX ON _tipo_chave (chave)`);

await db.query(`
  INSERT INTO app.item_classificacao (chave, taxonomia, codigo, nome, classe, exata, deterministica, sim, n_itens)
  SELECT c.chave, e.taxonomia, e.codigo, e.nome, e.classe, e.exata, e.deterministica, e.sim, c.n_itens
  -- ⚠️ n_itens vem da CHAVE, nunca do motor que respondeu. A 1ª versao pegava e.n_itens do LATERAL:
  -- chave sem classificacao ficava com NULL, a soma ignorava, e a cobertura dava "100%" — o denominador
  -- sumia junto com o numerador. Numero que so pode subir e sinal de denominador errado.
  -- SOMA das duas filas esta certo: elas sao disjuntas (item_catmat_map conta so linhas M,
  -- item_catser_map so linhas S), entao somar da o total de linhas daquela descricao.
  FROM (SELECT chave, sum(n)::int n_itens FROM (
          SELECT chave, n_itens n FROM item_catmat_map
          UNION ALL SELECT chave, n_itens n FROM item_catser_map) z GROUP BY 1) c
  LEFT JOIN _tipo_chave t ON t.chave = c.chave
  LEFT JOIN LATERAL (
    -- 1) SIGTAP exato
    SELECT 'SIGTAP' taxonomia, s.co_procedimento codigo, s.no_procedimento nome,
           s.no_forma_organizacao classe, true exata, true deterministica, NULL::numeric sim, s.n_itens, 1 ord
    FROM item_sigtap_map s WHERE s.chave = c.chave AND s.valido
    UNION ALL
    -- 2) CATMAT aceito, quando a fonte diz MATERIAL
    SELECT 'CATMAT', m.codigo_pdm::text, m.nome_pdm, m.nome_classe, true, false, m.sim, m.n_itens, 2
    FROM item_catmat_map m WHERE m.chave = c.chave AND m.aceito AND coalesce(t.tipo,'M') = 'M'
    UNION ALL
    -- 3) CATSER aceito, quando a fonte diz SERVIÇO
    SELECT 'CATSER', r.codigo_servico::text, r.nome_servico, r.nome_classe, true, false, r.sim, r.n_itens, 3
    FROM item_catser_map r WHERE r.chave = c.chave AND r.aceito AND coalesce(t.tipo,'S') = 'S'
    UNION ALL
    -- 4) SIGTAP só hierarquia (código local 9xx ou competência antiga)
    SELECT 'SIGTAP_HIERARQUIA', s.co_procedimento, s.no_forma_organizacao, s.no_sub_grupo, false, true, NULL, s.n_itens, 4
    FROM item_sigtap_map s WHERE s.chave = c.chave AND NOT s.valido AND s.no_forma_organizacao IS NOT NULL
    ORDER BY ord LIMIT 1
  ) e ON true`);

console.log("═══ app.item_classificacao — uma resposta por descrição ═══");
console.table((await db.query(`
  SELECT coalesce(taxonomia,'(sem classificação)') taxonomia,
         count(*)::int chaves, coalesce(sum(n_itens),0)::int linhas,
         round(100.0*coalesce(sum(n_itens),0)/(SELECT sum(n_itens) FROM app.item_classificacao),1)::text pct_linhas
  FROM app.item_classificacao GROUP BY 1 ORDER BY 3 DESC`)).rows);

console.table((await db.query(`
  SELECT count(*)::int chaves, coalesce(sum(n_itens),0)::int linhas,
    count(*) FILTER (WHERE taxonomia IS NOT NULL)::int classificadas,
    coalesce(sum(n_itens) FILTER (WHERE taxonomia IS NOT NULL),0)::int linhas_classificadas,
    round(100.0*coalesce(sum(n_itens) FILTER (WHERE taxonomia IS NOT NULL),0)/sum(n_itens),1)::text pct,
    coalesce(sum(n_itens) FILTER (WHERE deterministica),0)::int linhas_deterministicas
  FROM app.item_classificacao`)).rows);
await db.end();
