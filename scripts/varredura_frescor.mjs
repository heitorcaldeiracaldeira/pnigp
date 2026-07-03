// Varredura de FRESCOR + SÉRIE HISTÓRICA — consulta as PRÓPRIAS tabelas (não o max_ano do catálogo, que engana):
// para cada tabela com coluna de ano/competência, calcula a série (min–max), a profundidade (nº de anos distintos)
// e a última competência real; cruza com o status de coleta do etl_catalogo. Diretriz do usuário: ter a série
// histórica e sempre a última atualização; dado com >4 anos deve ser renovado. Read-only.
// node scripts/varredura_frescor.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO_HOJE = 2026;
const PULAR = /_check$|_feitos$|^serie_anotacao$|^despesa_sub_check$|^_legado|_legado_/i; // staging/auditoria/legado arquivado

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const cols = (await db.query(`SELECT table_name t, column_name c, data_type d FROM information_schema.columns
    WHERE table_schema='public' AND column_name ~* '^(ano|exercicio|competencia)$' ORDER BY table_name`)).rows
    .filter((x) => !PULAR.test(x.t));
  // 1 coluna de ano por tabela (prioriza ano > exercicio > competencia)
  const pref = { ano: 0, exercicio: 1, competencia: 2 };
  const porTab = new Map();
  for (const x of cols) { const cur = porTab.get(x.t); if (!cur || pref[x.c] < pref[cur.c]) porTab.set(x.t, x); }

  // expr que extrai o ANO da coluna (int direto, ou ano da data/competência-texto)
  const anoExpr = (c, d) => d === "date" ? `EXTRACT(YEAR FROM ${c})::int` : d === "text" ? `NULLIF(regexp_replace(left(${c},4),'\\D','','g'),'')::int` : c;

  const linhas = [];
  for (const { t, c, d } of porTab.values()) {
    const e = anoExpr(c, d);
    try {
      const r = (await db.query(`SELECT min(${e}) mi, max(${e}) ma, count(distinct ${e}) n, count(*) tot FROM ${t} WHERE ${e} BETWEEN 2000 AND ${ANO_HOJE + 1}`)).rows[0];
      linhas.push({ t, mi: r.mi, ma: r.ma, n: Number(r.n), tot: Number(r.tot) });
    } catch (err) { linhas.push({ t, erro: err.message.slice(0, 40) }); }
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
  await db.query(`INSERT INTO frescor_log (total, ok, resumo, problemas) VALUES ($1,$2,$3,$4)`,
    [linhas.length, cont.ok || 0, JSON.stringify(cont), JSON.stringify(problematicas)]).catch(() => {});
  // status agregado no etl_catalogo (aparece no painel /etl como qualquer fonte)
  const nProbl = problematicas.filter((p) => /erro|vazio|desatualizado/.test(p.flag)).length;
  await db.query(`INSERT INTO etl_catalogo (id,label,api,ultima_exec,ultimo_status,atualizado_em) VALUES ('_frescor','Guardião de frescor (série + última competência)','meta',now(),$1,now())
    ON CONFLICT (id) DO UPDATE SET ultima_exec=now(), ultimo_status=$1, atualizado_em=now()`, [nProbl > 0 ? `atenção: ${nProbl}` : "ok"]).catch(() => {});
  await db.end();
}
run().catch((e) => { console.error(e); process.exit(1); });
