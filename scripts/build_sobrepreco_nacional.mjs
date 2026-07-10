// RECONSTRÓI o estudo de sobrepreço com DUPLO benchmark: mediana de SC (interno) + referência NACIONAL
// (Painel de Preços, forma AVULSA — comparável ao unitário municipal) + desvio-padrão e coeficiente de
// variação (IN SEGES/ME 65/2021 completa). É DERIVADO: lê o estado atual, não dá TRUNCATE em precos_referencia_sc
// nem toca no catmat_cod (populado pelo classificador). node scripts/build_sobrepreco_nacional.mjs
import fs from "fs"; import pg from "pg";
import { NORM, CANON, FILTRO_BENS } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });
  db.on("error", () => {});
  const c = await db.connect();

  // 1. colunas novas (idempotente): CV na referência SC; benchmark nacional + CV no sobrepreço
  await c.query(`ALTER TABLE precos_referencia_sc ADD COLUMN IF NOT EXISTS desvio NUMERIC, ADD COLUMN IF NOT EXISTS cv NUMERIC`);
  await c.query(`ALTER TABLE sobrepreco_compras_sc
    ADD COLUMN IF NOT EXISTS cv_ref NUMERIC,
    ADD COLUMN IF NOT EXISTS unit_nac NUMERIC,
    ADD COLUMN IF NOT EXISTS acima_nac_pct NUMERIC,
    ADD COLUMN IF NOT EXISTS nac_n INT`);

  // 2. itens normalizados + unidade canônica (mesma normalização do livro de preços)
  console.log("montando itens normalizados (temp)…");
  await c.query(`DROP TABLE IF EXISTS _it`);
  await c.query(`CREATE TEMP TABLE _it AS
    SELECT cod_ibge, ${NORM} chave, ${CANON.replace(/\bu\b/g, "lower(btrim(unidade))")} un,
      quantidade::numeric q, unit_homologado::numeric u, descricao, ano
    FROM itens_sc
    WHERE ${FILTRO_BENS} AND length(${NORM}) BETWEEN 6 AND 90`);
  await c.query(`CREATE INDEX ON _it (chave, un)`);
  const n = await c.query(`SELECT count(*) n FROM _it`); console.log(`  ${n.rows[0].n} itens-bem`);

  // 3. desvio-padrão e CV da referência SC (não altera mediana/quartis/catmat)
  console.log("desvio-padrão + coeficiente de variação da referência SC (IN 65)…");
  await c.query(`UPDATE precos_referencia_sc r SET desvio = s.dv, cv = s.cv
    FROM (SELECT chave, un, round(stddev_samp(u)::numeric,4) dv,
                 round((stddev_samp(u)/nullif(avg(u),0))::numeric,3) cv
          FROM _it GROUP BY chave, un) s
    WHERE r.chave=s.chave AND r.unidade=s.un`);
  const cvOk = await c.query(`SELECT count(*) n, count(*) FILTER (WHERE cv <= 0.5) baixo FROM precos_referencia_sc WHERE cv IS NOT NULL`);
  console.log(`  ${cvOk.rows[0].n} itens com CV · ${cvOk.rows[0].baixo} com CV≤0,5 (dispersão baixa, referência confiável)`);

  // 4. reconstrói as constatações de sobrepreço com o duplo benchmark
  console.log("constatações de sobrepreço (SC + nacional)…");
  await c.query(`TRUNCATE sobrepreco_compras_sc`);
  const find = await c.query(`
    INSERT INTO sobrepreco_compras_sc (cod_ibge, chave, unidade, descricao, ano, quantidade, unit_pago, unit_ref, acima_pct, economia, n_munis_ref, cv_ref, unit_nac, acima_nac_pct, nac_n)
    SELECT it.cod_ibge, it.chave, it.un, left(it.descricao,120), it.ano, round(it.q,2),
      round(it.u,4), r.mediana, round(((it.u/r.mediana)-1)*100,1),
      round((it.u - r.mediana)*it.q), r.n_munis, r.cv,
      nr.mediana,
      CASE WHEN nr.mediana>0 THEN round(((it.u/nr.mediana)-1)*100,1) END,
      nr.n_obs
    FROM _it it
    JOIN precos_referencia_sc r ON it.chave=r.chave AND it.un=r.unidade
    LEFT JOIN precos_nacional_ref nr ON nr.codigo_pdm=r.catmat_cod AND nr.unidade=r.unidade AND nr.forma='avulso'
    WHERE it.u > r.p75 AND it.u >= r.mediana*1.2 AND it.u <= r.mediana*4 AND (it.u - r.mediana)*it.q >= 500`);
  console.log(`  ${find.rowCount} constatações`);

  const tot = await c.query(`SELECT count(distinct cod_ibge) m, round(sum(economia)/1e6,1) mi,
    count(*) FILTER (WHERE unit_nac IS NOT NULL) cnac,
    count(*) FILTER (WHERE acima_nac_pct > 0) acnac FROM sobrepreco_compras_sc`);
  const t = tot.rows[0];
  console.log(`Cobertura: ${t.m} munis · R$ ${t.mi} mi vs mediana SC · ${t.cnac} constatações com referência nacional · ${t.acnac} também acima do nacional`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
