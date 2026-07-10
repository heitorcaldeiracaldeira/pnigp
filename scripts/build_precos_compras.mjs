// BANCO DE PREÇOS de referência de SC (mediana/quartis por item×UNIDADE CANONICALIZADA) + constatações de sobrepreço.
// A canonicalização de unidades é essencial: o dado bruto tem ~4.838 variações ("unidade"/"un"/"und"/"peça" = a mesma).
// node scripts/build_precos_compras.mjs
import fs from "fs"; import pg from "pg";
import { NORM, CANON } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS precos_referencia_sc (chave TEXT, unidade TEXT, mediana NUMERIC, p25 NUMERIC, p75 NUMERIC, n_itens INT, n_munis INT, PRIMARY KEY (chave, unidade))`);
  await c.query(`CREATE TABLE IF NOT EXISTS sobrepreco_compras_sc (cod_ibge TEXT, chave TEXT, unidade TEXT, descricao TEXT, ano INT, quantidade NUMERIC, unit_pago NUMERIC, unit_ref NUMERIC, acima_pct NUMERIC, economia NUMERIC, n_munis_ref INT)`);
  await c.query(`TRUNCATE precos_referencia_sc`); await c.query(`TRUNCATE sobrepreco_compras_sc`);

  console.log("montando itens normalizados + UNIDADE CANONICALIZADA (temp)…");
  await c.query(`DROP TABLE IF EXISTS _it`);
  await c.query(`CREATE TEMP TABLE _it AS
    SELECT cod_ibge, ${NORM} chave,
      ${CANON.replace(/\bu\b/g, "lower(btrim(unidade))")} un,
      quantidade::numeric q, unit_homologado::numeric u, descricao, ano
    FROM itens_sc
    WHERE unit_homologado BETWEEN 0.5 AND 100000 AND quantidade>0 AND descricao IS NOT NULL
      AND length(${NORM}) BETWEEN 6 AND 90
      AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
      AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`);
  await c.query(`CREATE INDEX ON _it (chave, un)`);
  const n = await c.query(`SELECT count(*) n, count(distinct un) u FROM _it`); console.log(`  ${n.rows[0].n} itens-bem · ${n.rows[0].u} unidades canônicas (era ~4838 brutas)`);

  console.log("livro de preços de referência (>=5 municípios)…");
  const ref = await c.query(`
    INSERT INTO precos_referencia_sc (chave, unidade, mediana, p25, p75, n_itens, n_munis)
    SELECT chave, un,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY u)::numeric,4),
      round(percentile_cont(0.25) WITHIN GROUP (ORDER BY u)::numeric,4),
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY u)::numeric,4),
      count(*), count(DISTINCT cod_ibge)
    FROM _it GROUP BY chave, un
    HAVING count(DISTINCT cod_ibge) >= 5 AND count(*) >= 8
      AND percentile_cont(0.75) WITHIN GROUP (ORDER BY u) <= percentile_cont(0.25) WITHIN GROUP (ORDER BY u) * 6
    ON CONFLICT (chave,unidade) DO NOTHING`);
  console.log(`  ${ref.rowCount} itens de referência (era 369)`);

  console.log("constatações de sobrepreço…");
  const find = await c.query(`
    INSERT INTO sobrepreco_compras_sc (cod_ibge, chave, unidade, descricao, ano, quantidade, unit_pago, unit_ref, acima_pct, economia, n_munis_ref)
    SELECT it.cod_ibge, it.chave, it.un, left(it.descricao,120), it.ano, round(it.q,2),
      round(it.u,4), r.mediana, round(((it.u/r.mediana)-1)*100,1),
      round((it.u - r.mediana)*it.q), r.n_munis
    FROM _it it JOIN precos_referencia_sc r ON it.chave=r.chave AND it.un=r.unidade
    WHERE it.u > r.p75 AND it.u >= r.mediana*1.2 AND it.u <= r.mediana*4 AND (it.u - r.mediana)*it.q >= 500`);
  console.log(`  ${find.rowCount} constatações`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_sobrep_cod ON sobrepreco_compras_sc (cod_ibge)`);
  await c.query(`CREATE INDEX IF NOT EXISTS ix_precos_ref_chave ON precos_referencia_sc (chave)`);
  const tot = await c.query(`SELECT count(distinct cod_ibge) m, round(sum(economia)/1e6,1) mi FROM sobrepreco_compras_sc`);
  console.log(`Cobertura sobrepreço: ${tot.rows[0].m} munis · R$ ${tot.rows[0].mi} mi vs mediana SC`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
