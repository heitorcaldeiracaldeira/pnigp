// AVALIA os classificadores de item contra `app.gabarito_item` — o ponto de operação, medido.
//   node scripts/avalia_contra_gabarito.mjs
//
// Substitui o `eval_operating_point.mjs`, que não roda mais: ele lia o gabarito de um `.tsv` num scratchpad
// de sessão apagado ([[pnigp-gabarito-item-no-banco]]). Aqui tudo vem do banco.
//
// ═══ AS TRÊS PERGUNTAS, E POR QUE SÃO TRÊS ═══
//   1. ACERTO NOS ACEITOS  — dos que o motor aceitou, quantos batem com o gabarito? É a PRECISÃO no ponto
//      de operação, o número que decide se dá para confiar no rótulo exibido.
//   2. COBERTURA           — dos que TÊM alvo verdadeiro, quantos o motor aceitou? Mede o que se perde por
//      abstenção. Precisão alta com cobertura baixa é um motor tímido, não um motor bom.
//   3. FALSO ACEITE        — dos que o gabarito diz "nenhum candidato serve", quantos o motor aceitou
//      assim mesmo? É o único que mede o dano de CHUTAR, e é o que o critério frouxo infla
//      ([[pnigp-criterio-frouxo-erra-sempre-para-cima]]). Sem ele, "acerto" sobe cortando abstenção.
//
// ⚠️ COMPARAÇÃO POR NOME, não por código: o catálogo tem códigos distintos para o mesmo nome, e o motor
// canoniza duplicados. Comparar por código contaria duplicata como erro.
//
// ⚠️ TETO HERDADO DO GABARITO: o rótulo saiu de uma lista de 35 candidatos montada pelo MESMO trigrama.
// Então isto mede se o TOP-1 acerta dado que a resposta provavelmente está no top-35 — é medida do
// RANKEAMENTO, não do recall absoluto. Um "nenhum" do gabarito pode ser ausência de candidato.
import fs from "fs"; import pg from "pg";
import { registraEComparaPontoOperacao } from "./gate_ponto_operacao.mjs";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

const MEDICOES = [];
const MOTORES = [
  { tipo: "M", rotulo: "CATMAT", mapa: "item_catmat_map", nome: "nome_pdm" },
  { tipo: "S", rotulo: "CATSER", mapa: "item_catser_map", nome: "nome_servico" },
];

const norm = `lower(regexp_replace(trim($NOME$), '\\s+', ' ', 'g'))`;

for (const m of MOTORES) {
  const g = norm.replace("$NOME$", "g.rotulo_nome");
  const p = norm.replace("$NOME$", `p.${m.nome}`);
  console.log(`\n═══════════ ${m.rotulo} ═══════════`);

  const geral = (await db.query(`
    SELECT
      count(*) FILTER (WHERE g.rotulo_codigo > 0)::int com_alvo,
      count(*) FILTER (WHERE g.rotulo_codigo = 0)::int gabarito_nenhum,
      count(*) FILTER (WHERE p.aceito)::int aceitos,
      count(*) FILTER (WHERE p.aceito AND g.rotulo_codigo > 0 AND ${p} = ${g})::int acertos_aceitos,
      count(*) FILTER (WHERE p.aceito AND g.rotulo_codigo = 0)::int falso_aceite,
      count(*) FILTER (WHERE g.rotulo_codigo > 0 AND p.aceito)::int cobertos,
      count(*) FILTER (WHERE g.rotulo_codigo > 0 AND ${p} = ${g})::int acertos_todos
    FROM app.gabarito_item g JOIN ${m.mapa} p ON p.chave = g.chave
    WHERE g.tipo = $1 AND g.rotulo_codigo IS NOT NULL`, [m.tipo])).rows[0];

  const pct = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(1)}%` : "—");
  const num = (a, b) => (b > 0 ? Number((100 * a / b).toFixed(1)) : null);
  MEDICOES.push({ motor: m.rotulo, com_alvo: geral.com_alvo, aceitos: geral.aceitos,
    acerto_aceitos: num(geral.acertos_aceitos, geral.aceitos - geral.falso_aceite),
    cobertura: num(geral.cobertos, geral.com_alvo),
    falso_aceite: num(geral.falso_aceite, geral.gabarito_nenhum) });
  console.log(`gabarito: ${geral.com_alvo} com alvo · ${geral.gabarito_nenhum} "nenhum"`);
  console.log(`1. ACERTO NOS ACEITOS ... ${pct(geral.acertos_aceitos, geral.aceitos - geral.falso_aceite)}  (${geral.acertos_aceitos}/${geral.aceitos - geral.falso_aceite})`);
  console.log(`2. COBERTURA ........... ${pct(geral.cobertos, geral.com_alvo)}  (${geral.cobertos}/${geral.com_alvo} dos que têm alvo)`);
  console.log(`3. FALSO ACEITE ........ ${pct(geral.falso_aceite, geral.gabarito_nenhum)}  (${geral.falso_aceite}/${geral.gabarito_nenhum} que o gabarito diz não ter alvo)`);
  console.log(`   acerto sobre TODOS os que têm alvo (ignorando abstenção): ${pct(geral.acertos_todos, geral.com_alvo)}`);

  console.log("\n   por banda de frequência:");
  const bandas = (await db.query(`
    SELECT g.banda,
      count(*) FILTER (WHERE g.rotulo_codigo > 0)::int com_alvo,
      count(*) FILTER (WHERE g.rotulo_codigo > 0 AND ${p} = ${g})::int acertos,
      count(*) FILTER (WHERE p.aceito AND g.rotulo_codigo = 0)::int falso_aceite
    FROM app.gabarito_item g JOIN ${m.mapa} p ON p.chave = g.chave
    WHERE g.tipo = $1 AND g.rotulo_codigo IS NOT NULL GROUP BY 1 ORDER BY 1`, [m.tipo])).rows;
  bandas.forEach((b) => console.log(`     ${b.banda.padEnd(10)} ${String(b.acertos).padStart(3)}/${String(b.com_alvo).padEnd(3)} = ${pct(b.acertos, b.com_alvo).padStart(6)}  · falso aceite ${b.falso_aceite}`));
}

// ═══ VARREDURA DE LIMIAR — precisão × cobertura × falso aceite por MIN_SIM ═══
// `MIN_SIM=0,5` veio do CATMAT e nunca foi calibrado para serviço. Aqui a curva mostra o que se ganha e o
// que se paga em cada corte. Regra do projeto: só mexer no limiar com a curva na mão, e escolher pelo
// FALSO ACEITE — é ele que o critério frouxo infla, e é o único erro que o usuário vê como mentira.
for (const m of MOTORES) {
  const g = norm.replace("$NOME$", "g.rotulo_nome");
  const p = norm.replace("$NOME$", `p.${m.nome}`);
  console.log(`\n─── ${m.rotulo}: curva por limiar de sim ───`);
  console.log("  limiar  aceitos  acerto(aceitos)  cobertura  falso_aceite");
  for (const lim of [0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70]) {
    const r = (await db.query(`
      SELECT
        count(*) FILTER (WHERE p.sim >= $2 AND g.rotulo_codigo > 0)::int aceitos_com_alvo,
        count(*) FILTER (WHERE p.sim >= $2 AND g.rotulo_codigo > 0 AND ${p} = ${g})::int acertos,
        count(*) FILTER (WHERE g.rotulo_codigo > 0)::int com_alvo,
        count(*) FILTER (WHERE p.sim >= $2 AND g.rotulo_codigo = 0)::int falso,
        count(*) FILTER (WHERE g.rotulo_codigo = 0)::int nenhum
      FROM app.gabarito_item g JOIN ${m.mapa} p ON p.chave = g.chave
      WHERE g.tipo = $1 AND g.rotulo_codigo IS NOT NULL`, [m.tipo, lim])).rows[0];
    const pc = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(1)}%`.padStart(6) : "     —");
    console.log(`   ${lim.toFixed(2)}   ${String(r.aceitos_com_alvo).padStart(5)}   ${pc(r.acertos, r.aceitos_com_alvo)}          ${pc(r.aceitos_com_alvo, r.com_alvo)}     ${pc(r.falso, r.nenhum)} (${r.falso}/${r.nenhum})`);
  }
}

console.log("\n⚠ Medida de RANKEAMENTO, não de recall absoluto: o gabarito escolheu entre 35 candidatos do");
console.log("  mesmo trigrama. E um 'nenhum' do gabarito pode ser ausência de candidato — ver app.gabarito_item.candidatos.");
console.log("");
console.log("=== portao de regressao ===");
const ok = await registraEComparaPontoOperacao(db, MEDICOES);
await db.end();
// Sai 1 quando regride: a cadeia marca FALHA, e falha de cadeia e o unico alarme que chega aqui.
if (!ok) process.exit(1);

