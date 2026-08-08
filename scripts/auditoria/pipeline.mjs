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
import { carimboBR } from "../hora_br.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(__dirname, "..");
const ROOT = path.join(SCRIPTS, "..");
const UF = (process.env.UF || "sc").toLowerCase();
const SEM_LLM = process.env.SEM_LLM === "1";
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// max: 2 e não 1 — a batida da trava precisa de uma conexão livre mesmo com uma consulta longa em curso;
// com pool de 1 ela ficaria na fila atrás de um statement de até 300s e a trava pareceria abandonada.
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });

// ═══ TUDO QUE FOI CONSTRUÍDO ENTRA — ORDEM DO HEITOR, 08/ago ═══
// "passamos a semana estruturando e agora precisa ligar todos". O diagnóstico bate com a medição: a marca
// cobre 1,45% dos processos homologados não porque falte peça, mas porque as peças prontas não eram
// chamadas. Varrido o repositório, três centrais estavam soltas — nenhuma delas por decisão:
//   · marca_estado_processo — a FILA DE TRABALHO roteada pelo portal real; sem ela o resto adivinha o alvo
//   · extrai_marca_fila     — a PORTA ÚNICA de escrita, que roteia por gerador e só grava o AFIRMADO
//   · enriquece_marca       — a ESPINHA: despacha por ARQUÉTIPO de portal e é quem realmente BUSCA
//
// ⛔ roda_extratores_acervo.mjs NÃO entra, e isso é decisão medida, não esquecimento: ele chama
//    constroi_doc_tem_marca + os mesmos extrai_* + consolida que já estão nesta lista. Ligá-lo rodaria a
//    bateria inteira duas vezes por ciclo.
//
// ⚠️ Sobre o custo: extrai_marca_fila e enriquece_marca são as duas etapas caras (a primeira varre o
//    universo de processos; a segunda sai para os portais). Ambas entram com TETO por rodada — é ciclo
//    diário, não mutirão — e ambas são idempotentes e retomáveis por livro-razão próprio, então o teto
//    apenas fatia o trabalho entre as noites em vez de perdê-lo.
const ETAPAS = [
  // 1) EVENTO — quem homologou/des-homologou desde o watermark; reabre o processo e enfileira o doc que falta
  ["auditoria/ao_homologar.mjs",           {},                        "evento: homologou/des-homologou"],
  // 1b) DRENA a fila que a etapa 1 acabou de encher. Faltava exatamente isto: `ao_homologar` ENFILEIRA o
  // fetch e estava agendado; `coletor.mjs` é quem ESVAZIA e não era chamado por cadeia, .cmd ou pipeline
  // nenhum. Produtor agendado, consumidor não — o mesmo gap da marca, um elo antes. Resultado medido em
  // 07/ago: 13.681 processos parados na fila, o lote mais antigo enfileirado em 21/jul, 17 dias sem ninguém.
  // Vem ANTES de constroi_doc_tem_marca para que o texto baixado agora já entre na fila de docs desta rodada.
  // LIMIT com teto: é lote diário, não mutirão. O passivo drena em alguns dias e depois só acompanha o fluxo.
  ["auditoria/coletor.mjs",                { LIMIT: "3000" },         "drena a fetch_fila (baixa o doc que falta)"],
  // 1c) ESTADO/FILA — roteia cada processo homologado pelo portal REAL e diz em que estado ele está
  // (conferida · doc-no-acervo · a-buscar[portal] · sem-rota). É a fila de trabalho de tudo que vem depois:
  // sem ela, os extratores e a espinha adivinham o alvo em vez de receber a lista.
  ["marca_estado_processo.mjs",            {},                        "estado da marca por processo (fila roteada)"],
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
  // 3b) A PORTA ÚNICA DE ESCRITA — roteia o documento pelo GERADOR (gerador_documento.mjs), chama o leitor
  // daquele gerador e grava só o que foi AFIRMADO (`marca`/`sem_marca_declarada`), recusando `candidato`.
  // É esta recusa — e não a lista de leitores — que protege a base do recorte que envenena.
  ["extrai_marca_fila.mjs",                { LIMIT: "20000" },        "fila por gerador → grava o afirmado"],
  // 3c) A ESPINHA — despacha por ARQUÉTIPO de portal, não por nome: relatorio_gerado (PCP/Licitanet),
  // arquivo_blob (BLL/BNC/Licitar), doc_no_acervo (Compras.gov) e gated/pncp (ComprasBR/BBMNET/BB, onde a
  // ata sai do PNCP porque a lei obriga publicar lá). É a única etapa que efetivamente BUSCA no portal.
  ["auditoria/enriquece_marca.mjs",        { LIMIT: "2000" },         "despacho por arquétipo (busca no portal)"],
  // 4) CONFERÊNCIA — trava dupla (CNPJ+valor) e item+valor
  ["confere_marca_comprasnet.mjs",         { LIMIT: "0" },            "Compras.gov · trava dupla"],
  ["confere_marca_lote.mjs",               {},                        "confere item_marca_sc por item+valor"],
  // 5) RESÍDUO com API — só onde o determinístico não leu
  ["extrai_marca_visao.mjs",               { LIMIT: "0" },            "PDF-imagem → visão", true],
  ["ingest_marca_atas_sc.mjs",             { LIMIT: "0", GATE_MARCA: "1" }, "atas no resíduo", true],
  // 6) CONSOLIDA — necessário, mas NÃO suficiente (ver 6b)
  ["auditoria/consolida_marca.mjs",        {},                        "ancora por valor → item_marca_conferida"],
  // 6b) NORMALIZA E MONTA A ALLOWLIST — o elo que faltava, e sem ele o produto exibe ZERO
  // O comentário acima dizia "sem consolida nada chega ao produto". Medido em 07/ago: consolidar não basta.
  // `queries.ts` filtra por `c.marca_norm IS NOT NULL` E faz JOIN em `marca_dicionario_${uf}` exigindo
  // confiança alta/média. Com estas duas etapas de fora, `marca_norm` fica NULA e o JOIN não acha nada —
  // a tela mostra zero marca por mais que a extração tenha funcionado. Foi exatamente o estado encontrado:
  // 43.822 linhas conferidas no banco, 0 visíveis. Rodadas as duas: 24.727 linhas e 2.323 marcas na tela.
  // São baratas (segundos, tabelas pequenas) — não há motivo para ficarem fora do ciclo diário.
  ["auditoria/normaliza_marca.mjs",        {},                        "marca_norm/modelo_norm + suspeitas"],
  ["auditoria/monta_dicionario_marca.mjs", {},                        "allowlist por diversidade de órgãos"],
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

console.log(`== CADEIA DA MARCA (UF=${UF}) · ${carimboBR()} ==`);   // Brasília, igual ao resto dos logs
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
