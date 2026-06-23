// ETL — Preço de REFERÊNCIA por item (descritivo canônico + unidade) entre municípios de SC, a partir de itens_sc (PNCP).
// Base da análise de VARIAÇÃO DE PREÇOS / sobrepreço (não há CATMAT → agrupa por descrição normalizada). node scripts/ingest_precos_referencia_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// descrição canônica: sem acento, maiúscula, só alfanumérico, espaços colapsados
const NORM = `trim(regexp_replace(upper(regexp_replace(translate(descricao,'ÁÀÃÂÉÊÍÓÔÕÚÜÇáàãâéêíóôõúüç','AAAAEEIOOOUUCAAAAEEIOOOUUC'),'[^A-Za-z0-9 ]',' ','g')),'\\s+',' ','g'))`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, keepAlive: true, statement_timeout: 600000 });
  console.log("calculando referência de preços (mediana/p25/p75 por item canônico)…");
  await db.query(`DROP TABLE IF EXISTS precos_referencia_sc`);
  await db.query(`CREATE TABLE precos_referencia_sc AS
    WITH n AS (
      SELECT ${NORM} AS k, unidade, cod_ibge, unit_homologado
      FROM itens_sc
      WHERE unit_homologado > 0 AND unit_homologado < 100000000 AND descricao IS NOT NULL AND length(${NORM}) >= 4
    )
    SELECT k, unidade,
      count(distinct cod_ibge) AS n_muns, count(*) AS n_compras,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY unit_homologado) AS mediana,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_homologado) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_homologado) AS p75,
      min(unit_homologado) AS preco_min, max(unit_homologado) AS preco_max
    FROM n
    GROUP BY k, unidade
    HAVING count(distinct cod_ibge) >= 5 AND count(*) >= 8`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_precos_ref ON precos_referencia_sc (k, unidade)`);
  const r = await db.query(`SELECT count(*) itens, round(avg(n_muns)) media_muns FROM precos_referencia_sc`);
  console.log(`precos_referencia_sc criada: ${JSON.stringify(r.rows[0])}`);
  console.log("amostra:", (await db.query(`SELECT left(k,38) item, unidade, n_muns, round(mediana::numeric,2) mediana, round(p25::numeric,2) p25, round(p75::numeric,2) p75 FROM precos_referencia_sc ORDER BY n_compras DESC LIMIT 6`)).rows.map((x) => `${x.item}[${x.unidade}] med=${x.mediana} (${x.n_muns}mun)`).join(" · "));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
