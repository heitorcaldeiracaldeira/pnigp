// ALERTA de CRP — varre o último CRP de cada ente (rpps_crp_sc), classifica por urgência e detecta
// TRANSIÇÕES desde a última varredura (entrou em vencido / ≤30d / ≤90d, ou regularizou). É o "ponto cego":
// avisa o I10 quando um ente VIRA risco, sem precisar abrir a tela. Idempotente: só registra evento quando
// a categoria muda (snapshot em crp_alerta_estado). Saída durável: crp_alertas (feed lido pelo Radar).
//   node scripts/alerta_crp.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// urgência por dias até o vencimento (mesma régua da UI)
const SEV = { REGULAR: 0, VENCE_90: 1, VENCE_30: 2, VENCIDO: 3 };
const cat = (dias) => (dias == null ? "REGULAR" : dias < 0 ? "VENCIDO" : dias <= 30 ? "VENCE_30" : dias <= 90 ? "VENCE_90" : "REGULAR");
function evento(prev, atual) {
  if (SEV[atual] > SEV[prev]) return atual === "VENCIDO" ? "entrou_vencido" : atual === "VENCE_30" ? "entrou_30" : "entrou_90";
  if (SEV[atual] < SEV[prev]) return atual === "REGULAR" ? "regularizou" : "melhorou";
  return null; // mesma categoria → nada a registrar
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  await q(`CREATE TABLE IF NOT EXISTS crp_alerta_estado (cod_ibge TEXT PRIMARY KEY, categoria TEXT, dias INTEGER, atualizado timestamptz DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS crp_alertas (id SERIAL PRIMARY KEY, cod_ibge TEXT, nome TEXT, eh_estado BOOLEAN, evento TEXT, categoria_de TEXT, categoria_para TEXT, dias INTEGER, validade TEXT, nr_crp TEXT, criado timestamptz DEFAULT now())`);

  // último CRP por ente (municípios + Governo do Estado)
  const rows = (await q(`
    WITH ult AS (
      SELECT DISTINCT ON (r.cod_ibge) r.cod_ibge, r.nr_crp, to_char(r.dt_validade,'DD/MM/YYYY') validade, (r.dt_validade - current_date) dias
      FROM rpps_crp_sc r ORDER BY r.cod_ibge, r.dt_emissao DESC)
    SELECT u.cod_ibge, e.nome, e.tipo, u.nr_crp, u.validade, u.dias
    FROM ult u JOIN entes_sc e ON e.cod_ibge = u.cod_ibge WHERE e.tipo IN ('M','E')`)).rows;
  if (!rows.length) { console.log("[ALERTA CRP] rpps_crp_sc vazia — rode ingest_rpps_crp antes."); await db.end(); return; }

  const prev = new Map((await q(`SELECT cod_ibge, categoria FROM crp_alerta_estado`)).rows.map((r) => [r.cod_ibge, r.categoria]));
  const primeira = prev.size === 0;
  let novos = 0;
  for (const r of rows) {
    const dias = r.dias == null ? null : Number(r.dias);
    const atual = cat(dias);
    const anterior = prev.get(r.cod_ibge) ?? "REGULAR"; // não visto = trata como regular → entradas em risco geram alerta
    const ev = evento(anterior, atual);
    if (ev) {
      await q(`INSERT INTO crp_alertas (cod_ibge,nome,eh_estado,evento,categoria_de,categoria_para,dias,validade,nr_crp)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.cod_ibge, r.nome, r.tipo === "E", ev, anterior, atual, dias, r.validade, r.nr_crp]);
      novos++;
    }
    await q(`INSERT INTO crp_alerta_estado (cod_ibge,categoria,dias,atualizado) VALUES ($1,$2,$3,now())
             ON CONFLICT (cod_ibge) DO UPDATE SET categoria=EXCLUDED.categoria, dias=EXCLUDED.dias, atualizado=now()`,
      [r.cod_ibge, atual, dias]);
  }
  const resumo = (await q(`SELECT categoria, count(*) n FROM crp_alerta_estado GROUP BY categoria ORDER BY 1`)).rows;
  console.log(`[ALERTA CRP] ${rows.length} entes varridos · ${novos} novo(s) evento(s)${primeira ? " (varredura inicial — backlog atual)" : ""} · estado: ${JSON.stringify(resumo)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
