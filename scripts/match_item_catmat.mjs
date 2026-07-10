// CASAMENTO item→CATMAT (direto, por trigrama) — classifica CADA descrição normalizada de bem (chave) no melhor PDM
// do catálogo CATMAT, multiplicando a cobertura que antes vinha só das 1.007 referências agregadas. Set-based (LATERAL
// KNN sobre índice GiST trgm de catmat_pdm), em lotes para dar progresso. Param: MIN_N (freq. mínima da chave, def. 2),
// MIN_SIM (limiar de "classificado", def. 0.5). node scripts/match_item_catmat.mjs
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MIN_N = Number(process.env.MIN_N || 2);
const MIN_SIM = Number(process.env.MIN_SIM || 0.5);
const BATCH = 4000;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS item_catmat_map (chave TEXT PRIMARY KEY, codigo_pdm INT, nome_pdm TEXT, nome_classe TEXT, sim NUMERIC, n_itens INT, atualizado TIMESTAMPTZ DEFAULT now())`);

  console.log(`materializando chaves de bens (n>=${MIN_N}, length 4..90)…`);
  await c.query(`DROP TABLE IF EXISTS _ch`);
  await c.query(`CREATE TEMP TABLE _ch AS
    SELECT row_number() OVER (ORDER BY n DESC) id, chave, n FROM (
      SELECT ${NORM} chave, count(*) n FROM itens_sc
      WHERE unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL
        AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
        AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'
      GROUP BY 1 HAVING count(*) >= ${MIN_N} AND length(${NORM}) BETWEEN 4 AND 90) t`);
  await c.query(`CREATE INDEX ON _ch (id)`);
  const total = Number((await c.query(`SELECT count(*) n FROM _ch`)).rows[0].n);
  console.log(`  ${total.toLocaleString()} chaves a casar · lotes de ${BATCH}`);

  const t0 = Date.now();
  for (let off = 0; off < total; off += BATCH) {
    await c.query(`
      INSERT INTO item_catmat_map (chave, codigo_pdm, nome_pdm, nome_classe, sim, n_itens)
      SELECT c.chave, m.codigo_pdm, m.nome_pdm, m.nome_classe,
        round(similarity(lower(m.nome_pdm), c.chave)::numeric, 3), c.n
      FROM _ch c CROSS JOIN LATERAL (
        SELECT codigo_pdm, nome_pdm, nome_classe FROM catmat_pdm ORDER BY lower(nome_pdm) <-> c.chave LIMIT 1
      ) m
      WHERE c.id > ${off} AND c.id <= ${off + BATCH}
      ON CONFLICT (chave) DO UPDATE SET codigo_pdm=EXCLUDED.codigo_pdm, nome_pdm=EXCLUDED.nome_pdm, nome_classe=EXCLUDED.nome_classe, sim=EXCLUDED.sim, n_itens=EXCLUDED.n_itens, atualizado=now()`);
    const done = Math.min(off + BATCH, total);
    if ((off / BATCH) % 5 === 0 || done === total) console.log(`  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await c.query(`CREATE INDEX IF NOT EXISTS ix_item_catmat_pdm ON item_catmat_map (codigo_pdm)`);

  const s = (await c.query(`SELECT count(*) n, count(*) FILTER (WHERE sim>=${MIN_SIM}) ok, sum(n_itens) itens, sum(n_itens) FILTER (WHERE sim>=${MIN_SIM}) itens_ok FROM item_catmat_map`)).rows[0];
  console.log(`\n✔ item_catmat_map: ${Number(s.n).toLocaleString()} chaves · ${Number(s.ok).toLocaleString()} com sim>=${MIN_SIM} (${Math.round(s.ok / s.n * 100)}%)`);
  console.log(`  itens-linha cobertos: ${Number(s.itens).toLocaleString()} · com sim>=${MIN_SIM}: ${Number(s.itens_ok).toLocaleString()}`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
