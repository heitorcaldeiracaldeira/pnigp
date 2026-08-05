// TRAVA DE PROCESSO — exclusão mútua entre rodadas longas (orquestrador de coleta, cadeia da marca...).
//
// POR QUE NÃO É pg_advisory_lock. O DATABASE_URL aponta para o endpoint "-pooler" do Neon, que é pgbouncer
// em modo transação. Advisory lock é de SESSÃO, e sessão é justamente o que um pooler de transação não
// preserva. Medido aqui em 04/ago/2026, na mesma conexão: pg_try_advisory_lock devolveu true, pg_locks
// confirmou a trava no backend, e o pg_advisory_unlock seguinte devolveu FALSE — a trava ficou presa e
// outra conexão não conseguiu pegá-la depois do "unlock". Isso é exclusão não-determinística: ora deixa
// dois passarem, ora bloqueia para sempre quem tinha direito. É pior do que não ter trava, porque falha
// em silêncio e do lado errado.
//
// COMO ESTA FUNCIONA. Uma linha por trava, com BATIDA (heartbeat): quem está vivo renova a batida a cada
// minuto; quem morreu — máquina dormiu, processo levou taskkill, energia caiu — deixa a batida envelhecer e
// o próximo candidato assume passada a tolerância. Não existe órfão travando a cadeia para sempre, e dá para
// enxergar quem segura o quê com um SELECT. Depende só de UPDATE/INSERT, então atravessa qualquer pooler.
//
// USO:
//   const trava = await pegaTrava(db, "orquestrador");
//   if (!trava.ok) { log(`já rodando em ${trava.donoAtual}`); return; }   // sair com 0: não é erro
//   try { ...trabalho longo... } finally { await trava.solta(); }
import os from "os";

export async function pegaTrava(db, nome, opcoes = {}) {
  const { toleranciaMin = 5, batidaMs = 60000 } = opcoes;
  const dono = opcoes.dono || `${os.hostname()}:${process.pid}`;

  await db.query(`CREATE TABLE IF NOT EXISTS processo_trava (
    nome TEXT PRIMARY KEY,
    dono TEXT NOT NULL,
    desde TIMESTAMPTZ NOT NULL DEFAULT now(),
    batida TIMESTAMPTZ NOT NULL DEFAULT now() )`);

  // pega se não houver dono OU se a batida do dono atual já passou da tolerância (processo morto)
  const { rows } = await db.query(
    `INSERT INTO processo_trava (nome, dono, desde, batida) VALUES ($1, $2, now(), now())
     ON CONFLICT (nome) DO UPDATE SET dono = EXCLUDED.dono, desde = now(), batida = now()
      WHERE processo_trava.batida < now() - ($3 || ' minutes')::interval
     RETURNING dono`, [nome, dono, String(toleranciaMin)]);

  if (!rows.length) {
    const { rows: [q] } = await db.query(
      `SELECT dono, round(extract(epoch from now()-desde)/60) min_rodando,
              round(extract(epoch from now()-batida)) seg_ultima_batida
         FROM processo_trava WHERE nome=$1`, [nome]);
    return { ok: false, dono, donoAtual: q?.dono || "?", minRodando: Number(q?.min_rodando) || 0, segUltimaBatida: Number(q?.seg_ultima_batida) || 0, solta: async () => {} };
  }

  // batida: só renova enquanto ESTA execução for a dona (o WHERE dono=$2 impede ressuscitar trava tomada)
  const timer = setInterval(() => {
    db.query(`UPDATE processo_trava SET batida=now() WHERE nome=$1 AND dono=$2`, [nome, dono]).catch(() => {});
  }, batidaMs);
  timer.unref?.();  // a batida não pode, sozinha, segurar o processo vivo

  return {
    ok: true, dono, donoAtual: dono,
    solta: async () => {
      clearInterval(timer);
      await db.query(`DELETE FROM processo_trava WHERE nome=$1 AND dono=$2`, [nome, dono]).catch(() => {});
    },
  };
}
