// BATERIA 2 — o RESTO dos extratores, sobre o acervo. Roda depois da bateria 1 (determinística de família),
// nunca junto: az/betha/ecustomize/portal_vencedores compartilham `marca_ata_feitas` por processo, e rodar em
// paralelo faria um cegar o outro.
//
// Ordem = determinístico primeiro, LLM só no resíduo do determinístico ([[pnigp-marca-cobertura-landscape]]):
//   1..4  determinísticos que faltavam
//   5..6  conferência (trava dupla comprasnet + item+valor em lote) → item_marca_conferida
//   7     participantes (corpus de quem concorreu — não é o vencedor)
//   8     VISÃO: doc de resultado que é PDF-imagem → Haiku-visão (custa API)
//   9     ATAS no resíduo: GATE_MARCA=1 = só onde o doc TEM o token 'marca' e o determinístico não leu (custa API)
//   10    consolida de novo (as vias novas precisam ser ancoradas por valor)
// node scripts/roda_extratores_acervo2.mjs        [SEM_LLM=1 pula as etapas 8 e 9]
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
import fs from "fs"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const SEM_LLM = process.env.SEM_LLM === "1";

const ETAPAS = [
  ["extrai_portal_vencedores.mjs",        { LIMIT: "0" }, "bloco Vencedores do PCP (gerador=portal_vencedores)", false],
  ["auditoria/extrai_marca_proposta.mjs", { LIMIT: "0" }, "marca nas PROPOSTAS (art.41: vedada no edital, obrigatória na proposta)", false],
  ["confere_marca_comprasnet.mjs",        { LIMIT: "0" }, "Compras.gov — trava dupla (CNPJ + valor)", false],
  ["confere_marca_lote.mjs",              {},             "confere item_marca_sc por item+valor", false],
  ["marca_participantes_comprasnet.mjs",  { LIMIT: "0" }, "marcas participantes (corpus descrição→marcas)", false],
  ["extrai_marca_visao.mjs",              { LIMIT: "0" }, "PDF-imagem → Haiku-visão", true],
  ["ingest_marca_atas_sc.mjs",            { LIMIT: "0", GATE_MARCA: "1" }, "atas no resíduo → Haiku (só onde há token 'marca')", true],
  ["auditoria/consolida_marca.mjs",       {},             "consolida as vias → item_marca_conferida", false],
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

// mesmo lock da tarefa agendada (auditoria/pipeline.mjs) — `marca_ata_feitas` é por processo e duas
// rodadas simultâneas fazem uma cegar a outra.
const cli = await db.connect();
if (!(await cli.query(`select pg_try_advisory_lock(918273645) ok`)).rows[0].ok) {
  console.log("já há uma rodada da cadeia de marca em curso — saindo"); process.exit(0);
}
const antes = await mede();
console.log("== BATERIA 2 · ANTES ==", JSON.stringify(antes));
const log = [];
for (const [s, env, desc, usaLLM] of ETAPAS) {
  if (usaLLM && SEM_LLM) { console.log(`\n── ${s}: PULADO (SEM_LLM=1)`); log.push({ etapa: s, saida: "pulado", seg: "0" }); continue; }
  console.log(`\n────────── ${s} · ${desc}${usaLLM ? " · [usa API Haiku]" : ""} ──────────`);
  const r = await run(s, env);
  log.push({ etapa: s, saida: r.code, seg: r.s });
  console.log(`── ${s}: exit ${r.code} em ${r.s}s`);
}
const depois = await mede();
console.log("\n== ETAPAS (bateria 2) ==");
console.table(log);
console.log("== ANTES  ==", JSON.stringify(antes));
console.log("== DEPOIS ==", JSON.stringify(depois));
console.log(`\nΔ marca conferida: ${Number(depois.conferida) - Number(antes.conferida)} itens`);
console.log("\n=== COBERTURA final sobre o homologado ===");
console.table((await db.query(`
  with d as (select count(*) n from itens_sc where unit_homologado>0)
  select d.n itens_homologados, (select count(*) from app.item_marca_conferida_sc) com_marca,
         round(100.0*(select count(*) from app.item_marca_conferida_sc)/d.n,2) pct from d`)).rows);
await db.end();
