// FONTE ÚNICA da SQL das derivadas de compras (Lei 1, andar 2). Um lugar só — os builders full e a re-derivação
// por fatia (rederiva_fatia.mjs) chamam daqui, para nunca divergirem.
//
// Cada função recebe `cx` (um client pg com .query — use um client dedicado p/ transação) e `entes`:
//   entes = null       → FULL: reconstrói a derivada inteira (TRUNCATE/DROP + rebuild).
//   entes = [cod,…]     → FATIA: DELETE só desses cod_ibge + INSERT só deles (evento→re-deriva a fatia).
// A SQL é IDÊNTICA nos dois modos; muda só o recorte (WHERE … = ANY($1)).

export const TETO_PROC = 1e9; // R$ 1 bi/processo — outlier de compras_sc (ex.: 1 Dispensa de R$ 50 bi = typo)
export const TETO_ITEM = 1e8; // R$ 100 mi/item    — outlier de andamento_compras_sc

// NACIONAL-READY: o Estado (esfera E) some sob o código IBGE de 2 dígitos da SUA UF — generaliza o antigo '42' fixo
// (SC) para o Brasil todo. Fallback: left(cod_ibge,2) (o prefixo do município já é o código da UF). SC segue → '42'.
const COD_ESTADO_SQL = `(CASE uf`
  + ` WHEN 'RO' THEN '11' WHEN 'AC' THEN '12' WHEN 'AM' THEN '13' WHEN 'RR' THEN '14' WHEN 'PA' THEN '15' WHEN 'AP' THEN '16' WHEN 'TO' THEN '17'`
  + ` WHEN 'MA' THEN '21' WHEN 'PI' THEN '22' WHEN 'CE' THEN '23' WHEN 'RN' THEN '24' WHEN 'PB' THEN '25' WHEN 'PE' THEN '26' WHEN 'AL' THEN '27' WHEN 'SE' THEN '28' WHEN 'BA' THEN '29'`
  + ` WHEN 'MG' THEN '31' WHEN 'ES' THEN '32' WHEN 'RJ' THEN '33' WHEN 'SP' THEN '35'`
  + ` WHEN 'PR' THEN '41' WHEN 'SC' THEN '42' WHEN 'RS' THEN '43'`
  + ` WHEN 'MS' THEN '50' WHEN 'MT' THEN '51' WHEN 'GO' THEN '52' WHEN 'DF' THEN '53' END)`;
const IBGE = `CASE WHEN esfera = 'E' THEN coalesce(${COD_ESTADO_SQL}, left(cod_ibge, 2)) ELSE cod_ibge END`;

// ───────────────────────── compras_sc (agregado por ente×ano) ─────────────────────────
function sqlCompras(enteFiltro) {
  return `
WITH proc AS (
  SELECT
    ${IBGE} AS ibge,
    ano, modalidade,
    coalesce(valor_estimado, 0)   AS est,
    coalesce(valor_homologado, 0) AS hom,
    (greatest(coalesce(valor_estimado,0), coalesce(valor_homologado,0)) > ${TETO_PROC}) AS impl,
    (modalidade_id IN (4,5,6,7) AND coalesce(valor_estimado,0) > 0 AND coalesce(valor_homologado,0) > 0) AS cmp,
    (modalidade_id IN (8,9)) AS sem_lic,
    objeto, orgao_razao_social AS orgao, cnpj, seq, data_publicacao
  FROM contratacoes_sc
  WHERE modalidade_id NOT IN (10,11)
    AND ano BETWEEN 2020 AND EXTRACT(YEAR FROM now())::int
    AND ((esfera = 'M' AND cod_ibge IS NOT NULL) OR esfera = 'E')
    AND (${IBGE}) IS NOT NULL   -- nacional-safe: descarta o que não tem UF nem município (inatribuível)
    ${enteFiltro}
),
agg AS (
  SELECT ibge, ano,
    count(*)::int AS n_contratos,
    count(*) FILTER (WHERE impl)::int AS n_implausivel,
    round(coalesce(sum(est) FILTER (WHERE cmp AND NOT impl), 0)::numeric, 2) AS valor_estimado,
    round(coalesce(sum(hom) FILTER (WHERE NOT impl), 0)::numeric, 2) AS valor_homologado,
    CASE WHEN sum(est) FILTER (WHERE cmp AND NOT impl) > 0
      THEN round((( sum(est) FILTER (WHERE cmp AND NOT impl) - sum(hom) FILTER (WHERE cmp AND NOT impl) )
                  / sum(est) FILTER (WHERE cmp AND NOT impl) * 100)::numeric, 2) ELSE 0 END AS economia_pct,
    CASE WHEN sum(hom) FILTER (WHERE NOT impl) > 0
      THEN round((sum(hom) FILTER (WHERE sem_lic AND NOT impl) / sum(hom) FILTER (WHERE NOT impl) * 100)::numeric, 2)
      ELSE 0 END AS dispensa_pct
  FROM proc GROUP BY ibge, ano
),
pm AS (
  SELECT ibge, ano,
    jsonb_agg(jsonb_build_object('modalidade', modalidade, 'n', n, 'valor', valor) ORDER BY valor DESC, modalidade) AS por_modalidade
  FROM (SELECT ibge, ano, modalidade, count(*)::int AS n, round(coalesce(sum(hom) FILTER (WHERE NOT impl),0)::numeric,2) AS valor
        FROM proc GROUP BY ibge, ano, modalidade) s GROUP BY ibge, ano
),
tp AS (
  -- desempate CRAVADO (seq, cnpj) → o top-15 é determinístico: fatia e full dão o MESMO resultado
  SELECT ibge, ano, jsonb_agg(j ORDER BY rn) AS top
  FROM (
    SELECT ibge, ano,
      jsonb_build_object('objeto', left(objeto,240), 'modalidade', modalidade, 'orgao', orgao,
        'estimado', round(est::numeric,2), 'homologado', round(hom::numeric,2),
        'economia_pct', CASE WHEN est>0 AND hom>0 THEN round(((est-hom)/est*100)::numeric,2) ELSE NULL END,
        'data', left(data_publicacao,10), 'cnpj', cnpj, 'ano', ano, 'seq', seq) AS j,
      row_number() OVER (PARTITION BY ibge, ano ORDER BY hom DESC, seq NULLS LAST, cnpj NULLS LAST) AS rn
    FROM proc WHERE NOT impl
  ) s WHERE rn <= 15 GROUP BY ibge, ano
)
INSERT INTO compras_sc (cod_ibge, ano, n_contratos, n_implausivel, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade, top)
SELECT a.ibge, a.ano, a.n_contratos, a.n_implausivel, a.valor_estimado, a.valor_homologado, a.economia_pct, a.dispensa_pct,
  coalesce(pm.por_modalidade,'[]'::jsonb), coalesce(tp.top,'[]'::jsonb)
FROM agg a LEFT JOIN pm ON pm.ibge=a.ibge AND pm.ano=a.ano LEFT JOIN tp ON tp.ibge=a.ibge AND tp.ano=a.ano`;
}
function sqlComprasImpl(enteFiltro) {
  return `
SELECT ${IBGE} AS cod_ibge,
  ano, modalidade, numero_controle, left(objeto,160) AS objeto, orgao_razao_social AS orgao,
  round(coalesce(valor_estimado,0)::numeric,2) AS valor_estimado, round(coalesce(valor_homologado,0)::numeric,2) AS valor_homologado
FROM contratacoes_sc
WHERE modalidade_id NOT IN (10,11)
  AND ano BETWEEN 2020 AND EXTRACT(YEAR FROM now())::int
  AND ((esfera='M' AND cod_ibge IS NOT NULL) OR esfera='E')
  AND (${IBGE}) IS NOT NULL
  AND greatest(coalesce(valor_estimado,0), coalesce(valor_homologado,0)) > ${TETO_PROC}
  ${enteFiltro}`;
}

export async function deriveCompras(cx, entes = null) {
  await cx.query(`CREATE SCHEMA IF NOT EXISTS app`);
  await cx.query(`ALTER TABLE compras_sc ADD COLUMN IF NOT EXISTS n_implausivel INTEGER DEFAULT 0`);
  if (entes) {
    // FATIA — recorta pelo ibge já remapeado (estado→'42'); entes municipais casam com esfera='M'.
    const f = `AND (${IBGE}) = ANY($1)`;
    await cx.query(`DELETE FROM compras_sc WHERE cod_ibge = ANY($1)`, [entes]);
    await cx.query(sqlCompras(f), [entes]);
    await cx.query(`CREATE TABLE IF NOT EXISTS app.compra_processo_implausivel_sc
      (cod_ibge text, ano int, modalidade text, numero_controle text, objeto text, orgao text, valor_estimado numeric, valor_homologado numeric)`);
    await cx.query(`DELETE FROM app.compra_processo_implausivel_sc WHERE cod_ibge = ANY($1)`, [entes]);
    await cx.query(`INSERT INTO app.compra_processo_implausivel_sc ${sqlComprasImpl(f)}`, [entes]);
  } else {
    // FULL — reconstrói tudo.
    await cx.query(`TRUNCATE compras_sc`);
    await cx.query(sqlCompras(""));
    await cx.query(`DROP TABLE IF EXISTS app.compra_processo_implausivel_sc`);
    await cx.query(`CREATE TABLE app.compra_processo_implausivel_sc AS ${sqlComprasImpl("")}`);
    await cx.query(`CREATE INDEX ix_cpi_cod ON app.compra_processo_implausivel_sc (cod_ibge)`);
  }
}

// ───────────────────────── andamento_compras_sc (item × modalidade × status) ─────────────────────────
function sqlAndamento(enteFiltro) {
  return `
WITH base AS (
  SELECT i.cod_ibge, c.modalidade,
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
    (greatest(coalesce(i.unit_estimado, 0), coalesce(i.unit_homologado, 0)) * coalesce(i.quantidade, 0)) AS valor_max
  FROM itens_sc i
  JOIN contratacoes_sc c ON c.cnpj = i.cnpj AND c.ano = i.ano AND c.seq = i.seq
  WHERE i.cod_ibge IS NOT NULL AND c.modalidade IS NOT NULL ${enteFiltro}
)
SELECT cod_ibge, modalidade, status,
  count(*)::int AS n_itens,
  count(*) FILTER (WHERE valor_max > ${TETO_ITEM})::int AS n_implausivel,
  round(sum(valor_item) FILTER (WHERE valor_item <= ${TETO_ITEM})::numeric, 2) AS valor
FROM base GROUP BY 1, 2, 3`;
}
function sqlAndamentoImpl(enteFiltro) {
  return `
SELECT i.cod_ibge, c.modalidade, c.numero_controle, i.numero,
  left(i.descricao, 120) AS descricao, i.quantidade, i.unit_estimado, i.unit_homologado, i.situacao,
  round((greatest(coalesce(i.unit_estimado,0), coalesce(i.unit_homologado,0)) * coalesce(i.quantidade,0))::numeric, 2) AS valor
FROM itens_sc i
JOIN contratacoes_sc c ON c.cnpj = i.cnpj AND c.ano = i.ano AND c.seq = i.seq
WHERE i.cod_ibge IS NOT NULL AND c.modalidade IS NOT NULL
  AND greatest(coalesce(i.unit_estimado,0), coalesce(i.unit_homologado,0)) * coalesce(i.quantidade,0) > ${TETO_ITEM}
  ${enteFiltro}`;
}

export async function deriveAndamento(cx, entes = null) {
  await cx.query(`CREATE SCHEMA IF NOT EXISTS app`);
  if (entes) {
    const f = `AND i.cod_ibge = ANY($1)`;
    await cx.query(`CREATE TABLE IF NOT EXISTS app.andamento_compras_sc
      (cod_ibge text, modalidade text, status text, n_itens int, n_implausivel int, valor numeric)`);
    await cx.query(`DELETE FROM app.andamento_compras_sc WHERE cod_ibge = ANY($1)`, [entes]);
    await cx.query(`INSERT INTO app.andamento_compras_sc ${sqlAndamento(f)}`, [entes]);
    await cx.query(`CREATE TABLE IF NOT EXISTS app.compra_valor_implausivel_sc
      (cod_ibge text, modalidade text, numero_controle text, numero int, descricao text, quantidade numeric, unit_estimado numeric, unit_homologado numeric, situacao text, valor numeric)`);
    await cx.query(`DELETE FROM app.compra_valor_implausivel_sc WHERE cod_ibge = ANY($1)`, [entes]);
    await cx.query(`INSERT INTO app.compra_valor_implausivel_sc ${sqlAndamentoImpl(f)}`, [entes]);
  } else {
    await cx.query(`DROP TABLE IF EXISTS app.andamento_compras_sc`);
    await cx.query(`CREATE TABLE app.andamento_compras_sc AS ${sqlAndamento("")}`);
    await cx.query(`CREATE INDEX ix_andc_cod ON app.andamento_compras_sc (cod_ibge)`);
    await cx.query(`DROP TABLE IF EXISTS app.compra_valor_implausivel_sc`);
    await cx.query(`CREATE TABLE app.compra_valor_implausivel_sc AS ${sqlAndamentoImpl("")}`);
    await cx.query(`CREATE INDEX ix_cvi_cod ON app.compra_valor_implausivel_sc (cod_ibge)`);
  }
}
