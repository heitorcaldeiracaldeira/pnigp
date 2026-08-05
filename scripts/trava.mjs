// TRAVA PELA LINHA DE COMANDO — para as cadeias que são arquivos .cmd, e não um processo node só.
//
// POR QUE existe: `trava_processo.mjs` serve a quem roda a cadeia inteira dentro de UM processo node (o
// orquestrador, o pipeline da marca), que mantém a batida viva enquanto trabalha. Uma cadeia .cmd é outra
// coisa: são N processos node em sequência, e entre um e outro não há ninguém para bater. Daí este utilitário:
// o .cmd PEGA a trava antes do primeiro passo, BATE a cada passo (a batida é de graça: um UPDATE), e SOLTA no
// fim — inclusive no caminho de falha.
//
//   node scripts/trava.mjs pega  <nome> <dono> [toleranciaMin]   -> sai 0 se pegou, 1 se ja tem dono vivo
//   node scripts/trava.mjs bate  <nome> <dono>                   -> renova a batida (sai 0 sempre)
//   node scripts/trava.mjs solta <nome> <dono>                   -> devolve a trava (sai 0 sempre)
//
// O DONO é passado pelo .cmd e precisa ser o MESMO nas três chamadas de uma execução — use %RANDOM% para que
// duas execuções da mesma cadeia nunca compartilhem dono e uma não solte a trava da outra. Quem chega depois
// nem chega a soltar, porque o `pega` já o barrou.
//
// A TOLERÂNCIA precisa ser maior que o passo mais longo da cadeia, nunca que a cadeia inteira: como se bate a
// cada passo, o que importa é o intervalo entre duas batidas. No TCE o passo mais lento tem statement_timeout
// de 1790s (~30 min), então 45 min de tolerância cobre com folga e ainda libera rápido se a máquina cair.
import fs from "fs"; import pg from "pg";
import { carimboBR } from "./hora_br.mjs";

const [, , acao, nome, dono, tolArg] = process.argv;
if (!acao || !nome || !dono) {
  console.error("uso: node scripts/trava.mjs pega|bate|solta <nome> <dono> [toleranciaMin]");
  process.exit(2);
}
const TOL = Number(tolArg) || 45;
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 1, query_timeout: 30000 });

await db.query(`CREATE TABLE IF NOT EXISTS processo_trava (
  nome TEXT PRIMARY KEY, dono TEXT NOT NULL,
  desde TIMESTAMPTZ NOT NULL DEFAULT now(), batida TIMESTAMPTZ NOT NULL DEFAULT now() )`);

let saida = 0;
if (acao === "pega") {
  const { rows } = await db.query(
    `INSERT INTO processo_trava (nome, dono, desde, batida) VALUES ($1, $2, now(), now())
     ON CONFLICT (nome) DO UPDATE SET dono = EXCLUDED.dono, desde = now(), batida = now()
      WHERE processo_trava.batida < now() - ($3 || ' minutes')::interval
     RETURNING dono`, [nome, dono, String(TOL)]);
  if (rows.length) {
    console.log(`[trava ${carimboBR()}] peguei "${nome}" como ${dono} (tolerancia ${TOL} min)`);
  } else {
    const { rows: [q] } = await db.query(
      `SELECT dono, round(extract(epoch from now()-desde)/60) min FROM processo_trava WHERE nome=$1`, [nome]);
    console.log(`[trava ${carimboBR()}] "${nome}" ja esta com ${q?.dono} ha ${q?.min} min — nao vou sobrepor`);
    saida = 1;
  }
} else if (acao === "bate") {
  await db.query(`UPDATE processo_trava SET batida=now() WHERE nome=$1 AND dono=$2`, [nome, dono]);
} else if (acao === "solta") {
  const { rowCount } = await db.query(`DELETE FROM processo_trava WHERE nome=$1 AND dono=$2`, [nome, dono]);
  console.log(`[trava ${carimboBR()}] soltei "${nome}"${rowCount ? "" : " (ja nao era minha)"}`);
} else {
  console.error(`acao desconhecida: ${acao}`);
  saida = 2;
}
await db.end();
process.exit(saida);
