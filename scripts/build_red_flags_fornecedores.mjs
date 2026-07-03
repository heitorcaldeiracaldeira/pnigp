// RED FLAGS DE FORNECEDORES — sinais de risco de integridade por (município, fornecedor): CONCENTRAÇÃO (fatia do total
// contratado), SANCIONADO (CEIS/CNEP vigente) e SOBREPREÇO (itens pagos acima da referência de SC). Tudo em SQL.
// node scripts/build_red_flags_fornecedores.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const DIG = (c) => `regexp_replace(${c},'[^0-9]','','g')`;
const NORM = `lower(btrim(regexp_replace(regexp_replace(descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`DROP TABLE IF EXISTS red_flags_fornecedores_sc`);
  await c.query(`CREATE TABLE red_flags_fornecedores_sc (cod_ibge TEXT, ni TEXT, fornecedor TEXT, n_contratos INT, valor_total NUMERIC, share_pct NUMERIC, sancionado BOOLEAN, sanc_tipo TEXT, sanc_orgao TEXT, sobrepreco_economia NUMERIC, n_itens_sobrepreco INT, flags INT)`);

  console.log("sobrepreço por fornecedor (itens × livro de referência)…");
  await c.query(`DROP TABLE IF EXISTS _sobf`);
  await c.query(`CREATE TEMP TABLE _sobf AS
    SELECT i.cod_ibge, ${DIG("i.cnpj_fornecedor")} ni,
      round(sum((i.unit_homologado - r.mediana) * i.quantidade)) economia, count(*) n
    FROM itens_sc i
    JOIN precos_referencia_sc r ON r.chave = ${NORM} AND r.unidade = lower(btrim(i.unidade))
    WHERE i.unit_homologado > r.p75 AND i.unit_homologado >= r.mediana*1.2 AND i.unit_homologado <= r.mediana*4
      AND i.quantidade > 0 AND length(${DIG("i.cnpj_fornecedor")}) >= 11
    GROUP BY i.cod_ibge, ${DIG("i.cnpj_fornecedor")}`);
  await c.query(`CREATE INDEX ON _sobf (cod_ibge, ni)`);

  console.log("concentração + sanção + combinação…");
  const r = await c.query(`
    INSERT INTO red_flags_fornecedores_sc (cod_ibge, ni, fornecedor, n_contratos, valor_total, share_pct, sancionado, sanc_tipo, sanc_orgao, sobrepreco_economia, n_itens_sobrepreco, flags)
    WITH agg AS (
      SELECT cod_ibge, ${DIG("ni_fornecedor")} ni, max(fornecedor) fornecedor, count(*) n, sum(valor_global) v
      FROM contratos_sc WHERE valor_global > 0 AND length(${DIG("ni_fornecedor")}) >= 11
      GROUP BY cod_ibge, ${DIG("ni_fornecedor")}
    ), tot AS (SELECT cod_ibge, sum(v) tt FROM agg GROUP BY cod_ibge),
    sanc AS (SELECT DISTINCT ON (${DIG("ni")}) ${DIG("ni")} ni, tipo_sancao, orgao FROM sancoes WHERE (data_fim IS NULL OR data_fim >= current_date) ORDER BY ${DIG("ni")}, data_inicio DESC)
    SELECT a.cod_ibge, a.ni, a.fornecedor, a.n, round(a.v), round(a.v / nullif(t.tt,0) * 100, 1) share,
      (sn.ni IS NOT NULL), sn.tipo_sancao, sn.orgao,
      coalesce(sf.economia, 0), coalesce(sf.n, 0),
      (CASE WHEN a.v / nullif(t.tt,0) > 0.25 THEN 1 ELSE 0 END)
      + (CASE WHEN sn.ni IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN coalesce(sf.economia,0) > 50000 THEN 1 ELSE 0 END) flags
    FROM agg a JOIN tot t USING (cod_ibge)
    LEFT JOIN _sobf sf ON sf.cod_ibge=a.cod_ibge AND sf.ni=a.ni
    LEFT JOIN sanc sn ON sn.ni=a.ni
    WHERE a.v >= 50000`);
  console.log(`  ${r.rowCount} pares (município,fornecedor)`);
  await c.query(`CREATE INDEX idx_redflags_cod ON red_flags_fornecedores_sc (cod_ibge)`);
  const t = await db.query(`SELECT count(*) FILTER(WHERE flags>=2) crit, count(*) FILTER(WHERE flags>=1) algum, count(DISTINCT cod_ibge) m FROM red_flags_fornecedores_sc`);
  console.log(`Cobertura: ${t.rows[0].m} municípios · ${t.rows[0].algum} fornecedores com ≥1 red flag · ${t.rows[0].crit} críticos (≥2 flags)`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
