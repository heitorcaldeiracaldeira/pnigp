// ETL — Receitas DETALHADAS por item nominal (IPTU, ISS, FPM, ICMS, IPVA, ITR, FUNDEB) via SICONFI
// RREO Anexo 03 (Demonstrativo da RCL). Soma os 12 meses (colunas <MR-11..MR>) = total anual.
// node scripts/ingest_receitas_detalhe_sc.mjs   (ANOS opcional)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = new Date().getFullYear();
const ANOS = (process.env.ANOS || `${ANO - 4},${ANO - 3},${ANO - 2},${ANO - 1}`).split(",").map(Number);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
// conta oficial -> rótulo curto
const ITENS = {
  "IPTU": "IPTU", "ISS": "ISS", "ITBI": "ITBI", "IRRF": "IRRF",
  "Cota-Parte do FPM": "FPM", "Cota-Parte do ICMS": "ICMS", "Cota-Parte do IPVA": "IPVA", "Cota-Parte do ITR": "ITR",
  "Transferências da LC nº 61/1989": "IPI-Exportação",
  "Transferências do FUNDEB": "FUNDEB",
  "Rendimentos de Aplicação Financeira": "Rend. Aplicação",
  "RECEITA CORRENTE LÍQUIDA (III) = (I - II)": "RCL",
};

async function fetchAnexo(ano, id, esfera) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2003&co_esfera=${esfera}&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      return (await r.json()).items || [];
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
const ehMes = (col) => /^<MR(-\d+)?>$/.test(String(col || "").trim()); // colunas mensais dos últimos 12 meses

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS receitas_detalhe_sc (cod_ibge TEXT, ano INTEGER, item TEXT, valor NUMERIC, PRIMARY KEY (cod_ibge, ano, item))`);
  await db.query(`CREATE TABLE IF NOT EXISTS receitas_det_check (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY tipo='E' DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM receitas_det_check`)).rows.map((r) => r.k));
  let grav = 0, proc = 0;
  for (const ano of ANOS) {
    for (const e of entes) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const items = await fetchAnexo(ano, e.cod_ibge, e.tipo === "E" ? "E" : "M");
      if (items == null) continue;
      const acc = {};
      for (const x of items) {
        const rot = ITENS[String(x.conta || "").trim()];
        if (rot && ehMes(x.coluna)) acc[rot] = (acc[rot] || 0) + (Number(x.valor) || 0);
      }
      for (const [item, valor] of Object.entries(acc)) {
        if (valor === 0) continue;
        await q(`INSERT INTO receitas_detalhe_sc (cod_ibge,ano,item,valor) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge,ano,item) DO UPDATE SET valor=EXCLUDED.valor`, [e.cod_ibge, ano, item, Math.round(valor * 100) / 100]);
        grav++;
      }
      await q(`INSERT INTO receitas_det_check (cod_ibge,ano) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [e.cod_ibge, ano]);
      proc++;
      if (proc % 40 === 0) console.log(`  ${ano}: ${proc} entes (gravados ${grav})`);
      await sleep(100);
    }
    console.log(`Ano ${ano} concluído.`);
  }
  const c = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n FROM receitas_detalhe_sc`);
  console.log(`Receitas detalhe concluído: ${grav} nesta rodada · ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
