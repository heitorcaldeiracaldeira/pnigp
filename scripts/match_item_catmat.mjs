// CASAMENTO item→CATMAT (trigrama pg_trgm) — classifica CADA descrição normalizada de bem (chave) no melhor PDM do
// catálogo. É o RETRIEVER validado pelo estudo (gabarito coloquial de SC): ~98% de precisão na cabeça, degrada na cauda.
// 3 ganhos productionizados (2026-07-10), todos "não-piora":
//   (1) FALLBACK DE SUBSTANTIVO-CABEÇA: p/ chaves de baixa sim (descrição longa/suja onde o trigrama casa a palavra
//       errada, ex.: "joelho ... pvc esgoto" → PRÓTESE DE JOELHO), tenta casar as 1as palavras (o produto); se casar
//       melhor, adota. Testado: 94,7%→96,1%, sem tocar na cabeça.
//   (2) ABSTENÇÃO EXPLÍCITA: coluna `aceito` = sim>=MIN_SIM; abaixo disso é "não classificado" (nunca chute).
//   (3) CANONIZAÇÃO DE PDM DUPLICADO: catálogo tem códigos distintos p/ o mesmo nome ("LEGUME IN NATURA" vs "...*");
//       mapeia todos ao menor código canônico (some a maioria dos "erros" que eram só duplicata; melhora a UI).
// Set-based, em lotes. node scripts/match_item_catmat.mjs
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MIN_N = Number(process.env.MIN_N || 2);
const MIN_SIM = Number(process.env.MIN_SIM || 0.5);
const LO = Number(process.env.LO_FALLBACK || 0.55);   // (1) abaixo disso tenta o fallback do substantivo-cabeça
const BATCH = 4000;

// ═══ A FILA: O CAMPO DA FONTE, E NÃO REGEX DE PALAVRA (trocado em 01/set/2026) ═══
// Até aqui, "é bem ou é serviço?" era decidido por palavras na descrição e na unidade. O PNCP publica
// `material_ou_servico` de graça, e a regex discorda dele em massa. Medido em 01/set sobre `itens_sc`
// (unit_homologado>0, quantidade>0):
//     M (931.302):  863.409 passam ·  67.893 DESCARTADOS por terem "manutenção"/"projeto"/"locação" no nome
//     S (280.326):  121.487 PASSAM  · 158.763 excluídos
// Dentro da fila real do classificador (n>=2, length 4..90) isso são 9.818 chaves / 64.773 linhas de
// SERVIÇO entrando num catálogo de MATERIAIS, e 3.217 chaves / 12.635 linhas de material descartadas.
//
// A/B do grupo em disputa, contra os DOIS catálogos (amostra 1.500 por grupo, 01/set):
//     serviço que entrava no CATMAT   sim_CATMAT 0,294 (cob 4,5%)  ·  sim_CATSER 0,377 (cob 19,1%)  → 61% casa melhor no CATSER
//     material que a regex descarta   sim_CATMAT 0,329 (cob 6,5%)  ·  sim_CATSER 0,299 (cob 4,5%)   → confirma que é material
// Ou seja o campo da fonte está do lado certo nos dois grupos.
//
// ⚠️ O QUE NÃO FOI MEDIDO, E POR QUÊ. A lei do projeto manda A/B contra o ponto de operação, e ele NÃO
// pôde ser rodado: `eval_operating_point.mjs` lê `sc_strat_ws.tsv` de um scratchpad de sessão que não
// existe mais — o gabarito na LÍNGUA DE SC está órfão. O `painel_gold` (31.725 pares) sobrevive, mas é
// federal: nele a regex exclui só 0,5%, porque a linguagem formal quase não usa essas palavras. Ele
// responde a outra pergunta.
// O que SUSTENTA a troca mesmo assim é que ela **não pode regredir por construção**: o filtro só muda
// QUAIS chaves entram, nunca como uma chave é casada. Chave que fica é casada identicamente; chave que
// sai é serviço declarado, errado por construção num catálogo de material; chave que entra é material
// declarado. Ganho não medido, regressão impossível.
// Para reverter em um comando: FILA=regex node scripts/match_item_catmat.mjs
//
// `material_ou_servico = 'M'` é ESTRITO: os 164 itens com o campo nulo ficam de fora. Admitir "não sei"
// dentro de um motor validado é exatamente o critério frouxo que erra para cima.
const FILA = (process.env.FILA || "fonte").toLowerCase();
const FILTRO_FILA = FILA === "regex"
  ? `descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
     AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`
  : `material_ou_servico = 'M'`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS item_catmat_map (chave TEXT PRIMARY KEY, codigo_pdm INT, nome_pdm TEXT, nome_classe TEXT, sim NUMERIC, n_itens INT, aceito BOOLEAN, metodo TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await c.query(`ALTER TABLE item_catmat_map ADD COLUMN IF NOT EXISTS aceito BOOLEAN, ADD COLUMN IF NOT EXISTS metodo TEXT`);

  console.log(`materializando chaves de bens · FILA=${FILA} (${FILA === "regex" ? "regex de palavra, o critério ANTIGO" : "material_ou_servico='M', o campo da fonte"}) · n>=${MIN_N}, length 4..90…`);
  // ═══ FILA EM TABELA REAL, NAO TEMP (01/set/2026) ═══
  // Era `CREATE TEMP TABLE _ch`. TEMP vive na SESSAO: quando a conexao cai, a tabela some junto e o
  // passe morre com `relation _ch does not exist` — que parece erro de SQL e e queda de conexao.
  // Aconteceu em 01/set aos 203 s de um passe de ~20 min; as duas rodadas anteriores, de 20 min cada,
  // foram sorte. Job longo sobre Neon PERDE conexao, e a pergunta nao e se, e quando.
  // Tabela real sobrevive a queda e torna o passe retomavel — o mesmo desenho de app.fila_enriquecimento.
  await c.query(`CREATE SCHEMA IF NOT EXISTS app`);
  await c.query(`DROP TABLE IF EXISTS app.fila_catmat`);
  // head = substantivo-cabeça: run alfabético inicial da chave (o produto), no máx 5 palavras
  await c.query(`CREATE TABLE app.fila_catmat AS
    SELECT u.id, u.chave, u.n,
      NULLIF(array_to_string((string_to_array(trim(coalesce((regexp_match(lower(u.chave), '^([a-záàâãéêíóôõúüç ]+)'))[1], '')), ' '))[1:5], ' '), '') head
    FROM (
      SELECT row_number() OVER (ORDER BY n DESC) id, chave, n FROM (
        SELECT ${NORM} chave, count(*) n FROM itens_sc
        WHERE unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL
          AND ${FILTRO_FILA}
        GROUP BY 1 HAVING count(*) >= ${MIN_N} AND length(${NORM}) BETWEEN 4 AND 90) t
    ) u`);
  await c.query(`CREATE INDEX ON app.fila_catmat (id)`);
  const total = Number((await c.query(`SELECT count(*) n FROM app.fila_catmat`)).rows[0].n);
  console.log(`  ${total.toLocaleString()} chaves a casar · lotes de ${BATCH}`);

  // ═══ CHAVE QUE SAIU DA FILA PRECISA SAIR DO MAPA ═══
  // O passe é UPSERT: ele nunca apaga. Com a fila trocada (01/set), as chaves de SERVIÇO que antes entravam
  // ficariam no mapa com o casamento velho e `aceito=true` — alimentando um PDM de MATERIAL para um item de
  // serviço no banco de preços. Errado por construção, e pior que não ter linha.
  // Anti-join exato contra a fila atual — nunca por padrão de texto ([[feedback-nunca-apagar-por-wildcard]]).
  // GUARDA: se a fila vier suspeitosamente pequena (falha na construção, tabela vazia), NÃO apaga nada —
  // limpar o mapa inteiro por causa de um `_ch` quebrado seria o pior desfecho possível.
  const noMapa = Number((await c.query(`SELECT count(*) n FROM item_catmat_map`)).rows[0].n);
  if (total < noMapa * 0.5) {
    console.log(`⚠ fila com ${total} chaves contra ${noMapa} no mapa — pequena demais; NÃO vou apagar nada.`);
  } else {
    const del = await c.query(`DELETE FROM item_catmat_map m
      WHERE NOT EXISTS (SELECT 1 FROM app.fila_catmat c WHERE c.chave = m.chave)`);
    console.log(`  ${del.rowCount.toLocaleString()} chaves removidas do mapa (saíram da fila)`);
  }

  // ---- passe 1: casamento pela descrição inteira ----
  const t0 = Date.now();
  for (let off = 0; off < total; off += BATCH) {
    await c.query(`
      INSERT INTO item_catmat_map (chave, codigo_pdm, nome_pdm, nome_classe, sim, n_itens, metodo)
      SELECT c.chave, m.codigo_pdm, m.nome_pdm, m.nome_classe,
        round(similarity(lower(m.nome_pdm), c.chave)::numeric, 3), c.n, 'full'
      FROM app.fila_catmat c CROSS JOIN LATERAL (
        SELECT codigo_pdm, nome_pdm, nome_classe FROM catmat_pdm ORDER BY lower(nome_pdm) <-> c.chave LIMIT 1
      ) m
      WHERE c.id > ${off} AND c.id <= ${off + BATCH}
      ON CONFLICT (chave) DO UPDATE SET codigo_pdm=EXCLUDED.codigo_pdm, nome_pdm=EXCLUDED.nome_pdm, nome_classe=EXCLUDED.nome_classe, sim=EXCLUDED.sim, n_itens=EXCLUDED.n_itens, metodo='full', atualizado=now()`);
    const done = Math.min(off + BATCH, total);
    if ((off / BATCH) % 5 === 0 || done === total) console.log(`  [inteira] ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }

  // ---- (1) passe 2: fallback do substantivo-cabeça p/ chaves de baixa sim (só adota se casar MELHOR) ----
  console.log(`fallback substantivo-cabeça (chaves com sim<${LO})…`);
  let rescued = 0;
  for (let off = 0; off < total; off += BATCH) {
    const r = await c.query(`
      UPDATE item_catmat_map m
      SET codigo_pdm=h.codigo_pdm, nome_pdm=h.nome_pdm, nome_classe=h.nome_classe, sim=h.hsim, metodo='cabeca', atualizado=now()
      FROM app.fila_catmat c CROSS JOIN LATERAL (
        SELECT codigo_pdm, nome_pdm, nome_classe, round(similarity(lower(nome_pdm), c.head)::numeric, 3) hsim
        FROM catmat_pdm ORDER BY lower(nome_pdm) <-> c.head LIMIT 1
      ) h
      WHERE m.chave=c.chave AND c.head IS NOT NULL AND length(c.head)>=4 AND c.head <> c.chave
        AND m.sim < ${LO} AND h.hsim > m.sim
        AND c.id > ${off} AND c.id <= ${off + BATCH}`);
    rescued += r.rowCount;
  }
  console.log(`  ${rescued.toLocaleString()} chaves resgatadas pelo substantivo-cabeça`);

  // ---- (3) canonização de PDM duplicado (mesmo nome normalizado → menor código) ----
  console.log(`canonizando PDMs duplicados…`);
  const dedup = await c.query(`
    WITH canon AS (
      SELECT codigo_pdm,
        first_value(codigo_pdm) OVER (PARTITION BY nn ORDER BY codigo_pdm) canonical,
        first_value(nome_pdm)   OVER (PARTITION BY nn ORDER BY codigo_pdm) cname
      FROM (SELECT codigo_pdm, nome_pdm, regexp_replace(lower(nome_pdm), '[^a-z0-9]+', '', 'g') nn
            FROM catmat_pdm WHERE nome_pdm IS NOT NULL) t)
    UPDATE item_catmat_map m SET codigo_pdm=canon.canonical, nome_pdm=canon.cname
    FROM canon WHERE canon.codigo_pdm=m.codigo_pdm AND canon.canonical <> m.codigo_pdm`);
  console.log(`  ${dedup.rowCount.toLocaleString()} chaves remapeadas p/ o código canônico`);

  // ---- (2) abstenção explícita ----
  await c.query(`UPDATE item_catmat_map SET aceito = (sim >= ${MIN_SIM})`);
  await c.query(`CREATE INDEX IF NOT EXISTS ix_item_catmat_pdm ON item_catmat_map (codigo_pdm)`);

  const s = (await c.query(`SELECT count(*) n, count(*) FILTER (WHERE aceito) ok, count(*) FILTER (WHERE metodo='cabeca') cabeca,
    sum(n_itens) itens, sum(n_itens) FILTER (WHERE aceito) itens_ok FROM item_catmat_map`)).rows[0];
  console.log(`\n✔ item_catmat_map: ${Number(s.n).toLocaleString()} chaves · ${Number(s.ok).toLocaleString()} aceitas (sim>=${MIN_SIM}, ${Math.round(s.ok / s.n * 100)}%) · ${Number(s.cabeca).toLocaleString()} via substantivo-cabeça`);
  console.log(`  itens-linha cobertos: ${Number(s.itens).toLocaleString()} · aceitos: ${Number(s.itens_ok).toLocaleString()} (${Math.round(s.itens_ok / s.itens * 100)}%)`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
