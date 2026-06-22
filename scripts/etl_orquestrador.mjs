// ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental,
// idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrador.mjs
//   MODO=plan (padrão) → só detecta e reporta o que está pendente, sem rodar.
//   MODO=run           → detecta e executa os ETLs devidos.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import { spawn, execSync } from "child_process"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MODO = process.env.MODO || "plan";
const HOJE = new Date();
const ANO_FECHADO = HOJE.getFullYear() - 1;      // último exercício fechado
const ANO_CORRENTE = HOJE.getFullYear();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const log = (m) => process.stdout.write(`[ORQ ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
db.on("error", () => {});
const maxAno = async (tab, col = "ano") => { try { return Number((await db.query(`SELECT max(${col}) m FROM ${tab}`)).rows[0]?.m) || 0; } catch { return 0; } };
const diasDesde = (ts) => (ts ? (Date.now() - new Date(ts).getTime()) / 86400000 : 9999);

// CATÁLOGO — cada fonte: id, label, api (serializa por grupo), script+env, e o detector "devido?"
const FONTES = [
  { id: "financas", label: "Finanças (SICONFI RREO an.1/2)", api: "siconfi", script: "scripts/ingest_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => (await maxAno("financas_sc")) < ANO_FECHADO || diasDesde(st?.ultima_exec) > 35 },
  { id: "metas", label: "Metas Fiscais LDO (RREO an.6)", api: "siconfi", script: "scripts/ingest_metas_fiscais_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async () => (await maxAno("metas_fiscais_sc")) < ANO_FECHADO },
  { id: "desp_subfuncao", label: "Despesa por subfunção (RREO an.2 — drill)", api: "siconfi", script: "scripts/ingest_despesa_subfuncao_sc.mjs", env: {},
    devido: async () => (await maxAno("despesa_subfuncao_sc")) < ANO_FECHADO },
  { id: "receitas_det", label: "Receitas detalhadas (ICMS/FPM/IPTU/FUNDEB — RREO an.3)", api: "siconfi", script: "scripts/ingest_receitas_detalhe_sc.mjs", env: {},
    devido: async () => (await maxAno("receitas_detalhe_sc")) < ANO_FECHADO },
  { id: "rreo_const", label: "Educação/RCL (RREO an.14/3)", api: "siconfi", script: "scripts/ingest_rreo_constitucional_sc.mjs", env: {},
    devido: async () => (await maxAno("rreo_const_sc")) < ANO_FECHADO },
  { id: "rgf", label: "Pessoal/DCL (RGF)", api: "siconfi", script: "scripts/ingest_rgf_sc.mjs", env: {},
    devido: async () => (await maxAno("rgf_sc")) < ANO_FECHADO },
  { id: "rpps", label: "Previdência RPPS (RREO Anexo 04)", api: "siconfi", script: "scripts/ingest_rpps_sc.mjs", env: {},
    devido: async () => (await maxAno("rpps_sc")) < ANO_FECHADO },
  { id: "rpps_atuarial", label: "Déficit atuarial RPPS (CADPREV/DRAA)", api: "cadprev", script: "scripts/ingest_rpps_atuarial_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // DRAA anual
  { id: "siops", label: "Saúde ASPS (SIOPS)", api: "siops", script: "scripts/ingest_siops_sc.mjs", env: {},
    devido: async () => (await maxAno("siops_sc")) < ANO_FECHADO },
  { id: "compras", label: "Compras (PNCP ano corrente)", api: "pncp", script: "scripts/ingest_compras_sc.mjs", env: { ANO: String(ANO_CORRENTE), REFRESH: "1" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 25 },
  { id: "contratos", label: "Contratos (PNCP ano corrente, append)", api: "pncp", script: "scripts/ingest_contratos_sc.mjs", env: { APPEND: "1", ANOS: String(ANO_CORRENTE), REFRESH: "1" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 25 },
  { id: "pca", label: "PCA (PNCP)", api: "pncp", script: "scripts/ingest_pca_sc.mjs", env: { ANOS: `${ANO_CORRENTE},${ANO_CORRENTE + 1}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 35 },
  { id: "processos", label: "Processos PNCP — TODOS (todas modalidades/anos)", api: "pncp", script: "scripts/ingest_processos_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
  { id: "itens", label: "Itens de TODOS os processos (preço unitário)", api: "pncp", script: "scripts/ingest_itens_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
  { id: "indicadores", label: "Indicadores (IBGE/CGU)", api: "ibge", script: "scripts/ingest_indicadores_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "transferencias", label: "Transferências (CGU)", api: "cgu", script: "scripts/ingest_transferencias_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "cnes", label: "CNES — rede de saúde (Min. Saúde)", api: "cnes", script: "scripts/ingest_cnes_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // competência mensal
  { id: "sih", label: "SIH — produção hospitalar (DATASUS)", api: "datasus", script: "scripts/ingest_sih_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // competência mensal (TabNet)
  { id: "sia", label: "SIA — produção ambulatorial (DATASUS)", api: "datasus", script: "scripts/ingest_sia_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "previne", label: "Previne Brasil — indicadores APS (SISAB)", api: "datasus", script: "scripts/ingest_previne_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 40 }, // quadrimestral
  { id: "indigena", label: "População indígena (IBGE Censo 2022)", api: "ibge", script: "scripts/ingest_indigena_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // censitário (decenal)
  { id: "fns", label: "Repasses federais FNS por bloco (Consulta Consolidada)", api: "fns", script: "scripts/ingest_fns_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // repasses mensais; ano corrente cresce
  { id: "cnpj_loc", label: "Localidade dos fornecedores (CNPJ→UF/município)", api: "receita", script: "scripts/ingest_cnpj_loc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 }, // novos fornecedores a cada coleta de contratos/itens
  { id: "empenhos", label: "Empenhos por contrato (PNCP Lei 14.133 — acende quando publicarem)", api: "pncp", script: "scripts/ingest_empenhos_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // recheca contratos recentes; cobertura hoje ~0
  { id: "atas", label: "Atas de Registro de Preço (PNCP Consulta)", api: "pncp", script: "scripts/ingest_atas_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
  { id: "nf", label: "Notas fiscais / instrumentos de cobrança (PNCP — acende quando publicarem)", api: "pncp", script: "scripts/ingest_nf_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // cobertura SC hoje ~0
  { id: "iegm", label: "IEGM — qualidade da gestão (TCE-SC/IRB, dados abertos)", api: "irb", script: "scripts/ingest_iegm_sc.mjs", env: {},
    devido: async () => (await maxAno("iegm_sc")) < ANO_FECHADO-1 },
  { id: "cauc", label: "Regularidade fiscal CAUC/CADIN (Tesouro)", api: "tesouro", script: "scripts/ingest_cauc_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 7 }, // atualizado diariamente — recoleta semanal
  { id: "ideb", label: "IDEB — indicadores educacionais (INEP)", api: "inep", script: "scripts/ingest_ideb_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // bienal
  { id: "censo", label: "Censo Escolar — matrículas (INEP Sinopse)", api: "inep", script: "scripts/ingest_censo_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // anual
  { id: "programas_transferegov", label: "Radar de Captação — programas + planos (Transferegov fundo a fundo, API viva)", api: "transferegov", script: "scripts/ingest_transferegov_api.mjs", env: { UF: "SC" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 7 }, // janelas de proposta mudam — recoleta semanal
  { id: "fnde_simad", label: "FNDE liberações por município (SIMAD, Playwright)", api: "inep", script: "scripts/ingest_fnde_simad.mjs", env: { UF: "SC" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // browser-only; recoleta esparsa
  { id: "escolas", label: "Escolas por município + infraestrutura (INEP Censo Escolar)", api: "inep", script: "scripts/ingest_escolas_sc.mjs", env: { ANO: "2025" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // anual
];

async function ensure() {
  await db.query(`CREATE TABLE IF NOT EXISTS etl_catalogo (
    id TEXT PRIMARY KEY, label TEXT, api TEXT, max_ano INTEGER,
    ultima_exec timestamptz, ultimo_status TEXT, devido BOOLEAN, msg TEXT, atualizado_em timestamptz )`);
  await db.query(`ALTER TABLE etl_catalogo ADD COLUMN IF NOT EXISTS solicitado BOOLEAN DEFAULT FALSE`); // pedido manual via tela /etl
  for (const f of FONTES) await db.query(`INSERT INTO etl_catalogo (id,label,api) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, api=EXCLUDED.api`, [f.id, f.label, f.api]);
}
const estado = async (id) => (await db.query(`SELECT * FROM etl_catalogo WHERE id=$1`, [id])).rows[0];

// ===== SUPERVISÃO (lógica do PNCP aplicada a TODA fonte) =====
// Tabela cujo count(*) cresce durante a coleta = sinal de progresso de cada fonte.
const TAB = { financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc_feitos", processos: "processos_sc", itens: "itens_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", cnes: "cnes_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc" };
const conta = async (id) => { try { return Number((await db.query(`SELECT count(*) n FROM ${TAB[id] || "financas_sc"}`)).rows[0].n) || 0; } catch { return 0; } };
const STALL_MS = 20 * 60 * 1000;   // 20 min sem progresso => mata e religa (folga p/ não matar ente pesado)
const CHECK_MS = 60 * 1000;
const MAX_TENT = 5;
const killTree = (pid) => { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }); } catch {} };

// roda 1 vez sob monitoramento; "ok" | "retry"(estagnado) | "erro(n)"
function runOnce(f, reinicios) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [f.script], { cwd: ROOT, env: { ...process.env, ...f.env }, stdio: "ignore" });
    let last = -1, lastChange = Date.now(), settled = false, timer = null;
    const fin = (v) => { if (settled) return; settled = true; if (timer) clearInterval(timer); resolve(v); };
    timer = setInterval(async () => {
      let p; try { p = await conta(f.id); } catch { return; }
      if (p !== last) { last = p; lastChange = Date.now(); }
      const idle = Math.round((Date.now() - lastChange) / 1000);
      await db.query(`UPDATE etl_catalogo SET msg=$1, atualizado_em=now() WHERE id=$2`, [`rodando: ${p} regs · ${reinicios} reinício(s)${idle > 120 ? ` · quieto ${idle}s` : ""}`, f.id]).catch(() => {});
      if (Date.now() - lastChange > STALL_MS) { log(`!! ${f.id} ESTAGNADO (${idle}s) — matando e religando`); killTree(child.pid); fin("retry"); }
    }, CHECK_MS);
    child.on("exit", (code) => fin(code === 0 ? "ok" : `erro(${code})`));
    child.on("error", () => fin("erro(spawn)"));
  });
}

// supervisão completa: religa em estagnação OU crash, até MAX_TENT (ETLs são idempotentes/resumíveis)
async function rodar(f) {
  let ultimo = "—";
  for (let tent = 1; tent <= MAX_TENT; tent++) {
    log(`▶ ${f.id} (tentativa ${tent}/${MAX_TENT})`);
    ultimo = await runOnce(f, tent - 1);
    await db.query(`UPDATE etl_catalogo SET ultima_exec=now(), ultimo_status=$1, msg=$2, atualizado_em=now() WHERE id=$3`, [ultimo, `tentativa ${tent} · ${new Date().toISOString().slice(0, 16)}`, f.id]).catch(() => {});
    if (ultimo === "ok") return "ok";
    log(`  ${f.id}: ${ultimo} — religando em 5s`);
    await sleep(5000);
  }
  return ultimo;
}

async function main() {
  await ensure();
  log(`MODO=${MODO} | ano fechado=${ANO_FECHADO} | corrente=${ANO_CORRENTE}`);
  // 1) detectar (MODO=solicitados → roda só o que foi pedido na tela; run → devidos OU solicitados; plan → só reporta)
  const SOLIC = MODO === "solicitados";
  const plano = [];
  for (const f of FONTES) {
    const st = await estado(f.id);
    let devido = false; try { devido = await f.devido(st); } catch {}
    const solicitado = st?.solicitado === true;
    const ma = f.id === "cnes"
      ? (Number((await db.query(`SELECT max(extract(year from atualizado))::int y FROM cnes_sc`).catch(() => ({ rows: [{}] }))).rows[0]?.y) || 0) // CNES é snapshot por competência (sem coluna ano)
      : await maxAno({ financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc" }[f.id] || "financas_sc", f.id === "contratos" ? "ano_compra" : "ano");
    await db.query(`UPDATE etl_catalogo SET max_ano=$1, devido=$2, atualizado_em=now() WHERE id=$3`, [ma, devido, f.id]);
    const roda = SOLIC ? solicitado : (devido || solicitado);
    plano.push({ f, roda });
    log(`  ${roda ? "RODA    " : "ok      "} ${f.id.padEnd(14)} max_ano=${ma}${solicitado ? " [solicitado]" : ""}`);
  }
  const devidos = plano.filter((p) => p.roda);
  log(`→ ${devidos.length} fonte(s) a coletar: ${devidos.map((p) => p.f.id).join(", ") || "(nenhuma)"}`);
  if (MODO === "plan") { log("MODO=plan — nada executado. Use MODO=run (ou =solicitados) para coletar."); await db.end(); return; }

  // 2) executar devidos, SERIAL por API (grupos diferentes em paralelo)
  const grupos = {};
  for (const p of devidos) (grupos[p.f.api] ??= []).push(p.f);
  await Promise.all(Object.values(grupos).map(async (lista) => {
    for (const f of lista) {
      const status = await rodar(f); // rodar() já é supervisionado e grava o estado no catálogo
      await db.query(`UPDATE etl_catalogo SET solicitado=false WHERE id=$1`, [f.id]).catch(() => {}); // limpa pedido manual atendido
      log(`✔ ${f.id}: ${status}`);
    }
  }));
  // 3) validação final + 4) regenerar documentação — só no ciclo completo (run), não no atende-solicitações
  if (MODO === "run") {
    const rodarScript = (s) => new Promise((res) => { const c = spawn(process.execPath, [s], { cwd: ROOT, stdio: "ignore" }); c.on("exit", () => res()); c.on("error", () => res()); });
    log("validando integridade…"); await rodarScript("scripts/auditoria_dados_sc.mjs");
    log("regenerando documentação…"); await rodarScript("scripts/gerar_documentacao.mjs");
  }
  log("ciclo concluído.");
  await db.end();
}
main().catch((e) => { log("ERRO FATAL: " + e); process.exit(1); });
