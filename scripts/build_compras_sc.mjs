// DERIVADA (andar 2, Lei 1) — compras_sc reconstruída DO ESPELHO (contratacoes_sc), sem tocar a API do PNCP.
// Substitui o antigo ingest_compras_sc.mjs (que re-buscava o PNCP e era morto pelo monitor: UPSERT em tabela de
// tamanho fixo → count(*) parado → falso "estagnado"). Aqui: TRUNCATE + INSERT num só transação, roda em segundos.
// Agregado por (cod_ibge, ano). Estado (esfera E) some sob cod_ibge='42'. Reconstruível: é só re-rodar.
//   node scripts/build_compras_sc.mjs
//
// OUTLIER (padrão do painel de andamento): um processo com valor_estimado OU valor_homologado > TETO_PROC é
// IMPLAUSÍVEL (ex.: 1 Dispensa de R$50 bi = erro de digitação, art.75 limita dispensa a ~R$1,4 mi). Ele é:
//   • EXCLUÍDO de todo valor de manchete (soma, economia, dispensa, por_modalidade, top-15);
//   • CONTADO à parte (compras_sc.n_implausivel) — a quantidade continua honesta;
//   • LISTADO em app.compra_processo_implausivel_sc (controle interno — o gestor vê e decide).
// O bruto NUNCA some: fica intacto no espelho (contratacoes_sc). Erro não se esconde, se mostra.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

const TETO_PROC = 1e9; // R$ 1 bilhão/processo — acima disso é implausível p/ um ente de SC (revisar caso a caso)

// Semântica idêntica ao agregado antigo:
//  • modalidades: todas menos Manifestação de Interesse (10) e Pré-qualificação (11) — são FASES, não compras.
//  • comparáveis p/ economia: Concorrência Elet/Pres (4,5) e Pregão Elet/Pres (6,7) — só nelas estimado×homologado
//    têm o mesmo sentido; Dispensa/Inexig./Credenciamento o estimado<<homologado é ESTRUTURAL, não sobrepreço.
//  • sem licitação (dispensa_pct): Dispensa (8) e Inexigibilidade (9).
//  • valor_estimado gravado = soma do estimado SÓ das comparáveis (idêntico ao antigo).
const SQL = `
WITH proc AS (
  SELECT
    CASE WHEN esfera = 'E' THEN '42' ELSE cod_ibge END AS ibge,
    ano,
    modalidade,
    coalesce(valor_estimado, 0)   AS est,
    coalesce(valor_homologado, 0) AS hom,
    (greatest(coalesce(valor_estimado,0), coalesce(valor_homologado,0)) > ${TETO_PROC}) AS impl, -- outlier: fora do valor
    (modalidade_id IN (4,5,6,7)
       AND coalesce(valor_estimado,0) > 0
       AND coalesce(valor_homologado,0) > 0) AS cmp,   -- entra no cálculo de economia
    (modalidade_id IN (8,9))                 AS sem_lic, -- dispensa/inexigibilidade
    objeto, orgao_razao_social AS orgao, cnpj, seq, data_publicacao
  FROM contratacoes_sc
  WHERE modalidade_id NOT IN (10,11)
    AND ano BETWEEN 2020 AND EXTRACT(YEAR FROM now())::int   -- descarta anoCompra-lixo (2205, 2923, 2031, futuro)
    AND ((esfera = 'M' AND cod_ibge IS NOT NULL) OR esfera = 'E')
),
agg AS (
  SELECT ibge, ano,
    count(*)::int AS n_contratos,
    count(*) FILTER (WHERE impl)::int AS n_implausivel,
    round(coalesce(sum(est) FILTER (WHERE cmp AND NOT impl), 0)::numeric, 2) AS valor_estimado,
    round(coalesce(sum(hom) FILTER (WHERE NOT impl), 0)::numeric, 2) AS valor_homologado,
    CASE WHEN sum(est) FILTER (WHERE cmp AND NOT impl) > 0
      THEN round((( sum(est) FILTER (WHERE cmp AND NOT impl) - sum(hom) FILTER (WHERE cmp AND NOT impl) )
                  / sum(est) FILTER (WHERE cmp AND NOT impl) * 100)::numeric, 2)
      ELSE 0 END AS economia_pct,
    CASE WHEN sum(hom) FILTER (WHERE NOT impl) > 0
      THEN round((sum(hom) FILTER (WHERE sem_lic AND NOT impl) / sum(hom) FILTER (WHERE NOT impl) * 100)::numeric, 2)
      ELSE 0 END AS dispensa_pct
  FROM proc GROUP BY ibge, ano
),
pm AS (
  SELECT ibge, ano,
    jsonb_agg(jsonb_build_object('modalidade', modalidade, 'n', n, 'valor', valor) ORDER BY valor DESC) AS por_modalidade
  FROM (
    SELECT ibge, ano, modalidade, count(*)::int AS n, round(coalesce(sum(hom) FILTER (WHERE NOT impl), 0)::numeric, 2) AS valor
    FROM proc GROUP BY ibge, ano, modalidade
  ) s GROUP BY ibge, ano
),
tp AS (
  SELECT ibge, ano, jsonb_agg(j ORDER BY hom DESC) AS top
  FROM (
    SELECT ibge, ano, hom,
      jsonb_build_object(
        'objeto', left(objeto, 240), 'modalidade', modalidade, 'orgao', orgao,
        'estimado', round(est::numeric, 2), 'homologado', round(hom::numeric, 2),
        'economia_pct', CASE WHEN est > 0 AND hom > 0 THEN round(((est - hom) / est * 100)::numeric, 2) ELSE NULL END,
        'data', left(data_publicacao, 10), 'cnpj', cnpj, 'ano', ano, 'seq', seq) AS j,
      row_number() OVER (PARTITION BY ibge, ano ORDER BY hom DESC) AS rn
    FROM proc WHERE NOT impl   -- top-15 só de processos plausíveis (não encabeça pelo erro)
  ) s WHERE rn <= 15 GROUP BY ibge, ano
)
INSERT INTO compras_sc (cod_ibge, ano, n_contratos, n_implausivel, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade, top)
SELECT a.ibge, a.ano, a.n_contratos, a.n_implausivel, a.valor_estimado, a.valor_homologado, a.economia_pct, a.dispensa_pct,
  coalesce(pm.por_modalidade, '[]'::jsonb), coalesce(tp.top, '[]'::jsonb)
FROM agg a
LEFT JOIN pm ON pm.ibge = a.ibge AND pm.ano = a.ano
LEFT JOIN tp ON tp.ibge = a.ibge AND tp.ano = a.ano`;

// Companheira (controle interno) — os processos IMPLAUSÍVEIS, detalhados, para o painel mostrar em TABELA.
const SQL_IMPL = `
CREATE TABLE app.compra_processo_implausivel_sc AS
SELECT
  CASE WHEN esfera = 'E' THEN '42' ELSE cod_ibge END AS cod_ibge,
  ano, modalidade, numero_controle,
  left(objeto, 160) AS objeto,
  orgao_razao_social AS orgao,
  round(coalesce(valor_estimado,0)::numeric, 2)   AS valor_estimado,
  round(coalesce(valor_homologado,0)::numeric, 2) AS valor_homologado
FROM contratacoes_sc
WHERE modalidade_id NOT IN (10,11)
  AND ano BETWEEN 2020 AND EXTRACT(YEAR FROM now())::int
  AND ((esfera = 'M' AND cod_ibge IS NOT NULL) OR esfera = 'E')
  AND greatest(coalesce(valor_estimado,0), coalesce(valor_homologado,0)) > ${TETO_PROC}`;

async function main() {
  const antes = (await db.query(`SELECT ano, count(*) n, round(sum(valor_homologado))::bigint v FROM compras_sc GROUP BY 1 ORDER BY 1`)).rows;

  await db.query(`ALTER TABLE compras_sc ADD COLUMN IF NOT EXISTS n_implausivel INTEGER DEFAULT 0`);
  await db.query(`CREATE SCHEMA IF NOT EXISTS app`);

  console.log(`reconstruindo compras_sc do espelho (contratacoes_sc) · teto R$ ${(TETO_PROC/1e9)} bi/processo…`);
  await db.query("BEGIN");
  try {
    await db.query("TRUNCATE compras_sc");
    await db.query(SQL);
    await db.query("DROP TABLE IF EXISTS app.compra_processo_implausivel_sc");
    await db.query(SQL_IMPL);
    await db.query(`CREATE INDEX ix_cpi_cod ON app.compra_processo_implausivel_sc (cod_ibge)`);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }

  const depois = (await db.query(`SELECT ano, count(*) n, round(sum(valor_homologado))::bigint v FROM compras_sc GROUP BY 1 ORDER BY 1`)).rows;
  const tot = (await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) ib, round(sum(valor_homologado))::bigint v, sum(n_implausivel)::int impl FROM compras_sc`)).rows[0];
  const nImpl = (await db.query(`SELECT count(*) n, round(sum(greatest(valor_estimado,valor_homologado)))::bigint v FROM app.compra_processo_implausivel_sc`)).rows[0];

  console.log(`\n✔ compras_sc reconstruída · ${tot.n} linhas · ${tot.ib} entes · R$ ${(Number(tot.v)/1e9).toFixed(1)} bi homologado (limpo)`);
  console.log(`  ${nImpl.n} processos implausíveis EXCLUÍDOS do valor (R$ ${(Number(nImpl.v)/1e9).toFixed(1)} bi bruto) — listados em app.compra_processo_implausivel_sc, intactos no espelho`);
  const mapa = {}; for (const r of antes) mapa[r.ano] = r;
  console.log("\nano   linhas(antes→depois)   homologado (antes → LIMPO)");
  for (const d of depois) {
    const a = mapa[d.ano] || { n: 0, v: 0 };
    console.log(`${d.ano}   ${String(a.n).padStart(4)} → ${String(d.n).padStart(4)}         R$ ${(Number(a.v)/1e6).toFixed(0).padStart(8)} mi → ${(Number(d.v)/1e6).toFixed(0).padStart(8)} mi`);
  }
  for (const [ib, nm] of [["4205407","Florianópolis"],["42","Estado-SC"]]) {
    const r = (await db.query(`SELECT ano, n_contratos, n_implausivel, round(valor_homologado)::bigint v, economia_pct, dispensa_pct FROM compras_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 2`, [ib])).rows;
    console.log(`\n${nm} (${ib}):`); for (const x of r) console.log(`  ${x.ano}: ${x.n_contratos} proc${x.n_implausivel?` (${x.n_implausivel} suspenso)`:''} · R$ ${(Number(x.v)/1e6).toFixed(1)} mi limpo · economia ${x.economia_pct}% · s/lic ${x.dispensa_pct}%`);
  }
  console.log("\nprocessos suspeitos (amostra):");
  for (const x of (await db.query(`SELECT cod_ibge, ano, modalidade, round(valor_homologado)::bigint v, left(objeto,48) o FROM app.compra_processo_implausivel_sc ORDER BY valor_homologado DESC LIMIT 6`)).rows)
    console.log(`  ${x.cod_ibge} ${x.ano} ${x.modalidade?.slice(0,14).padEnd(14)} R$ ${(Number(x.v)/1e6).toFixed(0).padStart(6)} mi  ${x.o}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
