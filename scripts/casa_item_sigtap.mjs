// CASAMENTO item→SIGTAP — determinístico, sem similaridade e sem LLM.
//   node scripts/casa_item_sigtap.mjs
//
// ═══ POR QUE ISTO NÃO É UM CLASSIFICADOR ═══
// O município escreve o código do procedimento DENTRO da descrição ("02.02.01.047 3 dosagem de glicose").
// Então aqui não se adivinha nada: extrai-se o código e consulta-se a tabela. É **parse, não match** — e por
// isso não tem limiar, não tem `sim`, não tem abstenção por similaridade. A única incerteza é se o código
// que o município digitou EXISTE de fato no SIGTAP, e é isso que `valido` responde.
//
// ⚠️ A VALIDAÇÃO É O QUE SEPARA ISTO DE UM CHUTE. Dez dígitos no começo de um texto poderiam ser qualquer
// coisa — número de processo, código interno, lote. Só entra como rótulo o que casa com um procedimento
// real da tabela do SUS. Sem essa guarda, o "parse determinístico" seria só uma nova forma de errar para
// cima ([[pnigp-criterio-frouxo-erra-sempre-para-cima]]).
//
// ⚠️ A busca é em QUALQUER posição da descrição, não só no começo: alguns municípios põem o código depois
// do nome do procedimento. Ancorar em `^` acharia menos e ninguém saberia
// ([[pnigp-varredura-colher-tudo-nao-o-primeiro]]).
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });

// GG.SS.TT.PPP-D com separadores livres (ponto, espaço, hífen) — o município digita como quiser.
const PADRAO = `'[0-9]{2}[. ][0-9]{2}[. ][0-9]{2}[. ][0-9]{3}[ .-]?[0-9]'`;
const EXTRAI = `regexp_replace((regexp_match(chave, ${PADRAO}))[1], '[^0-9]', '', 'g')`;

await db.query(`DROP TABLE IF EXISTS item_sigtap_map`);
await db.query(`CREATE TABLE item_sigtap_map (
  chave TEXT PRIMARY KEY,
  origem TEXT,                   -- de qual fila veio: 'S' (serviço) ou 'M' (material)
  co_procedimento TEXT,
  no_procedimento TEXT,
  no_grupo TEXT, no_sub_grupo TEXT, no_forma_organizacao TEXT,
  tp_complexidade TEXT,
  n_itens INT,
  valido BOOLEAN,                -- o código digitado existe no SIGTAP?
  competencia TEXT,
  atualizado TIMESTAMPTZ DEFAULT now())`);

for (const [origem, mapa] of [["S", "item_catser_map"], ["M", "item_catmat_map"]]) {
  const r = await db.query(`
    INSERT INTO item_sigtap_map (chave, origem, co_procedimento, no_procedimento,
      no_grupo, no_sub_grupo, no_forma_organizacao, tp_complexidade, n_itens, valido, competencia)
    SELECT m.chave, $1, x.cod, p.no_procedimento,
      g.no_grupo, sg.no_sub_grupo, fo.no_forma_organizacao, p.tp_complexidade,
      m.n_itens, p.co_procedimento IS NOT NULL, p.competencia
    FROM ${mapa} m
    CROSS JOIN LATERAL (SELECT ${EXTRAI.replace(/chave/g, "m.chave")} AS cod) x
    LEFT JOIN sigtap_procedimento p ON p.co_procedimento = x.cod
    LEFT JOIN sigtap_grupo g ON g.co_grupo = left(x.cod, 2)
    LEFT JOIN sigtap_sub_grupo sg ON sg.co_grupo = left(x.cod, 2) AND sg.co_sub_grupo = substr(x.cod, 3, 2)
    LEFT JOIN sigtap_forma_organizacao fo ON fo.co_grupo = left(x.cod, 2)
      AND fo.co_sub_grupo = substr(x.cod, 3, 2) AND fo.co_forma_organizacao = substr(x.cod, 5, 2)
    WHERE x.cod IS NOT NULL AND length(x.cod) = 10
    ON CONFLICT (chave) DO NOTHING`, [origem]);
  console.log(`${mapa}: ${r.rowCount.toLocaleString()} chaves com código SIGTAP no texto`);
}

console.log("\n═══ A PROVA: o código que o município digitou existe no SIGTAP? ═══");
console.table((await db.query(`
  SELECT origem, valido, count(*)::int chaves, coalesce(sum(n_itens),0)::int linhas,
         round(100.0*count(*) / sum(count(*)) OVER (PARTITION BY origem), 1)::text pct
  FROM item_sigtap_map GROUP BY 1,2 ORDER BY 1, 2 DESC`)).rows);

console.log("═══ o que isso resolve na base de SERVIÇO ═══");
console.table((await db.query(`
  SELECT
    (SELECT count(*)::int FROM item_catser_map) chaves_servico,
    (SELECT coalesce(sum(n_itens),0)::int FROM item_catser_map) linhas_servico,
    (SELECT count(*)::int FROM item_sigtap_map WHERE origem='S' AND valido) chaves_sigtap,
    (SELECT coalesce(sum(n_itens),0)::int FROM item_sigtap_map WHERE origem='S' AND valido) linhas_sigtap,
    (SELECT count(*)::int FROM item_sigtap_map s JOIN item_catser_map c USING (chave)
      WHERE s.origem='S' AND s.valido AND c.aceito) tambem_aceitas_no_catser`)).rows);

console.log("═══ o que o CATSER dizia dessas mesmas chaves (o ruído que isto substitui) ═══");
console.table((await db.query(`
  SELECT c.aceito AS catser_aceitava, count(*)::int chaves, round(avg(c.sim),3)::text sim_medio_catser
  FROM item_sigtap_map s JOIN item_catser_map c USING (chave)
  WHERE s.origem='S' AND s.valido GROUP BY 1 ORDER BY 2 DESC`)).rows);

console.log("═══ amostra ═══");
console.table((await db.query(`
  SELECT left(chave,42) descricao_municipal, co_procedimento, left(no_procedimento,44) sigtap, n_itens
  FROM item_sigtap_map WHERE valido ORDER BY n_itens DESC LIMIT 8`)).rows);

const inval = (await db.query(`SELECT left(chave,60) chave, co_procedimento, n_itens
  FROM item_sigtap_map WHERE NOT valido ORDER BY n_itens DESC LIMIT 5`)).rows;
if (inval.length) { console.log("═══ códigos que NÃO existem no SIGTAP (digitação errada ou outra tabela) ═══"); console.table(inval); }
await db.end();
