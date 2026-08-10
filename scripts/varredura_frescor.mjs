// Varredura de FRESCOR + SÉRIE HISTÓRICA — consulta as PRÓPRIAS tabelas (não o max_ano do catálogo, que engana):
// para cada tabela com coluna de ano/competência, calcula a série (min–max), a profundidade (nº de anos distintos)
// e a última competência real; cruza com o status de coleta do etl_catalogo. Diretriz do usuário: ter a série
// histórica e sempre a última atualização; dado com >4 anos deve ser renovado. Read-only.
// node scripts/varredura_frescor.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// ⚠️ ERA `const ANO_HOJE = 2026` — CRAVADO.
// O guardião mede idade do dado contra este ano. Cravado, ele envelhece junto com o código: virado 2027,
// tudo passaria a parecer um ano mais fresco do que é, e a "regra dos 4 anos" escorregaria em silêncio —
// justo o alarme deixando de tocar. Pior, o filtro `BETWEEN 2000 AND ANO_HOJE+1` na consulta EXCLUIRIA um
// dado de 2027 do cálculo, tratando fonte nova como inexistente. Mesma lei do IBGE e do INEP: descobrir.
const ANO_HOJE = Number(process.env.ANO_REF || new Date().getUTCFullYear());
// ⚠️ O GUARDIÃO SÓ OLHAVA O SCHEMA `public` — E O MIOLO DO PRODUTO MORA EM `app`.
// Medido em 10/ago: 163 tabelas com dimensão temporal em `public` e 51 em `app`, e as 51 estavam FORA da
// varredura. Entre elas `app.item_especificacao`, com 2,2 milhões de linhas — a tabela que a tela lê.
// Um vigia que não olha para onde o dado é servido diz "tudo ok" enquanto o produto envelhece. É pior que
// o alerta mudo, porque nem chegava a existir alerta.
const SCHEMAS = (process.env.SCHEMAS || "public,app").split(",").map((s) => s.trim()).filter(Boolean);
// staging/auditoria/legado + as tabelas de CONTROLE do `app` (`*_feitas_sc`, filas, candidatas): registram
// "o que já processei", não dado de município — o ano delas não mede frescor de coisa nenhuma.
const PULAR = /_check$|_feitos$|_feitas(_sc)?$|^fila_|^fetch_fila|_cand$|^reproc_|^roteia_|^reroteia_|^serie_anotacao$|^despesa_sub_check$|^_legado|_legado_/i;

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const cols = (await db.query(`SELECT table_schema s, table_name t, column_name c, data_type d FROM information_schema.columns
    WHERE table_schema = ANY($1::text[]) AND column_name ~* '^(ano|exercicio|competencia)$' ORDER BY table_schema, table_name`, [SCHEMAS])).rows
    .filter((x) => !PULAR.test(x.t));
  // 1 coluna de ano por tabela (prioriza ano > exercicio > competencia). A chave leva o SCHEMA: `public` e
  // `app` podem ter nomes parecidos, e confundir as duas é dar por fresca a tabela errada.
  const pref = { ano: 0, exercicio: 1, competencia: 2 };
  const porTab = new Map();
  for (const x of cols) { const k = `${x.s}.${x.t}`; const cur = porTab.get(k); if (!cur || pref[x.c] < pref[cur.c]) porTab.set(k, x); }

  // expr que extrai o ANO da coluna (int direto, ou ano da data/competência-texto)
  const anoExpr = (c, d) => d === "date" ? `EXTRACT(YEAR FROM ${c})::int` : d === "text" ? `NULLIF(regexp_replace(left(${c},4),'\\D','','g'),'')::int` : c;

  const linhas = [];
  for (const { s, t, c, d } of porTab.values()) {
    const e = anoExpr(c, d);
    const nome = s === "public" ? t : `${s}.${t}`;   // `app.` explícito; `public` fica limpo, como sempre esteve
    try {
      const r = (await db.query(`SELECT min(${e}) mi, max(${e}) ma, count(distinct ${e}) n, count(*) tot FROM "${s}"."${t}" WHERE ${e} BETWEEN 2000 AND ${ANO_HOJE + 1}`)).rows[0];
      linhas.push({ t: nome, mi: r.mi, ma: r.ma, n: Number(r.n), tot: Number(r.tot) });
    } catch (err) { linhas.push({ t: nome, erro: err.message.slice(0, 40) }); }
  }
  const status = new Map((await db.query(`SELECT id, ultimo_status FROM etl_catalogo`)).rows.map((r) => [r.id, r.ultimo_status]));

  // classificação
  for (const L of linhas) {
    if (L.erro) { L.flag = "erro"; continue; }
    const idade = L.ma != null ? ANO_HOJE - Number(L.ma) : null;
    if (L.ma == null) L.flag = "vazio";
    else if (idade > 4) L.flag = "desatualizado";       // regra dos 4 anos
    else if (L.n <= 1) L.flag = "sem_serie";            // só um ponto no tempo
    else if (idade >= 3) L.flag = "envelhecendo";
    else L.flag = "ok";
  }
  const ordem = { erro: 0, vazio: 1, desatualizado: 2, sem_serie: 3, envelhecendo: 4, ok: 5 };
  linhas.sort((a, b) => ordem[a.flag] - ordem[b.flag] || a.t.localeCompare(b.t));
  const IC = { erro: "🔴 ERRO", vazio: "⚫ VAZIO", desatualizado: "🟠 >4 ANOS", sem_serie: "🟡 SEM SÉRIE", envelhecendo: "🔵 ENVELHECE", ok: "🟢 OK" };

  console.log(`\n=== FRESCOR + SÉRIE HISTÓRICA — ${linhas.length} tabelas (ano de referência: ${ANO_HOJE}) ===\n`);
  const cont = {};
  for (const L of linhas) {
    cont[L.flag] = (cont[L.flag] || 0) + 1;
    if (L.flag === "ok") continue;
    const serie = L.erro ? L.erro : `${L.mi}–${L.ma} · ${L.n} ano(s) · ${L.tot} linhas`;
    console.log(`  ${IC[L.flag].padEnd(12)} ${L.t.padEnd(26)} ${serie}`);
  }
  console.log("\n--- RESUMO ---");
  for (const k of ["erro", "vazio", "desatualizado", "sem_serie", "envelhecendo", "ok"]) console.log(`  ${IC[k]}: ${cont[k] || 0}`);
  console.log(`  TOTAL: ${linhas.length} tabelas com dimensão temporal`);
  // status de coleta problemático (do catálogo)
  const probl = [...status.entries()].filter(([, s]) => /erro|retry/i.test(String(s || "")));
  if (probl.length) console.log("\n--- coleta com problema (etl_catalogo) ---\n  " + probl.map(([id, s]) => `${id}(${s})`).join(" · "));

  // PERSISTE o resultado (guardião de frescor no orquestrador) — findings ficam consultáveis mesmo com stdio ignorado
  const problematicas = linhas.filter((L) => L.flag !== "ok").map((L) => ({ t: L.t, flag: L.flag, serie: L.erro ? "erro" : `${L.mi}-${L.ma}/${L.n}a` }));
  await db.query(`CREATE TABLE IF NOT EXISTS frescor_log (id serial PRIMARY KEY, rodado_em timestamptz DEFAULT now(), total int, ok int, resumo jsonb, problemas jsonb)`);
  // sem `.catch(() => {})`: se o histórico não grava, é para aparecer, não para sumir
  await db.query(`INSERT INTO frescor_log (total, ok, resumo, problemas) VALUES ($1,$2,$3,$4)`,
    [linhas.length, cont.ok || 0, JSON.stringify(cont), JSON.stringify(problematicas)]);
  // ═══ O ALERTA DIZIA QUANTOS, NUNCA QUAIS ═══
  // O UPSERT gravava `ultimo_status` ("atenção: 7") e NÃO gravava `msg`. No painel e em qualquer consulta ao
  // catálogo — que é onde se olha — aparecia um número sem nome. A informação existia em `frescor_log.
  // problemas`, mas num lugar que ninguém abre: alerta que não diz o que está errado obriga a investigar do
  // zero toda vez, e alerta caro de ler é alerta que se aprende a ignorar.
  const graves = problematicas.filter((p) => /erro|vazio|desatualizado/.test(p.flag));
  const nProbl = graves.length;
  const porFlag = new Map();
  for (const p of graves) { if (!porFlag.has(p.flag)) porFlag.set(p.flag, []); porFlag.get(p.flag).push(p.t); }
  const detalhe = [...porFlag.entries()]
    .map(([flag, ts]) => `${flag} (${ts.length}): ${ts.slice(0, 8).join(", ")}${ts.length > 8 ? ` +${ts.length - 8}` : ""}`)
    .join(" · ");

  // ═══ E SE O GUARDIÃO NÃO CONSEGUISSE GRAVAR, NINGUÉM SABERIA ═══
  // As duas escritas terminavam em `.catch(() => {})`: falha ao registrar virava silêncio, e silêncio aqui é
  // indistinguível de "está tudo bem". Um vigia que morre calado é pior que vigia nenhum, porque ocupa o
  // lugar. Agora a falha de gravação é ruidosa e derruba o passo.
  try {
    await db.query(`INSERT INTO etl_catalogo (id,label,api,ultima_exec,ultimo_status,msg,atualizado_em)
      VALUES ('_frescor','Guardião de frescor (série + última competência)','meta',now(),$1,$2,now())
      ON CONFLICT (id) DO UPDATE SET ultima_exec=now(), ultimo_status=$1, msg=$2, atualizado_em=now()`,
      [nProbl > 0 ? `atenção: ${nProbl}` : "ok", nProbl > 0 ? `ano de referência ${ANO_HOJE} · ${detalhe}` : null]);
  } catch (e) {
    console.error(`FALHA AO REGISTRAR O FRESCOR no etl_catalogo: ${e.message}`);
    console.error(`  (o resultado da varredura existe, mas não chegou ao painel — ${nProbl} problemas: ${detalhe})`);
    await db.end();
    process.exit(1);
  }
  await db.end();
}
run().catch((e) => { console.error(e); process.exit(1); });
