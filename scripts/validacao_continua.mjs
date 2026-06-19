// VALIDAÇÃO CONTÍNUA — auditor independente do coletor (só lê + flaga, nunca atrapalha a coleta).
// A cada INTERVALO: aplica regras de integridade, marca anomalias IMPOSSÍVEIS como suspeitas
// (auto-flag) e grava um selo de qualidade em coleta_qa (lido pela tela /coleta). node scripts/validacao_continua.mjs
import fs from "fs"; import pg from "pg";

const DATABASE_URL = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const INTERVALO_MS = 5 * 60 * 1000;
const LOG = "C:/Users/PC/.claude/jobs/2783694f/tmp/validacao.log";
const log = (m) => { const l = `[QA ${new Date().toISOString()}] ${m}\n`; try { fs.appendFileSync(LOG, l); } catch {} process.stdout.write(l); };

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
db.on("error", () => {});
const n1 = async (s) => Number((await db.query(s)).rows[0]?.n ?? 0);
const n1safe = async (s) => { try { return Number((await db.query(s)).rows[0]?.n ?? 0); } catch { return -1; } }; // -1 = tabela ainda não existe

async function ensure() {
  await db.query(`ALTER TABLE financas_sc ADD COLUMN IF NOT EXISTS suspeito BOOLEAN DEFAULT FALSE`);
  await db.query(`ALTER TABLE financas_sc ADD COLUMN IF NOT EXISTS qa_motivo TEXT`);
  try { await db.query(`ALTER TABLE rgf_sc ADD COLUMN IF NOT EXISTS suspeito BOOLEAN DEFAULT FALSE`); await db.query(`ALTER TABLE rgf_sc ADD COLUMN IF NOT EXISTS qa_motivo TEXT`); } catch {}
  await db.query(`CREATE TABLE IF NOT EXISTS coleta_qa (id int PRIMARY KEY, ts timestamptz, status text, suspeitos int, alertas int, regras jsonb)`);
  await db.query(`INSERT INTO coleta_qa (id,ts,status,suspeitos,alertas,regras) VALUES (1,now(),'iniciando',0,0,'{}') ON CONFLICT (id) DO NOTHING`);
}

async function ciclo() {
  // 1) AUTO-FLAG de registros IMPOSSÍVEIS (preserva o bruto, exclui das análises)
  const flag = async (cond, motivo) =>
    (await db.query(`UPDATE financas_sc SET suspeito=TRUE, qa_motivo=$1 WHERE (${cond}) AND suspeito IS NOT TRUE`, [motivo])).rowCount;
  let novos = 0;
  novos += await flag("pessoal>receita AND receita>0", "pessoal>receita (impossível) — re-coletar quando a fonte republicar");
  novos += await flag("receita<=0 AND despesa>0", "receita ausente com despesa registrada — registro incompleto da fonte");
  novos += await flag("investimento<0 OR divida<0", "valor negativo impossível em investimento/dívida");
  novos += await flag("tributaria>receita AND receita>0", "receita tributária > receita total (impossível)");
  // RGF: pessoal_pct implausível (>70% da RCL) — quase sempre RCL parcial/erro de declaração
  try { novos += (await db.query(`UPDATE rgf_sc SET suspeito=TRUE, qa_motivo='pessoal_pct implausível (>70% RCL) — RCL parcial/erro de declaração' WHERE pessoal_pct>70 AND suspeito IS NOT TRUE`)).rowCount; } catch {}

  // 2) CONTAGEM de regras (impossíveis já flagadas + sinais)
  const regras = {
    financas_suspeitos: await n1(`SELECT count(*) n FROM financas_sc WHERE suspeito IS TRUE`),
    rgf_suspeitos: await n1safe(`SELECT count(*) n FROM rgf_sc WHERE suspeito IS TRUE`),
    // SOBREPREÇO REAL = preço UNITÁRIO homologado > estimado (item a item) — único jeito honesto de medir.
    // O total do contrato não serve: diferença pode ser só quantidade (registro de preços/credenciamento).
    itens_sobrepreco_unitario: await n1safe(`SELECT count(*) n FROM itens_sc WHERE unit_homologado>unit_estimado AND unit_estimado>0`),
    itens_coletados: await n1safe(`SELECT count(*) n FROM itens_sc`),
    compras_variacao_total_neg: await n1(`SELECT count(*) n FROM compras_sc WHERE economia_pct<0`), // só informativo: efeito de quantidade, NÃO sobrepreço
    compras_pct_fora: await n1(`SELECT count(*) n FROM compras_sc WHERE dispensa_pct<0 OR dispensa_pct>100`),
    compras_valor_neg: await n1(`SELECT count(*) n FROM compras_sc WHERE valor_homologado<0`),
    contratos_valor_neg: await n1(`SELECT count(*) n FROM contratos_sc WHERE valor_global<0`),
    transf_valor_neg: await n1(`SELECT count(*) n FROM transferencias_sc WHERE valor_total<0`),
    metas_vazias: await n1(`SELECT count(*) n FROM metas_fiscais_sc WHERE meta_primario IS NULL AND resultado_primario IS NULL`),
  };
  const suspeitos = regras.financas_suspeitos + Math.max(0, regras.rgf_suspeitos);
  const alertas = Math.max(0, regras.itens_sobrepreco_unitario); // sobrepreço unitário real (0 enquanto itens não coletados)
  // impossíveis que NÃO puderam ser flagados (não têm coluna suspeito) → erro real a tratar
  const errosReais = regras.compras_pct_fora + regras.compras_valor_neg + regras.contratos_valor_neg + regras.transf_valor_neg;
  // integridade: verde se não há erro real (suspeitos já flagados/excluídos; sobrepreço é sinal, não erro)
  const status = errosReais > 0 ? "erro" : "ok";

  await db.query(`UPDATE coleta_qa SET ts=now(), status=$1, suspeitos=$2, alertas=$3, regras=$4 WHERE id=1`,
    [status, suspeitos, alertas, JSON.stringify(regras)]);
  log(`status=${status} | novos flags=${novos} | suspeitos=${suspeitos} | alertas(sobrepreço)=${alertas} | errosReais=${errosReais}`);
}

async function main() {
  await ensure();
  // ONESHOT=1 → roda 1 ciclo e sai (modo agendado pelo SO: religável, sobrevive a reboot/crash).
  if (process.env.ONESHOT === "1") {
    try { await ciclo(); } catch (e) { log("erro no ciclo: " + String(e).slice(0, 80)); }
    await db.end();
    return;
  }
  log(`############ VALIDAÇÃO CONTÍNUA INICIADA (intervalo ${INTERVALO_MS / 60000}min) ############`);
  for (;;) {
    try { await ciclo(); } catch (e) { log("erro no ciclo: " + String(e).slice(0, 80)); }
    await new Promise((s) => setTimeout(s, INTERVALO_MS));
  }
}
main().catch((e) => { log("ERRO FATAL: " + e); process.exit(1); });
