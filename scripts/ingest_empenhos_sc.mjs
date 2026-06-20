// ETL — Empenhos por contrato (PNCP, Lei 14.133). Endpoint /contratos/{ano}/{seq}/empenhos.
// Hoje a cobertura em SC é ~0 (municípios ainda não publicam o ciclo), mas o coletor "acende sozinho"
// quando passarem a publicar. Resumível: só rechecam contratos recentes não vistos há >14 dias.
// node scripts/ingest_empenhos_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();
const ANO_MIN = Number(process.env.ANO_MIN || ANO - 1); // só contratos recentes (onde o ciclo tende a aparecer)
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const d10 = (s) => (s ? String(s).slice(0, 10) : null);

async function buscarEmpenhos(cnpj, ano, seq) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${ano}/${seq}/empenhos`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return []; // sem empenho (rota válida, contrato vazio)
      if (!r.ok) throw 0;
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(1200 * (t + 1)); }
  }
  return null; // falha de rede — não marca como checado
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS empenhos_sc (
    cod_ibge TEXT, cnpj_compra TEXT, ano_compra INTEGER, seq_compra INTEGER, seq_empenho INTEGER,
    numero TEXT, valor NUMERIC, data DATE, raw JSONB, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj_compra, ano_compra, seq_compra, seq_empenho) )`);
  await db.query(`CREATE TABLE IF NOT EXISTS empenhos_check (cnpj_compra TEXT, ano_compra INTEGER, seq_compra INTEGER, checado timestamptz DEFAULT now(), n INTEGER DEFAULT 0, PRIMARY KEY (cnpj_compra, ano_compra, seq_compra))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  const pend = (await db.query(`
    SELECT DISTINCT c.cnpj_compra cn, c.ano_compra an, c.seq_compra sq, c.cod_ibge
      FROM contratos_sc c
      LEFT JOIN empenhos_check k ON k.cnpj_compra=c.cnpj_compra AND k.ano_compra=c.ano_compra AND k.seq_compra=c.seq_compra
     WHERE c.cnpj_compra IS NOT NULL AND c.ano_compra >= $1 AND (k.checado IS NULL OR k.checado < now() - interval '14 days')`, [ANO_MIN]).catch(() => ({ rows: [] }))).rows;
  console.log(`Empenhos: ${pend.length} contratos recentes a verificar (>= ${ANO_MIN})...`);
  let comEmp = 0, totalEmp = 0, proc = 0;
  for (const c of pend) {
    const emps = await buscarEmpenhos(c.cn, c.an, c.sq);
    if (emps == null) continue; // rede falhou — tenta na próxima
    let i = 0;
    for (const e of emps) {
      i++;
      await q(`INSERT INTO empenhos_sc (cod_ibge,cnpj_compra,ano_compra,seq_compra,seq_empenho,numero,valor,data,raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (cnpj_compra,ano_compra,seq_compra,seq_empenho) DO UPDATE SET numero=EXCLUDED.numero,valor=EXCLUDED.valor,data=EXCLUDED.data,raw=EXCLUDED.raw,atualizado=now()`,
        [c.cod_ibge, c.cn, c.an, c.sq, i, String(e.numeroEmpenho ?? e.numero ?? i), Number(e.valorEmpenho ?? e.valor ?? e.valorTotalEmpenho) || null, d10(e.dataEmpenho ?? e.data), JSON.stringify(e)]);
    }
    if (emps.length) { comEmp++; totalEmp += emps.length; }
    await q(`INSERT INTO empenhos_check (cnpj_compra,ano_compra,seq_compra,checado,n) VALUES ($1,$2,$3,now(),$4)
             ON CONFLICT (cnpj_compra,ano_compra,seq_compra) DO UPDATE SET checado=now(), n=EXCLUDED.n`, [c.cn, c.an, c.sq, emps.length]);
    proc++;
    if (proc % 50 === 0) console.log(`  …${proc}/${pend.length} (com empenho: ${comEmp})`);
    await sleep(120);
  }
  console.log(`Concluído: ${proc} verificados · ${comEmp} contratos com empenho · ${totalEmp} empenhos gravados.`);
  if (comEmp === 0) console.log("(cobertura 0 — municípios ainda não publicam o ciclo no PNCP; coletor pronto p/ acender quando publicarem)");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
