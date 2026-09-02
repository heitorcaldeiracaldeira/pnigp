// PORTÃO DE REGRESSÃO do ponto de operação da classificação de item.
// Importado por avalia_contra_gabarito.mjs; grava a medição de cada rodada e COMPARA com a anterior.
//
// ═══ POR QUE UM PORTÃO, E NÃO SÓ UM RELATÓRIO ═══
// Um verificador que imprime num log e sai com 0 não é verificador: é decoração. O projeto já pagou por
// isso — [[pnigp-alerta-existe-mas-nao-chega]] (18 alertas escritos que ninguém recebeu) e o motor do
// CATMAT parado 51 dias sem que nenhum número piorasse visivelmente, porque ninguém comparava com nada.
// Aqui a medição vira LINHA HISTÓRICA e a rodada FALHA quando o ponto de operação cai além da tolerância.
// Falha da cadeia é o único alarme que este projeto entrega de forma confiável hoje.
//
// ⚠️ A tolerância existe porque o gabarito é pequeno (216 rótulos): 1 item vale ~1 ponto percentual, então
// exigir zero queda transformaria ruído amostral em falha diária, e alarme que grita à toa é desligado —
// que foi exatamente como a extração de texto morreu.
export const TOLERANCIA_PP = Number(process.env.TOLERANCIA_PP || 5);

export async function registraEComparaPontoOperacao(db, medicoes) {
  await db.query(`CREATE TABLE IF NOT EXISTS app.classificacao_ponto_operacao (
    medido_em TIMESTAMPTZ DEFAULT now(),
    motor TEXT,
    com_alvo INT, aceitos INT,
    acerto_aceitos NUMERIC, cobertura NUMERIC, falso_aceite NUMERIC,
    PRIMARY KEY (medido_em, motor))`);

  let regressao = null;
  for (const m of medicoes) {
    const ant = (await db.query(`SELECT acerto_aceitos, cobertura, falso_aceite, medido_em
      FROM app.classificacao_ponto_operacao WHERE motor = $1 ORDER BY medido_em DESC LIMIT 1`, [m.motor])).rows[0];

    await db.query(`INSERT INTO app.classificacao_ponto_operacao
      (motor, com_alvo, aceitos, acerto_aceitos, cobertura, falso_aceite) VALUES ($1,$2,$3,$4,$5,$6)`,
      [m.motor, m.com_alvo, m.aceitos, m.acerto_aceitos, m.cobertura, m.falso_aceite]);

    if (!ant) { console.log(`  [portão] ${m.motor}: primeira medição, nada a comparar`); continue; }
    const d = (a, b) => Number(b) - Number(a);
    const dAcerto = d(ant.acerto_aceitos, m.acerto_aceitos);
    const dCobertura = d(ant.cobertura, m.cobertura);
    const dFalso = d(ant.falso_aceite, m.falso_aceite);
    const quando = new Date(ant.medido_em).toISOString().slice(0, 16).replace("T", " ");
    console.log(`  [portão] ${m.motor} vs ${quando}: acerto ${dAcerto >= 0 ? "+" : ""}${dAcerto.toFixed(1)}pp · ` +
      `cobertura ${dCobertura >= 0 ? "+" : ""}${dCobertura.toFixed(1)}pp · falso aceite ${dFalso >= 0 ? "+" : ""}${dFalso.toFixed(1)}pp`);
    // Falso aceite SUBIR é regressão, ao contrário dos outros dois: é o erro que o usuário vê como mentira.
    if (dAcerto < -TOLERANCIA_PP || dCobertura < -TOLERANCIA_PP || dFalso > TOLERANCIA_PP)
      regressao = `${m.motor}: acerto ${dAcerto.toFixed(1)}pp · cobertura ${dCobertura.toFixed(1)}pp · falso aceite ${dFalso.toFixed(1)}pp (tolerância ${TOLERANCIA_PP}pp)`;
  }

  if (regressao) {
    console.error(`\n🚨 REGRESSÃO NO PONTO DE OPERAÇÃO — ${regressao}`);
    console.error(`   histórico em app.classificacao_ponto_operacao. A cadeia falha de propósito: é o alarme.`);
    return false;
  }
  console.log(`\n✔ portão: sem regressão acima de ${TOLERANCIA_PP}pp`);
  return true;
}
