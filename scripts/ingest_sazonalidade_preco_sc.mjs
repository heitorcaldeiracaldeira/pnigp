// ETL — Sazonalidade de PREÇO por categoria de produto (SC). Índice relativo: preço do mês ÷ mediana anual do MESMO
// item canônico (normaliza itens diferentes). Identifica o melhor mês de compra por grupo. node scripts/ingest_sazonalidade_preco_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const NORM = `trim(regexp_replace(upper(regexp_replace(translate(i.descricao,'ÁÀÃÂÉÊÍÓÔÕÚÜÇáàãâéêíóôõúüç','AAAAEEIOOOUUCAAAAEEIOOOUUC'),'[^A-Za-z0-9 ]',' ','g')),'\\s+',' ','g'))`;
// classificação de categoria por palavra-chave no descritivo
const CAT = `CASE
  WHEN upper(i.descricao) ~ 'GASOLINA|DIESEL|ETANOL|COMBUSTIVEL|ARLA' THEN 'Combustível'
  WHEN upper(i.descricao) ~ 'FRUTA|LEGUME|VERDURA|HORTIFRUTI|CARNE|FRANGO|PEIXE|LEITE|PAO|ARROZ|FEIJAO|ACUCAR|OLEO DE|ALIMENT|MERENDA|CEREAL|FARINHA|OVO' THEN 'Alimentos'
  WHEN upper(i.descricao) ~ 'MEDICAMENTO|COMPRIMIDO|INJETAVEL|FARMAC|DIPIRONA|AMOXICILINA|SORO|AMPOLA|FRASCO AMPOLA|CAPSULA' THEN 'Medicamentos'
  WHEN upper(i.descricao) ~ 'SERINGA|LUVA|MASCARA|GAZE|SUTURA|CURATIVO|AGULHA|CATETER|ATADURA|ESPARADRAPO|INSUMO' THEN 'Insumos de saúde'
  WHEN upper(i.descricao) ~ 'LIMPEZA|DETERGENTE|SABAO|ALVEJANTE|DESINFETANTE|PAPEL HIGIENIC|AGUA SANITARIA|VASSOURA' THEN 'Material de limpeza'
  WHEN upper(i.descricao) ~ 'CANETA|PAPEL A4|TONER|CARTUCHO|EXPEDIENTE|GRAMPEAD|CADERNO|LAPIS|ESCOLAR|DIDATICO' THEN 'Escritório/escolar'
  WHEN upper(i.descricao) ~ 'CIMENTO|AREIA|BRITA|TIJOLO|MADEIRA|TUBO|CONEXAO|HIDRAULIC|CONSTRUCAO|FERRO|TINTA|ASFALTO|CONCRETO' THEN 'Material de construção'
  WHEN upper(i.descricao) ~ 'PNEU|VEICUL|ONIBUS|CAMINHAO|AUTOMOVEL|PECA|LUBRIFICANTE|BATERIA' THEN 'Veículos/peças'
  ELSE NULL END`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, keepAlive: true, statement_timeout: 600000 });
  console.log("calculando sazonalidade de preço por categoria (índice relativo)…");
  await db.query(`DROP TABLE IF EXISTS sazonalidade_preco_sc`);
  await db.query(`CREATE TABLE sazonalidade_preco_sc AS
    WITH base AS (
      SELECT ${NORM} k, i.unidade, i.unit_homologado uh, extract(month from p.data_pub)::int mes, ${CAT} categoria
      FROM itens_sc i JOIN processos_sc p ON p.cnpj_orgao=i.cnpj AND p.ano=i.ano AND p.sequencial=i.seq
      WHERE i.unit_homologado > 0 AND p.data_pub IS NOT NULL
    ),
    base2 AS (SELECT * FROM base WHERE categoria IS NOT NULL),
    med AS (SELECT k, unidade, percentile_cont(0.5) WITHIN GROUP (ORDER BY uh) mi FROM base2 GROUP BY 1,2 HAVING count(*) >= 12),
    idx AS (SELECT b.categoria, b.mes, b.uh/m.mi ratio FROM base2 b JOIN med m ON m.k=b.k AND m.unidade=b.unidade WHERE m.mi>0 AND b.uh/m.mi BETWEEN 0.2 AND 5)
    SELECT categoria, mes, round((avg(ratio)*100)::numeric) indice, count(*) n FROM idx GROUP BY 1,2`);
  const r = await db.query(`SELECT categoria, count(*) meses FROM sazonalidade_preco_sc GROUP BY 1 ORDER BY 1`);
  console.log("categorias:", r.rows.map((x) => `${x.categoria}(${x.meses}m)`).join(" · "));
  console.log("=== melhor mês por categoria (menor índice) ===");
  const best = await db.query(`SELECT DISTINCT ON (categoria) categoria, mes, indice, n FROM sazonalidade_preco_sc WHERE n>=20 ORDER BY categoria, indice ASC`);
  const MES = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  best.rows.forEach((x) => console.log(`  ${x.categoria}: melhor em ${MES[x.mes]} (índice ${x.indice}, n=${x.n})`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
