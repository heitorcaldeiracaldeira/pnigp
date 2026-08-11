// CARGA FATIADA — substitui só a fatia que REALMENTE carregou, em vez de truncar a tabela inteira.
//
// ═══ O DEFEITO QUE ISTO CORRIGE ═══
// O desenho comum destas ETLs é: percorrer vários arquivos (anos, competências, tipos), pular com
// `continue` o que falhar, acumular o resto em memória, `TRUNCATE` e regravar.
// Enquanto tudo dá certo, funciona. Quando uma parte falha — e falha o tempo todo: arquivo ainda não
// publicado, FTP fora do ar, formato novo — a execução ZERA a tabela e devolve só o pedaço bom.
// Medido em 10/ago no sinan_agravos: 9 de 12 combinações falhavam, e a tabela vivia com 1 agravo de 3,
// terminando com ✔. O erro era transitório; a perda, permanente. Cada rodada apagava o que a anterior
// tinha conseguido.
//
// A REGRA: substituir na granularidade do que se carregou. Recarregou 2024? Apaga 2024 e regrava 2024.
// 2023 não veio? 2023 fica como estava, com o dado da última vez que deu certo.
//
// POR QUE NÃO É `ON CONFLICT DO UPDATE` PURO: o upsert nunca APAGA. Município que deixou de ter caso
// naquele ano ficaria na tabela para sempre, com o número velho. Apagar a fatia e regravá-la inteira
// preserva a semântica que o TRUNCATE dava de graça, sem o dano que ele causava.
//
// Tudo numa transação: ou a rodada troca o conjunto, ou não troca nada. Rodada interrompida no meio não
// deixa a tabela sem a fatia velha e sem a nova.

/**
 * @param db        cliente/pool pg
 * @param tabela    nome da tabela
 * @param fatiaCols colunas que definem a fatia recarregada (ex.: ["ano"] ou ["agravo","ano"])
 * @param fatias    fatias que DE FATO carregaram (ex.: [[2024],[2025]])
 * @param colunas   colunas do INSERT, na ordem das linhas
 * @param tipos     tipo SQL de cada coluna, para o unnest (ex.: ["text","int","numeric"])
 * @param linhas    array de arrays, na ordem de `colunas`
 * @returns nº de linhas gravadas
 */
export async function substituiFatias(db, { tabela, fatiaCols, fatias, colunas, tipos, linhas }) {
  if (!fatias || !fatias.length) {
    // Nenhuma fatia carregou: NÃO se toca na tabela. Antes, este caso apagava tudo e gravava nada —
    // o pior desfecho possível, e ainda por cima com carimbo de sucesso.
    throw new Error(`${tabela}: nenhuma fatia carregou — tabela preservada, e isto não é sucesso`);
  }
  await db.query("BEGIN");
  try {
    for (const f of fatias) {
      const cond = fatiaCols.map((c, i) => `${c} = $${i + 1}`).join(" AND ");
      await db.query(`DELETE FROM ${tabela} WHERE ${cond}`, f);
    }
    if (linhas.length) {
      const arrs = colunas.map((_, i) => linhas.map((r) => r[i]));
      const params = colunas.map((_, i) => `$${i + 1}::${tipos[i]}[]`).join(", ");
      const alias = colunas.map((_, i) => `c${i}`).join(", ");
      const sel = colunas.map((_, i) => `c${i}`).join(", ");
      await db.query(`INSERT INTO ${tabela} (${colunas.join(",")}) SELECT ${sel} FROM unnest(${params}) AS z(${alias})`, arrs);
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
  return linhas.length;
}

/**
 * Relata o desfecho com honestidade e ajusta o código de saída.
 * Carregar PARTE não é sucesso: o catálogo precisa VER, senão a fonte fica meses "ok" entregando metade.
 */
export function relata(tabela, carregadas, esperadas, extra = "") {
  const parcial = carregadas.length < esperadas.length;
  const faltam = esperadas.filter((e) => !carregadas.some((c) => String(c) === String(e)));
  console.log(`${parcial ? "⚠" : "✔"} ${tabela}: ${carregadas.length}/${esperadas.length} fatias carregadas${extra ? " · " + extra : ""}`);
  if (parcial) {
    console.log(`  NÃO carregaram (dado anterior preservado): ${faltam.join(", ")}`);
    process.exitCode = 1;
  }
  return parcial;
}
