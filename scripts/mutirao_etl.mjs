// MUTIRÃO DE RECUPERAÇÃO DAS FONTES DE ETL — em 3 ondas, na ordem de quem sustenta o produto.
//   node scripts/mutirao_etl.mjs 1      (só a onda 1)
//   node scripts/mutirao_etl.mjs 1 2 3  (as três, em sequência)
//   ONDA_TETO_MIN=240 node scripts/mutirao_etl.mjs 3
//
// ═══ POR QUE UM MUTIRÃO, E NÃO ESPERAR A JANELA ═══
// Medido em 08/ago: das 172 fontes, só 45 estão em dia. 89 têm entre 30 e 90 dias de atraso, 8 NUNCA
// rodaram, e nas últimas 24h NENHUMA rodou. As mais atrasadas são justamente as fiscais — RGF, RREO,
// SIOPS, RPPS, receitas detalhadas — paradas há 49 dias, e são elas que o Painel do Prefeito exibe como
// "situação atual". O painel está mostrando dado de 20 de junho.
// A janela noturna é de 5h com teto de 90 min por fonte: no melhor caso 3 ou 4 fontes por noite. Com 126
// atrasadas, o passivo não fecha — seriam semanas. E há um agravante: o teto CORTA a fonte antes de ela
// terminar, e o corte não conta como falha. Uma fonte que precisa de 2h é cortada toda noite, para sempre.
//
// ═══ AS TRÊS ONDAS ═══
// 1. FISCAIS — o que o painel mostra. Poucas, leves (API SICONFI), e as mais atrasadas.
// 2. COM FALHA — INEP e CNES falham desde o início de julho, todas com `tentativa 5`, ou seja, esgotaram
//    o retry. Repetir pela sexta vez não muda nada: esta onda é para MEDIR o erro, não para insistir.
// 3. O RESTO — com teto folgado, para finalmente descobrir `duracao_seg` de cada uma. Hoje ela é NULA nas
//    126 (só é gravada em sucesso), então todo dimensionamento de janela é chute — inclusive o meu.
import fs from "fs"; import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
const TETO = process.env.ONDA_TETO_MIN || "240";   // folgado de propósito: aqui o objetivo é COMPLETAR

const ONDAS = {
  1: {
    nome: "FISCAIS (o que o painel exibe)",
    sql: `label ~* '(RGF|RREO|SIOPS|RPPS|Receitas detalhadas|Metas Fiscais|DCL|ASPS|subfun|Indicadores \\(IBGE|Finanças|Acompanhamento|MSC)'
          AND NOT coalesce(desativado,false)`,
  },
  // ═══ ONDA 2 REDEFINIDA APÓS A ONDA 1 — O ALVO MUDOU ═══
  // O desenho original mirava "as 20 com falha registrada". A onda 1 resolveu a maioria delas de passagem
  // (com_falha caiu de 20 para 2), porque muitas só estavam paradas, não quebradas. Insistir no alvo
  // antigo seria rodar de novo o que já está em dia.
  // O alvo real agora são as 8 que NUNCA rodaram — nunca tiveram uma linha de dado — mais o resíduo que
  // sobrou falhando. É diagnóstico, não recuperação: se uma fonte nunca produziu nada, o problema não é
  // agendamento, e repetir não descobre nada. O que interessa aqui é a MENSAGEM de erro de cada uma.
  2: {
    nome: "NUNCA RODARAM + o que sobrou falhando (diagnóstico)",
    sql: `(ultima_exec IS NULL OR falhas_seguidas > 0 OR ultimo_status NOT IN ('ok'))
          AND NOT coalesce(desativado,false)`,
  },
  3: {
    nome: "O RESTO das atrasadas (e medir duracao_seg de cada uma)",
    sql: `(ultima_exec IS NULL OR ultima_exec < now() - interval '7 days') AND NOT coalesce(desativado,false)`,
  },
};

const roda = (env) => new Promise((res) => {
  const p = spawn(process.execPath, [path.join(__dirname, "etl_orquestrador.mjs")],
    { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" });
  p.on("exit", (c) => res(c ?? -1)); p.on("error", () => res(-1));
});

const alvos = (process.argv.slice(2).length ? process.argv.slice(2) : ["1"]).map(Number);
for (const n of alvos) {
  const onda = ONDAS[n];
  if (!onda) { console.log(`onda ${n} não existe`); continue; }
  // marca o pedido manual: `solicitado` ignora o recuo por falhas, que é o que trava a onda 2
  const r = await db.query(`UPDATE etl_catalogo SET solicitado=true WHERE ${onda.sql}`);
  const antes = (await db.query(`SELECT count(*) FILTER (WHERE ultima_exec > now()-interval '1 hour') n FROM etl_catalogo`)).rows[0].n;
  console.log(`\n${"═".repeat(78)}\nONDA ${n} — ${onda.nome}\n  ${r.rowCount} fontes marcadas · teto ${TETO} min/fonte · SEM_JANELA\n${"═".repeat(78)}`);

  // SEM_JANELA=1 porque o mutirão é deliberado e fora do horário da ETL noturna; o teto por fonte segue
  // valendo (e folgado), então nenhuma fonte pendura o mutirão inteiro.
  const code = await roda({ MODO: "solicitados", TETO_FONTE_MIN: TETO, SEM_JANELA: "1" });

  const dep = (await db.query(`SELECT
      count(*) FILTER (WHERE ultima_exec > now()-interval '6 hours') ok,
      count(*) FILTER (WHERE ultimo_status='cortado') cortadas,
      count(*) FILTER (WHERE falhas_seguidas > 0) falhando FROM etl_catalogo`)).rows[0];
  console.log(`\n── ONDA ${n} encerrada (código ${code}) · ${dep.ok} fontes com sucesso recente · ${dep.cortadas} cortadas · ${dep.falhando} ainda falhando`);
}

const fim = (await db.query(`SELECT
    count(*) total,
    count(*) FILTER (WHERE ultima_exec > now()-interval '7 days') em_dia,
    count(*) FILTER (WHERE ultima_exec IS NULL AND NOT coalesce(desativado,false)) nunca,
    count(*) FILTER (WHERE falhas_seguidas > 0) com_falha,
    count(*) FILTER (WHERE duracao_seg IS NOT NULL) com_duracao_medida FROM etl_catalogo`)).rows[0];
console.log(`\n═══ PLACAR FINAL ═══`);
console.table([fim]);
await db.end();
