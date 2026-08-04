// BATERIA 3 — COLETA. Sai do acervo e vai ao portal buscar o documento que falta.
// `auditoria/enriquece_marca.mjs` é a espinha: fila (homologado sem marca) → rota (portal_real, bolsa>ERP) →
// despacho por ARQUÉTIPO do portal (relatório gerado · blob · doc no acervo · gated→ata no PNCP) → extrai → ancora.
// Depois consolida de novo, porque ele grava em item_marca_padrao e quem ancora por valor é o consolida.
// LIMIT=0 = escala completa. CONC baixo de propósito: portal rate-limita e o 429 queima a fila.
//   node scripts/roda_extratores_acervo3.mjs
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
import fs from "fs"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });

const ETAPAS = [
  ["auditoria/enriquece_marca.mjs", { LIMIT: process.env.LIMIT ?? "0", CONC: process.env.CONC ?? "4" }, "coleta no portal + extração + âncora"],
  ["auditoria/consolida_marca.mjs", {}, "consolida as vias → item_marca_conferida"],
];
const run = (script, env) => new Promise((res) => {
  const t = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" });
  p.on("exit", (c) => res({ code: c, s: ((Date.now() - t) / 1000).toFixed(0) }));
  p.on("error", (e) => res({ code: -1, s: "0", err: e.message }));
});
const mede = async () => (await db.query(`
  select (select count(*) from app.item_marca_conferida_sc) conferida,
         (select count(*) from item_marca_sc) colunar,
         (select count(*) from app.item_marca_padrao_sc) padrao,
         (select count(*) from arquivo_texto_sc) docs_com_texto`)).rows[0];

// mesmo lock da tarefa agendada (auditoria/pipeline.mjs) — `marca_ata_feitas` é por processo e duas
// rodadas simultâneas fazem uma cegar a outra.
const cli = await db.connect();
if (!(await cli.query(`select pg_try_advisory_lock(918273645) ok`)).rows[0].ok) {
  console.log("já há uma rodada da cadeia de marca em curso — saindo"); process.exit(0);
}
const antes = await mede();
console.log("== BATERIA 3 (coleta) · ANTES ==", JSON.stringify(antes));
const log = [];
for (const [s, env, desc] of ETAPAS) {
  console.log(`\n────────── ${s} · ${desc} ──────────`);
  const r = await run(s, env);
  log.push({ etapa: s, saida: r.code, seg: r.s });
  console.log(`── ${s}: exit ${r.code} em ${r.s}s`);
}
const depois = await mede();
console.table(log);
console.log("== ANTES  ==", JSON.stringify(antes));
console.log("== DEPOIS ==", JSON.stringify(depois));
console.log(`\nΔ marca conferida: ${Number(depois.conferida) - Number(antes.conferida)} itens · Δ docs com texto: ${Number(depois.docs_com_texto) - Number(antes.docs_com_texto)}`);
console.table((await db.query(`
  with d as (select count(*) n from itens_sc where unit_homologado>0)
  select d.n itens_homologados, (select count(*) from app.item_marca_conferida_sc) com_marca,
         round(100.0*(select count(*) from app.item_marca_conferida_sc)/d.n,2) pct from d`)).rows);
await db.end();
