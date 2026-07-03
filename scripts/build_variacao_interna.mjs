// VARIAÇÃO INTERNA DE PREÇOS — itens que o MESMO município comprou a preços unitários diferentes (incoerência interna).
// Economia = padronizar pelo MENOR preço que o próprio município já conseguiu. Tudo em SQL (rápido, sem transferir dados).
// node scripts/build_variacao_interna.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const NORM = `lower(btrim(regexp_replace(regexp_replace(descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS variacao_interna_sc (cod_ibge TEXT, descricao TEXT, unidade TEXT, n_compras INT, menor NUMERIC, maior NUMERIC, razao NUMERIC, qtd_total NUMERIC, gasto NUMERIC, economia NUMERIC)`);
  await db.query(`TRUNCATE variacao_interna_sc`);
  console.log("computando variação interna (em SQL)…");
  const r = await db.query(`
    INSERT INTO variacao_interna_sc (cod_ibge, descricao, unidade, n_compras, menor, maior, razao, qtd_total, gasto, economia)
    WITH it AS (
      SELECT cod_ibge, ${NORM} chave, lower(btrim(unidade)) un, quantidade, unit_homologado, descricao
      FROM itens_sc
      WHERE unit_homologado BETWEEN 0.5 AND 5000 AND quantidade>0 AND descricao IS NOT NULL AND length(descricao)>5
        AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento|sistema|software|licen'
        AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'
    )
    SELECT cod_ibge,
      (array_agg(descricao ORDER BY length(descricao) DESC))[1] descricao,
      un, count(*) n,
      round(min(unit_homologado)::numeric,2), round(max(unit_homologado)::numeric,2),
      round((max(unit_homologado)/min(unit_homologado))::numeric,1),
      round(sum(quantidade)::numeric,0),
      round(sum(quantidade*unit_homologado)::numeric,0),
      round((sum(quantidade*unit_homologado) - min(unit_homologado)*sum(quantidade))::numeric,0)
    FROM it GROUP BY cod_ibge, chave, un
    HAVING count(*)>=4
      AND max(unit_homologado) BETWEEN min(unit_homologado)*1.8 AND min(unit_homologado)*12
      AND (sum(quantidade*unit_homologado) - min(unit_homologado)*sum(quantidade)) >= 2000
  `);
  console.log("constatações inseridas:", r.rowCount);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_varint_cod ON variacao_interna_sc (cod_ibge)`);
  const tot = await db.query(`SELECT count(distinct cod_ibge) m, round(sum(economia)/1e6,1) mi FROM variacao_interna_sc`);
  console.log(`Cobertura: ${tot.rows[0].m} municípios · R$ ${tot.rows[0].mi} mi de economia potencial por padronização interna`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
