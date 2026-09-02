// catmat_pdm — o ALVO do casamento do CATMAT, agregado a partir de catmat_catalogo.
//   node scripts/build_catmat_pdm.mjs
//
// ═══ POR QUE ESTE ARQUIVO PRECISOU EXISTIR (01/set/2026) ═══
// `match_item_catmat.mjs` casa contra `catmat_pdm` (20.332 nomes de PDM), mas o ingestor do catálogo
// (`ingest_catmat_catalogo.mjs`) escreve `catmat_catalogo` (343 mil ITENS). **Nenhum script do repo fazia a
// agregação entre os dois.** A tabela existia com 20.332 linhas — exatamente os `codigo_pdm` distintos do
// catálogo — construída uma vez, à mão ou por um script que não sobreviveu, e desde então congelada.
//
// > 🚨 Elo ausente não dói enquanto ninguém puxa a corda. Hoje as duas estão em sincronia, então nada
// > estava errado — mas a primeira vez que o catálogo federal fosse reingerido, o motor continuaria casando
// > contra o retrato velho, **sem erro nenhum e sem número piorando**. É o mesmo formato do motor parado 51
// > dias ([[pnigp-catmat-classificacao]]): produtor vivo, elo intermediário sem dono.
//
// Reconstruir é barato (uma agregação sobre 343 mil linhas) e torna a cadeia fechada de ponta a ponta:
// catálogo federal → PDM → casamento → classificação.
//
// ⚠️ `item_ex` é um ITEM DE EXEMPLO do PDM, guardado para inspeção humana ("que produto é esse PDM?").
// Escolhe-se o MENOR codigo_item de forma determinística: sem ORDER BY explícito o exemplo mudaria a cada
// reconstrução e produziria diff sem significado.
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });

const antes = Number((await db.query(`SELECT count(*) n FROM catmat_pdm`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);

await db.query(`CREATE TABLE IF NOT EXISTS catmat_pdm (
  codigo_pdm INTEGER PRIMARY KEY, nome_pdm TEXT, nome_classe TEXT, n_itens BIGINT, item_ex INTEGER)`);

// Reconstrução em transação: o motor lê esta tabela, e deixá-la vazia entre o TRUNCATE e o INSERT
// faria uma rodada concorrente casar contra nada e gravar abstenção em tudo.
await db.query("BEGIN");
await db.query(`TRUNCATE catmat_pdm`);
const r = await db.query(`INSERT INTO catmat_pdm (codigo_pdm, nome_pdm, nome_classe, n_itens, item_ex)
  SELECT codigo_pdm,
         min(nome_pdm)     AS nome_pdm,
         min(nome_classe)  AS nome_classe,
         count(*)          AS n_itens,
         min(codigo_item)  AS item_ex
  FROM catmat_catalogo
  WHERE codigo_pdm IS NOT NULL AND nome_pdm IS NOT NULL
  GROUP BY codigo_pdm`);
await db.query("COMMIT");

await db.query(`CREATE INDEX IF NOT EXISTS ix_catmat_pdm_trgm ON catmat_pdm USING gin (lower(nome_pdm) gin_trgm_ops)`)
  .catch((e) => console.log("índice:", e.message.slice(0, 70)));

const cat = Number((await db.query(`SELECT count(DISTINCT codigo_pdm) n FROM catmat_catalogo WHERE codigo_pdm IS NOT NULL`)).rows[0].n);
console.log(`catmat_pdm: ${antes.toLocaleString()} → ${r.rowCount.toLocaleString()} PDMs (catálogo tem ${cat.toLocaleString()} distintos)`);
if (r.rowCount !== cat) console.log(`⚠ divergência de ${Math.abs(cat - r.rowCount)} — PDM sem nome no catálogo é descartado de propósito`);
await db.end();
