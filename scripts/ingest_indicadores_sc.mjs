// ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita).
// Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, unidade, fonte).
// node scripts/ingest_indicadores_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getJson(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;
}

// IBGE — PIB municipal (agregado 5938, variável 37 = PIB a preços correntes, mil reais)
async function pibIBGE(ano) {
  const j = await getJson(`https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/${ano}/variaveis/37?localidades=N6%5BN3%5B42%5D%5D`);
  const series = j?.[0]?.resultados?.[0]?.series || [];
  const m = {};
  for (const s of series) { const v = Number(Object.values(s.serie)[0]); if (s.localidade?.id && Number.isFinite(v)) m[s.localidade.id] = v; }
  return m; // cod_ibge -> PIB (mil reais)
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS indicadores_sc (
      cod_ibge TEXT, ano INTEGER, codigo TEXT, area TEXT, valor NUMERIC, unidade TEXT, fonte TEXT,
      PRIMARY KEY (cod_ibge, ano, codigo) );`);
  const q = async (sql, params) => { for (let t = 0; t < 6; t++) { try { return await db.query(sql, params); } catch { await sleep(900 * (t + 1)); } } throw new Error("db indisponível"); };
  const entes = (await db.query(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M'`)).rows;
  const pop = Object.fromEntries(entes.map((e) => [e.cod_ibge, Number(e.populacao) || 0]));

  const ANO_PIB = 2021; // último PIB municipal publicado pelo IBGE
  console.log(`ECONOMIA — PIB per capita (IBGE ${ANO_PIB})...`);
  const pib = await pibIBGE(ANO_PIB);
  let n = 0;
  for (const [cod, pibMil] of Object.entries(pib)) {
    const p = pop[cod]; if (!p) continue;
    const pibPerCapita = Math.round((pibMil * 1000) / p); // R$/hab
    await q(`INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,$2,'pib_per_capita','economia',$3,'R$/hab','IBGE')
             ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [cod, ANO_PIB, pibPerCapita]);
    n++;
  }
  const c = await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) e FROM indicadores_sc`);
  console.log(`Concluído: ${n} municípios c/ PIB per capita | total indicadores_sc: ${c.rows[0].n} em ${c.rows[0].e} entes`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
