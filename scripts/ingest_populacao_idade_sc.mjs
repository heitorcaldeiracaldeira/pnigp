// ETL — População por idade (0-17) por município de SC, IBGE Censo 2022 via SIDRA (tabela 9514). Habilita os indicadores
// de DEMANDA/déficit: vagas de creche (0-3), pré-escola (4-5), fundamental (6-14), médio (15-17). node scripts/ingest_populacao_idade_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const ANO = 2022;
const ages = Array.from({ length: 18 }, (_, i) => 6557 + i); // 6557=0 (menos de 1) … 6574=17 anos
const URL = `https://apisidra.ibge.gov.br/values/t/9514/n6/in%20n3%2042/v/93/p/${ANO}/c2/6794/c287/${ages.join(",")}/c286/113635`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS populacao_idade_sc (
    cod_ibge TEXT PRIMARY KEY, ano INTEGER, creche_0_3 INTEGER, pre_4_5 INTEGER, fund_6_14 INTEGER, medio_15_17 INTEGER, pop_0_17 INTEGER, idades JSONB)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1500 * (t + 1)); } } throw new Error("db"); };

  console.log("Baixando SIDRA (Censo 2022, idades 0-17, todos os municípios de SC)…");
  let data = null;
  for (let t = 0; t < 5; t++) { try { const r = await fetch(URL, { signal: AbortSignal.timeout(90000) }); if (!r.ok) throw 0; data = await r.json(); break; } catch { await sleep(3000 * (t + 1)); } }
  if (!data) throw new Error("SIDRA falhou");
  const rows = data.slice(1); // 1ª linha = cabeçalho
  // agrega por município → idade(anos) → valor
  const mun = new Map();
  for (const r of rows) {
    const cod6 = r.D1C; const idadeNome = r.D5N; const v = parseInt(r.V, 10);
    if (!cod6 || isNaN(v)) continue;
    // idade em anos: "Menos de 1 ano"=0; "N ano(s)"=N
    const a = /menos de 1/i.test(idadeNome) ? 0 : parseInt(idadeNome, 10);
    if (isNaN(a)) continue;
    const m = mun.get(cod6) || {}; m[a] = (m[a] || 0) + v; mun.set(cod6, m);
  }
  let grav = 0;
  for (const [cod6, idades] of mun) {
    const ibge7 = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE substring(cod_ibge,1,6)=$1 AND tipo='M' LIMIT 1`, [cod6])).rows[0]?.cod_ibge || cod6;
    const soma = (lo, hi) => { let s = 0; for (let a = lo; a <= hi; a++) s += idades[a] || 0; return s; };
    const creche = soma(0, 3), pre = soma(4, 5), fund = soma(6, 14), medio = soma(15, 17), tot = soma(0, 17);
    await q(`INSERT INTO populacao_idade_sc (cod_ibge,ano,creche_0_3,pre_4_5,fund_6_14,medio_15_17,pop_0_17,idades) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano, creche_0_3=EXCLUDED.creche_0_3, pre_4_5=EXCLUDED.pre_4_5, fund_6_14=EXCLUDED.fund_6_14, medio_15_17=EXCLUDED.medio_15_17, pop_0_17=EXCLUDED.pop_0_17, idades=EXCLUDED.idades`,
      [ibge7, ANO, creche, pre, fund, medio, tot, JSON.stringify(idades)]);
    grav++;
  }
  const r = await db.query(`SELECT count(*) entes, sum(creche_0_3) creche, sum(pre_4_5) pre FROM populacao_idade_sc`);
  console.log(`População por idade concluída: ${grav} municípios · ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
