// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _folha_uniao.mjs — a união das tabelas de folha de UMA UF, descoberta no catálogo do banco.
//
// POR QUE saiu de dentro do relatório: a view `vw_folha_es` era criada pelo relatorio_folha_uf.mjs e LIDA pelo
// verifica_publicacao_folha_uf.mjs. Um acoplamento invisível e com nome mentiroso — a view chamada "es" guarda a
// UF da última execução, então rodar o relatório do AM e depois a verificação do ES reconciliava o ES contra as
// linhas do AM (e reclassificou zero município, em silêncio). Fonte de união é uma só, e leva a UF no nome.
//
// A lista de tabelas NUNCA é escrita à mão: coletor novo entra sem ninguém lembrar de atualizar o relatório
// ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Cria (ou recria) a view da UF e devolve o nome dela. `q` é o withRetry(pool), `cod` é o prefixo IBGE ('13'/'32').
export async function criaUniaoFolha(q, cod, uf) {
  const nome = `vw_folha_${String(uf).toLowerCase()}`;
  // 🚨 `string_agg` SEM `order by` é não determinístico: a lista de colunas numéricas saía numa ordem numa
  // execução e noutra na seguinte, e a escolha da coluna de valor mudava junto. Em Conceição da Barra o
  // smarapd tem `salario_base` 100% NULO e `total_vencimentos` preenchido — dependendo do sorteio, o município
  // valia R$ 0 ou a folha inteira, e o total do ES oscilava entre R$ 682,8 mi e R$ 685,5 mi sem ninguém tocar
  // no dado. Ordem fixa por ordinal_position + escada de preferência explícita.
  const tabs = (await q(`select table_name t, string_agg(column_name, ',' order by ordinal_position) cols,
      string_agg(column_name, ',' order by ordinal_position) filter (where data_type in ('numeric','integer','bigint','double precision','real')) num
    from information_schema.columns where table_schema='public' and table_name like 'folha_servidores_%'
    group by 1 order by 1`)).rows;

  const partes = [];
  for (const t of tabs) {
    const cols = t.cols.split(",");
    if (!cols.includes("cod_ibge")) continue;
    const num = (t.num || "").split(",").filter(Boolean);
    const acha = (lista, re) => lista.find((c) => re.test(c));
    // 🚨 líquido e desconto NUNCA podem virar "folha bruta", e `salario_base` só vale se não houver total —
    // base é o vencimento do cargo, não o que a pessoa recebeu ([[pnigp-folha-municipal-cinco-campos]]).
    const bruto = num.filter((c) => !/liquido|desconto|base_calculo|inss|irrf|patronal|previd/i.test(c));
    const val = acha(bruto, /^(bruto|valor_bruto|total_bruto|remuneracao_bruta|remuneracao|provento|proventos|salario_bruto|total_vencimentos|total_proventos|total_remuneracao)$/)
             || acha(bruto, /(total|valor).*(vencimento|provento|bruto|remunera)/)
             || acha(bruto, /bruto|provento|remunera|rendimento/)
             || acha(bruto, /vencimento/)
             || acha(bruto, /salario/)
             || acha(bruto, /^valor$/)
             || acha(num, /^valor$/);
    const sec = acha(cols, /^(secretaria|lotacao|orgao|setor)$/) || acha(cols, /secretaria|lotacao|organograma|orgao|unidade|setor/);
    const car = acha(cols, /^(cargo|nome_cargo|descricao_cargo)$/) || acha(cols, /cargo|funcao/);
    const comp = acha(cols, /^(competencia|anomes|referencia|mes_referencia)$/);
    const nomeCol = acha(cols, /^nome$/);
    if (!val) continue;
    partes.push(`select '${t.t.replace("folha_servidores_", "")}'::text fonte, cod_ibge::text,
      ${comp ? `nullif(btrim(${comp}::text),'')` : "null::text"} competencia,
      ${nomeCol ? "nullif(btrim(nome),'')" : "null::text"} nome,
      ${car ? `nullif(btrim(${car}::text),'')` : "null::text"} cargo,
      ${sec ? `nullif(btrim(${sec}::text),'')` : "null::text"} secretaria,
      (${val})::numeric valor
     from ${t.t} where left(cod_ibge::text,2) = '${cod}'`);
  }
  await q(`drop view if exists ${nome} cascade`);
  await q(`create view ${nome} as ${partes.join("\nunion all\n")}`);
  return { nome, fontes: partes.length };
}
