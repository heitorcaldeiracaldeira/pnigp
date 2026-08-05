// AUDITORIA · pipeline — A CADEIA DA MARCA, dirigida por evento. É o que roda SOZINHO todo dia.
//
// O que estava errado até 04/ago/2026: este arquivo existia mas (a) NENHUM agendador o chamava — só rodava se
// alguém digitasse o comando; (b) cobria 1 de 8 extratores (só o A/B inline); (c) NÃO rodava o `consolida_marca`,
// então a marca crua que os extratores gravavam nunca chegava em `item_marca_conferida_sc`, que é a tabela que o
// produto lê. Resultado: 20 mil itens de marca parados esperando consolidação ([[pnigp-gap-extracao-marca-nao-agendada]]).
//
// Agora cobre a cadeia inteira. Toda etapa é incremental e resumível por conta própria — numa rodada diária só
// toca o que homologou/mudou desde a última, então o custo é pequeno; o caro foi só o passivo inicial.
//
// TRAVA: `az`/`betha`/`ecustomize`/`portal_vencedores` compartilham `marca_ata_feitas` chaveada por processo —
// duas execuções simultâneas fazem uma cegar a outra. Trava por linha com batida (trava_processo.mjs): se já
// houver rodada em curso (inclusive uma bateria manual), sai limpo em vez de corromper a fila. NÃO é advisory
// lock — lock de sessão não sobrevive ao pooler do Neon; o porquê, medido, está em trava_processo.mjs.
//
//   node scripts/auditoria/pipeline.mjs            # ciclo completo (é o que a tarefa agendada chama)
//   SEM_LLM=1 node scripts/auditoria/pipeline.mjs  # pula visão/atas (as duas etapas que usam API)
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
import fs from "fs"; import pg from "pg";
import { pegaTrava } from "../trava_processo.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(__dirname, "..");
const ROOT = path.join(SCRIPTS, "..");
const UF = (process.env.UF || "sc").toLowerCase();
const SEM_LLM = process.env.SEM_LLM === "1";
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// max: 2 e não 1 — a batida da trava precisa de uma conexão livre mesmo com uma consulta longa em curso;
// com pool de 1 ela ficaria na fila atrás de um statement de até 300s e a trava pareceria abandonada.
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });

const ETAPAS = [
  // 1) EVENTO — quem homologou/des-homologou desde o watermark; reabre o processo e enfileira o doc que falta
  ["auditoria/ao_homologar.mjs",           {},                        "evento: homologou/des-homologou"],
  // 2) FILA — quais documentos contêm padrão de marca (refresh incremental)
  ["constroi_doc_tem_marca.mjs",           { REFRESH: "1" },          "fila de documentos com marca"],
  // 3) EXTRAÇÃO determinística — cada família lê o seu template. Zero API.
  ["extrai_marca_padrao.mjs",              { LIMIT: "0" },            "templates A/B inline"],
  ["extrai_marca_router.mjs",              { LIMIT: "0" },            "templates de portal (marca_tpl)"],
  ["extrai_marca_multi.mjs",               { LIMIT: "0" },            "Pública · LicitarDigital · Dispensa · IPM"],
  ["extrai_az.mjs",                        { LIMIT: "0" },            "ComprasBR (AZ)"],
  ["extrai_betha.mjs",                     { LIMIT: "0" },            "Betha"],
  ["extrai_ecustomize.mjs",                { LIMIT: "0" },            "ECustomize"],
  ["extrai_portal_vencedores.mjs",         { LIMIT: "0" },            "bloco Vencedores do PCP"],
  ["auditoria/extrai_marca_proposta.mjs",  { LIMIT: "0" },            "marca na PROPOSTA (art.41)"],
  ["extrai_marca_ancora.mjs",              { LIMIT: "0" },            "âncora de valor na linha do vencedor"],
  // 4) CONFERÊNCIA — trava dupla (CNPJ+valor) e item+valor
  ["confere_marca_comprasnet.mjs",         { LIMIT: "0" },            "Compras.gov · trava dupla"],
  ["confere_marca_lote.mjs",               {},                        "confere item_marca_sc por item+valor"],
  // 5) RESÍDUO com API — só onde o determinístico não leu
  ["extrai_marca_visao.mjs",               { LIMIT: "0" },            "PDF-imagem → visão", true],
  ["ingest_marca_atas_sc.mjs",             { LIMIT: "0", GATE_MARCA: "1" }, "atas no resíduo", true],
  // 6) CONSOLIDA — sem isto nada chega ao produto
  ["auditoria/consolida_marca.mjs",        {},                        "ancora por valor → item_marca_conferida"],
  // 7) ESPECIFICAÇÃO — a visão por item (spec do documento + marca do dia). Base = itens_sc INTEIRA: a spec não
  //    depende de marca, a marca é enriquecimento opcional. Troca atômica, então pode rodar com o app no ar.
  ["constroi_especificacao_item.mjs",      {},                        "spec + marca por item → item_especificacao"],
];

const run = (script, env) => new Promise((res) => {
  const t = Date.now();
  const p = spawn(process.execPath, [path.join(SCRIPTS, script)], { cwd: ROOT, env: { ...process.env, UF, ...env }, stdio: "inherit" });
  p.on("exit", (c) => res({ code: c, s: ((Date.now() - t) / 1000).toFixed(0) }));
  p.on("error", () => res({ code: -1, s: "0" }));
});
const mede = async () => (await db.query(`select (select count(*) from app.item_marca_conferida_${UF}) conferida,
  (select count(*) from item_marca_${UF}) cru`)).rows[0];

// A trava NÃO é mais pg_advisory_lock: o DATABASE_URL é o endpoint "-pooler" do Neon (pgbouncer em modo
// transação) e lock de sessão não sobrevive a isso. Medido em 04/ago/2026: o unlock devolveu false e a trava
// ficou presa no backend, de forma que outra execução não conseguia pegá-la depois de "solta". Numa cadeia que
// sai em silêncio quando não pega a trava, isso é o pior defeito possível — ela pularia a noite inteira sem
// dizer por quê, e ninguém veria a marca deixar de ser enriquecida. Ver trava_processo.mjs.
const trava = await pegaTrava(db, "cadeia_marca", { toleranciaMin: 15 });  // etapas longas: tolerância folgada
if (!trava.ok) { console.log(`já há uma rodada da cadeia de marca em curso (${trava.donoAtual}, há ${trava.minRodando} min) — saindo sem tocar na fila`); await db.end(); process.exit(0); }

console.log(`== CADEIA DA MARCA (UF=${UF}) · ${new Date().toISOString()} ==`);
const antes = await mede();
console.log("antes:", JSON.stringify(antes));
const log = [];
for (const [s, env, desc, usaLLM] of ETAPAS) {
  if (usaLLM && SEM_LLM) { log.push({ etapa: s, saida: "pulado", seg: "0" }); continue; }
  console.log(`\n── ${s} · ${desc}`);
  const r = await run(s, env);
  log.push({ etapa: s, saida: r.code, seg: r.s });
  if (r.code !== 0) console.log(`   ! ${s} saiu ${r.code} — segue (o resumo dele retoma na próxima rodada)`);
}
const depois = await mede();
console.table(log);
console.log(`antes ${JSON.stringify(antes)} → depois ${JSON.stringify(depois)}`);
console.log(`Δ marca conferida: ${Number(depois.conferida) - Number(antes.conferida)} itens`);
await trava.solta();
await db.end();
