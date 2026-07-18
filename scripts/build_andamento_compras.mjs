// DERIVADA (andar 2, Lei 1) — app.andamento_compras_sc: por município × modalidade × STATUS DO ITEM × valor.
// O andamento vive no ITEM (situacao: Homologado/Em andamento/Deserto/Fracassado), não no processo (98% "Divulgada").
// Denominador = ITENS (rótulo à mostra). Valor = homologado quando comprou; estimado quando não (o "em risco"/intenção).
// "Recebendo proposta" = Em andamento com prazo de proposta no futuro. Reconstruível: DROP + rebuild do espelho.
// node scripts/build_andamento_compras.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });

async function main() {
  await db.query(`CREATE SCHEMA IF NOT EXISTS app`);
  await db.query(`DROP TABLE IF EXISTS app.andamento_compras_sc`);
  console.log("agregando itens_sc × contratacoes_sc (pode levar ~1 min)…");
  // TETO_ITEM: acima disso o valor do item é IMPLAUSÍVEL p/ município (erro de digitação: unit/qtd absurdos).
  // Conta o item (quantidade honesta), mas NÃO soma o valor dele; marca quantos foram excluídos. Bruto fica no espelho.
  const TETO_ITEM = 1e8;   // R$ 100 milhões/item
  await db.query(`
    CREATE TABLE app.andamento_compras_sc AS
    WITH base AS (
      SELECT
        i.cod_ibge,
        c.modalidade,
        CASE
          WHEN i.situacao = 'Homologado' THEN 'Homologado'
          WHEN i.situacao = 'Deserto' THEN 'Deserto'
          WHEN i.situacao = 'Fracassado' THEN 'Fracassado'
          WHEN i.situacao ILIKE 'Anulado%' OR i.situacao ILIKE '%revogad%' OR i.situacao ILIKE '%cancelad%' THEN 'Cancelado'
          WHEN i.situacao = 'Em andamento' AND c.data_encerramento IS NOT NULL
               AND to_timestamp(substr(c.data_encerramento,1,19),'YYYY-MM-DD"T"HH24:MI:SS') > now() THEN 'Recebendo proposta'
          WHEN i.situacao = 'Em andamento' THEN 'Em andamento'
          ELSE 'Outro'
        END AS status,
        (CASE WHEN i.situacao = 'Homologado' THEN coalesce(i.unit_homologado, i.unit_estimado, 0)
              ELSE coalesce(i.unit_estimado, 0) END * coalesce(i.quantidade, 0)) AS valor_item,
        -- valor_max = implausível em QUALQUER campo (estimado OU homologado) → controle interno vê TODO typo,
        -- não só o que afeta o valor exibido (o estimado furado que homologou são também precisa ser corrigido).
        (greatest(coalesce(i.unit_estimado, 0), coalesce(i.unit_homologado, 0)) * coalesce(i.quantidade, 0)) AS valor_max
      FROM itens_sc i
      JOIN contratacoes_sc c ON c.cnpj = i.cnpj AND c.ano = i.ano AND c.seq = i.seq
      WHERE i.cod_ibge IS NOT NULL AND c.modalidade IS NOT NULL
    )
    SELECT cod_ibge, modalidade, status,
      count(*)::int AS n_itens,
      count(*) FILTER (WHERE valor_max > ${TETO_ITEM})::int AS n_implausivel,
      round(sum(valor_item) FILTER (WHERE valor_item <= ${TETO_ITEM})::numeric, 2) AS valor
    FROM base GROUP BY 1, 2, 3`);
  await db.query(`CREATE INDEX ix_andc_cod ON app.andamento_compras_sc (cod_ibge)`);

  // Companheira: os ITENS flagados como implausíveis, detalhados — para o painel mostrar em TABELA (controle interno).
  await db.query(`DROP TABLE IF EXISTS app.compra_valor_implausivel_sc`);
  await db.query(`
    CREATE TABLE app.compra_valor_implausivel_sc AS
    SELECT i.cod_ibge, c.modalidade, c.numero_controle, i.numero,
      left(i.descricao, 120) AS descricao, i.quantidade, i.unit_estimado, i.unit_homologado, i.situacao,
      round((greatest(coalesce(i.unit_estimado,0), coalesce(i.unit_homologado,0)) * coalesce(i.quantidade,0))::numeric, 2) AS valor
    FROM itens_sc i
    JOIN contratacoes_sc c ON c.cnpj = i.cnpj AND c.ano = i.ano AND c.seq = i.seq
    WHERE i.cod_ibge IS NOT NULL AND c.modalidade IS NOT NULL
      AND greatest(coalesce(i.unit_estimado,0), coalesce(i.unit_homologado,0)) * coalesce(i.quantidade,0) > ${TETO_ITEM}`);
  await db.query(`CREATE INDEX ix_cvi_cod ON app.compra_valor_implausivel_sc (cod_ibge)`);

  // resumo p/ conferência (SC inteira)
  const r = (await db.query(`SELECT status, sum(n_itens)::bigint n, round(sum(valor))::bigint v FROM app.andamento_compras_sc GROUP BY 1 ORDER BY sum(valor) DESC`)).rows;
  const tot = (await db.query(`SELECT sum(n_itens)::bigint n, round(sum(valor))::bigint v, sum(n_implausivel)::int impl, count(distinct cod_ibge)::int munis FROM app.andamento_compras_sc`)).rows[0];
  console.log(`\n✔ app.andamento_compras_sc criada · ${Number(tot.n).toLocaleString()} itens · ${tot.munis} municípios · R$ ${(Number(tot.v)/1e9).toFixed(1)} bi`);
  console.log(`  (${tot.impl} itens com valor implausível EXCLUÍDOS do valor — contados na quantidade, preservados no espelho)`);
  console.log("\nstatus (SC) — quantidade · valor:");
  for (const x of r) console.log(`  ${String(x.status).padEnd(20)} ${Number(x.n).toLocaleString().padStart(12)} itens  ·  R$ ${(Number(x.v)/1e9).toFixed(2)} bi`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
