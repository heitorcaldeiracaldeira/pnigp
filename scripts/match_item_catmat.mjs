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

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS item_catmat_map (chave TEXT PRIMARY KEY, codigo_pdm INT, nome_pdm TEXT, nome_classe TEXT, sim NUMERIC, n_itens INT, aceito BOOLEAN, metodo TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await c.query(`ALTER TABLE item_catmat_map ADD COLUMN IF NOT EXISTS aceito BOOLEAN, ADD COLUMN IF NOT EXISTS metodo TEXT`);

  console.log(`materializando chaves de bens (n>=${MIN_N}, length 4..90)…`);
  await c.query(`DROP TABLE IF EXISTS _ch`);
  // head = substantivo-cabeça: run alfabético inicial da chave (o produto), no máx 5 palavras
  await c.query(`CREATE TEMP TABLE _ch AS
    SELECT u.id, u.chave, u.n,
      NULLIF(array_to_string((string_to_array(trim(coalesce((regexp_match(lower(u.chave), '^([a-záàâãéêíóôõúüç ]+)'))[1], '')), ' '))[1:5], ' '), '') head
    FROM (
      SELECT row_number() OVER (ORDER BY n DESC) id, chave, n FROM (
        SELECT ${NORM} chave, count(*) n FROM itens_sc
        WHERE unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL
          AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
          AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'
        GROUP BY 1 HAVING count(*) >= ${MIN_N} AND length(${NORM}) BETWEEN 4 AND 90) t
    ) u`);
  await c.query(`CREATE INDEX ON _ch (id)`);
  const total = Number((await c.query(`SELECT count(*) n FROM _ch`)).rows[0].n);
  console.log(`  ${total.toLocaleString()} chaves a casar · lotes de ${BATCH}`);

  // ---- passe 1: casamento pela descrição inteira ----
  const t0 = Date.now();
  for (let off = 0; off < total; off += BATCH) {
    await c.query(`
      INSERT INTO item_catmat_map (chave, codigo_pdm, nome_pdm, nome_classe, sim, n_itens, metodo)
      SELECT c.chave, m.codigo_pdm, m.nome_pdm, m.nome_classe,
        round(similarity(lower(m.nome_pdm), c.chave)::numeric, 3), c.n, 'full'
      FROM _ch c CROSS JOIN LATERAL (
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
      FROM _ch c CROSS JOIN LATERAL (
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
