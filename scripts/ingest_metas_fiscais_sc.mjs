// ETL — Metas Fiscais (LDO) REAIS via SICONFI (RREO Anexo 06: Resultado Primário e Nominal).
// Meta fixada no Anexo de Metas Fiscais da LDO × resultado realizado, por ente e ano.
// node scripts/ingest_metas_fiscais_sc.mjs   (env ANOS opcional, default 2021,2022,2023,2024)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024];
const API = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getAnexo06(idEnte, esfera, ano) {
  const url = `${API}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2006&id_ente=${idEnte}&co_esfera=${esfera}`;
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      return j.items || [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;
}

// valor por (substring do cod_conta, substring da coluna)
function val(items, codSub, colSub) {
  const it = items.find((x) => String(x.cod_conta || "").includes(codSub) && String(x.coluna || "").toUpperCase().includes(colSub.toUpperCase()));
  return it ? Number(it.valor) || 0 : null;
}

function extrair(items) {
  if (!items || !items.length) return null;
  const meta_primario = val(items, "MetaDeResultadoPrimario", "VALOR CORRENTE");
  const meta_nominal = val(items, "MetaDeResultadoNominal", "VALOR CORRENTE");
  const resultado_primario = val(items, "ResultadoPrimarioSemRPPSAcimaDaLinha", "VALOR");
  const resultado_nominal = val(items, "ResultadoNominalAcimaDaLinhaSemRPPS", "VALOR");
  const receita_prim_prev = val(items, "ReceitaPrimariaTotalExcetoFontesRPPS", "PREVISÃO");
  const receita_prim_real = val(items, "ReceitaPrimariaTotalExcetoFontesRPPS", "REALIZADAS");
  const despesa_prim_dot = val(items, "DespesaPrimariaTotalExcetoFontesRPPS", "DOTAÇÃO");
  const despesa_prim_emp = val(items, "DespesaPrimariaTotalExcetoFontesRPPS", "EMPENHADAS");
  const dcl_inicio = val(items, "DividaConsolidadaLiquida", "EM 31/12");
  const dcl_fim = val(items, "DividaConsolidadaLiquida", "ATÉ O BIMESTRE");
  // sem nenhuma meta/resultado → sem dados úteis
  if ([meta_primario, meta_nominal, resultado_primario, resultado_nominal].every((v) => v === null)) return null;
  return { meta_primario, meta_nominal, resultado_primario, resultado_nominal, receita_prim_prev, receita_prim_real, despesa_prim_dot, despesa_prim_emp, dcl_inicio, dcl_fim };
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 30 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS metas_fiscais_sc (
      cod_ibge TEXT, ano INTEGER,
      meta_primario NUMERIC(16,2), resultado_primario NUMERIC(16,2),
      meta_nominal NUMERIC(16,2), resultado_nominal NUMERIC(16,2),
      receita_prim_prev NUMERIC(16,2), receita_prim_real NUMERIC(16,2),
      despesa_prim_dot NUMERIC(16,2), despesa_prim_emp NUMERIC(16,2),
      dcl_inicio NUMERIC(16,2), dcl_fim NUMERIC(16,2),
      PRIMARY KEY (cod_ibge, ano) );
    CREATE TABLE IF NOT EXISTS metas_fiscais_feitos (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano));`);
  const q = async (sql, params) => { for (let t = 0; t < 6; t++) { try { return await db.query(sql, params); } catch { await sleep(900 * (t + 1)); } } throw new Error("db indisponível"); };
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY tipo DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge, ano FROM metas_fiscais_feitos`)).rows.map((r) => `${r.cod_ibge}-${r.ano}`));
  const tarefas = [];
  for (const e of entes) for (const ano of ANOS) if (!feitos.has(`${e.cod_ibge}-${ano}`)) tarefas.push({ ...e, ano });
  console.log(`Metas Fiscais (LDO/SICONFI): ${tarefas.length} tarefas (ente×ano) de ${entes.length} entes...`);
  let comDados = 0;
  await pool(tarefas, 3, async (t) => {
    try {
      const esfera = t.tipo === "E" ? "E" : "M";
      const idEnte = t.tipo === "E" ? "42" : t.cod_ibge;
      const items = await getAnexo06(idEnte, esfera, t.ano);
      if (items === null) return; // erro de rede — retoma depois (não marca feito)
      const d = extrair(items);
      if (d) {
        await q(`INSERT INTO metas_fiscais_sc (cod_ibge,ano,meta_primario,resultado_primario,meta_nominal,resultado_nominal,receita_prim_prev,receita_prim_real,despesa_prim_dot,despesa_prim_emp,dcl_inicio,dcl_fim)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (cod_ibge,ano) DO UPDATE SET meta_primario=EXCLUDED.meta_primario,resultado_primario=EXCLUDED.resultado_primario,meta_nominal=EXCLUDED.meta_nominal,resultado_nominal=EXCLUDED.resultado_nominal,receita_prim_prev=EXCLUDED.receita_prim_prev,receita_prim_real=EXCLUDED.receita_prim_real,despesa_prim_dot=EXCLUDED.despesa_prim_dot,despesa_prim_emp=EXCLUDED.despesa_prim_emp,dcl_inicio=EXCLUDED.dcl_inicio,dcl_fim=EXCLUDED.dcl_fim`,
          [t.cod_ibge, t.ano, d.meta_primario, d.resultado_primario, d.meta_nominal, d.resultado_nominal, d.receita_prim_prev, d.receita_prim_real, d.despesa_prim_dot, d.despesa_prim_emp, d.dcl_inicio, d.dcl_fim]);
        comDados++;
      }
      await q(`INSERT INTO metas_fiscais_feitos (cod_ibge,ano) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [t.cod_ibge, t.ano]);
    } catch (err) { console.log(`  ! falha ${t.cod_ibge}/${t.ano} (${String(err).slice(0, 35)})`); }
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) e FROM metas_fiscais_sc`);
  console.log(`Concluído: ${comDados} registros gravados | total ${c.rows[0].n} linhas em ${c.rows[0].e} entes`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
