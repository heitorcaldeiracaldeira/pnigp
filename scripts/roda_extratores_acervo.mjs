// RODA TODA A BATERIA DETERMINÍSTICA sobre o que JÁ ESTÁ NO ACERVO — sem rede, sem portal, sem LLM.
// Alvo: os itens homologados cujo processo já tem o documento de resultado guardado e que ainda não têm marca.
// Ordem = fila primeiro, depois os parsers por família, depois a âncora de valor, e a consolidação no fim.
// Cada etapa é resumível por conta própria; se uma falhar, as outras seguem (o erro fica no relatório).
// A rodada É a medição: mede antes, roda, mede depois. node scripts/roda_extratores_acervo.mjs
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
import fs from "fs"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });

const ETAPAS = [
  ["constroi_doc_tem_marca.mjs", { REFRESH: "1" }, "fila: docs que contêm marca"],
  ["extrai_marca_padrao.mjs",    { LIMIT: "0" },   "templates A/B inline"],
  ["extrai_marca_router.mjs",    { LIMIT: "0" },   "templates de portal (marca_tpl)"],
  ["extrai_marca_multi.mjs",     { LIMIT: "0" },   "Pública · LicitarDigital · Dispensa/Termo · IPM"],
  ["extrai_az.mjs",              { LIMIT: "0" },   "ComprasBR (AZ)"],
  ["extrai_betha.mjs",           { LIMIT: "0" },   "Betha"],
  ["extrai_ecustomize.mjs",      { LIMIT: "0" },   "ECustomize"],
  ["extrai_marca_ancora.mjs",    { LIMIT: "0" },   "âncora de valor (linha do vencedor)"],
  ["auditoria/consolida_marca.mjs", {},            "consolida as vias → item_marca_conferida"],
];

const run = (script, env) => new Promise((res) => {
  const t = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" });
  p.on("exit", (c) => res({ code: c, s: ((Date.now() - t) / 1000).toFixed(0) }));
  p.on("error", (e) => res({ code: -1, s: "0", err: e.message }));
});

const mede = async () => (await db.query(`
  with comdoc as (select distinct a.cnpj,a.ano,a.seq from arquivos_sc a
    where a.titulo ~* '(homolog|ata de realiz|ata de sess|ata final|resultado|adjudica|vencedor|termo de julg|registro de pre)')
  select (select count(*) from app.item_marca_conferida_sc) conferida,
         (select count(*) from item_marca_sc) colunar,
         (select count(*) from app.item_marca_padrao_sc) padrao,
         (select count(*) filter (where m.marca is null)
            from itens_sc i join comdoc d using(cnpj,ano,seq)
            left join app.item_marca_conferida_sc m on m.cnpj=i.cnpj and m.ano=i.ano and m.seq=i.seq and m.numero=i.numero::text
          where i.unit_homologado>0) no_acervo_sem_marca`)).rows[0];

// PULAR="a.mjs,b.mjs" — etapas já concluídas numa rodada anterior (cada extrator é resumível por conta própria,
// mas re-rodar a fila de doc_tem_marca custa ~19min para achar nada).
const PULAR = new Set((process.env.PULAR || "").split(",").map((s) => s.trim()).filter(Boolean));
// mesmo lock da tarefa agendada (auditoria/pipeline.mjs): `marca_ata_feitas` é por processo, e duas rodadas
// simultâneas fazem uma cegar a outra — a que chega marca "feito" e a outra pula um processo que não leu.
const cli = await db.connect();
if (!(await cli.query(`select pg_try_advisory_lock(918273645) ok`)).rows[0].ok) {
  console.log("já há uma rodada da cadeia de marca em curso (tarefa agendada ou outra bateria) — saindo"); process.exit(0);
}
const antes = await mede();
console.log("== ANTES ==", JSON.stringify(antes));
const log = [];
for (const [s, env, desc] of ETAPAS) {
  if (PULAR.has(s)) { console.log(`\n── ${s}: PULADO (concluído na rodada anterior)`); log.push({ etapa: s, saida: "pulado", seg: "0" }); continue; }
  console.log(`\n────────── ${s} · ${desc} ──────────`);
  const r = await run(s, env);
  log.push({ etapa: s, saida: r.code, seg: r.s });
  console.log(`── ${s}: exit ${r.code} em ${r.s}s`);
}
const depois = await mede();
console.log("\n== ETAPAS ==");
console.table(log);
console.log("== ANTES  ==", JSON.stringify(antes));
console.log("== DEPOIS ==", JSON.stringify(depois));
console.log(`\nΔ marca conferida: ${Number(depois.conferida) - Number(antes.conferida)} itens`);
console.log(`Δ itens no acervo ainda sem marca: ${Number(depois.no_acervo_sem_marca) - Number(antes.no_acervo_sem_marca)}`);
console.log("\n=== COBERTURA final sobre o homologado ===");
console.table((await db.query(`
  with d as (select count(*) n from itens_sc where unit_homologado>0)
  select d.n itens_homologados, (select count(*) from app.item_marca_conferida_sc) com_marca,
         round(100.0*(select count(*) from app.item_marca_conferida_sc)/d.n,2) pct from d`)).rows);
await db.end();
