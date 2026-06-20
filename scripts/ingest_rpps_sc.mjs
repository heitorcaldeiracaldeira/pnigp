// ETL — Previdência (RPPS) por município/Estado de SC. Fonte: SICONFI RREO Anexo 04.
// Receitas × despesas previdenciárias, resultado do fundo, contribuições e benefícios. Só entes COM RPPS.
// Idempotente/resumível. node scripts/ingest_rpps_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();
const ANOS = (process.env.ANOS || `${ANO - 2},${ANO - 1}`).split(",").map(Number);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";

async function fetchAnexo(ano, id, esfera) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2004&co_esfera=${esfera}&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      return (await r.json()).items || [];
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
function extrair(items) {
  const val = (re, col) => items.filter((x) => re.test(x.conta || "") && (x.coluna || "").includes(col)).reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const receita = val(/TOTAL DAS RECEITAS.*(CAPITALIZA|FINANCEIRO)/i, "RECEITAS REALIZADAS");
  const despesa = val(/TOTAL DAS DESPESAS.*(CAPITALIZA|FINANCEIRO)/i, "DESPESAS LIQUIDADAS");
  if (receita <= 0 && despesa <= 0) return null; // sem RPPS (ente no RGPS/INSS)
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    receita: r2(receita), despesa: r2(despesa), resultado: r2(receita - despesa),
    contrib_segurados: r2(val(/Receita de Contribuições dos Segurados/i, "RECEITAS REALIZADAS")),
    contrib_patronais: r2(val(/Receita de Contribuições Patronais/i, "RECEITAS REALIZADAS")),
    aposentadorias: r2(val(/^Aposentadorias/i, "DESPESAS LIQUIDADAS")),
    pensoes: r2(val(/Pens(ã|õ)es/i, "DESPESAS LIQUIDADAS")),
  };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS rpps_sc (
    cod_ibge TEXT, ano INTEGER, receita NUMERIC, despesa NUMERIC, resultado NUMERIC,
    contrib_segurados NUMERIC, contrib_patronais NUMERIC, aposentadorias NUMERIC, pensoes NUMERIC,
    PRIMARY KEY (cod_ibge, ano) )`);
  await db.query(`CREATE TABLE IF NOT EXISTS rpps_check (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY tipo='E' DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM rpps_check`)).rows.map((r) => r.k));
  let comRpps = 0, proc = 0;
  for (const ano of ANOS) {
    for (const e of entes) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const items = await fetchAnexo(ano, e.cod_ibge, e.tipo === "E" ? "E" : "M"); // SICONFI usa IBGE de 7 dígitos (não slice!)
      if (items == null) continue; // rede falhou — tenta na próxima
      const d = extrair(items);
      if (d) {
        await q(`INSERT INTO rpps_sc (cod_ibge,ano,receita,despesa,resultado,contrib_segurados,contrib_patronais,aposentadorias,pensoes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (cod_ibge,ano) DO UPDATE SET receita=EXCLUDED.receita,despesa=EXCLUDED.despesa,resultado=EXCLUDED.resultado,contrib_segurados=EXCLUDED.contrib_segurados,contrib_patronais=EXCLUDED.contrib_patronais,aposentadorias=EXCLUDED.aposentadorias,pensoes=EXCLUDED.pensoes`,
          [e.cod_ibge, ano, d.receita, d.despesa, d.resultado, d.contrib_segurados, d.contrib_patronais, d.aposentadorias, d.pensoes]);
        comRpps++;
      }
      await q(`INSERT INTO rpps_check (cod_ibge,ano) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [e.cod_ibge, ano]);
      proc++;
      if (proc % 40 === 0) console.log(`  ${ano}: ${proc} processados (com RPPS: ${comRpps})`);
      await sleep(120);
    }
    console.log(`Ano ${ano} concluído.`);
  }
  const c = await db.query(`SELECT count(distinct cod_ibge) entes, count(*) FILTER(WHERE resultado<0) deficit FROM rpps_sc`);
  console.log(`RPPS concluído: ${comRpps} registros · ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
