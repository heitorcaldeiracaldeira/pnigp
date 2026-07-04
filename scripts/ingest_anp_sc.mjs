// ETL — ANP preços de combustíveis por município. Fonte: gov.br/anp .../shpc/dsas/ca/ca-YYYY-SS.csv (semestral, latin1, ;).
// Agrega preço médio de venda por (município, ano, semestre, produto). Série pública neste path vai até 2021-02
// (2022+ está em dataset reorganizado — TODO). State-agnostic (UF env). node scripts/ingest_anp_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const BASE = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsas/ca/";
const SEMS = (process.env.SEMS || "2019-01,2019-02,2020-01,2020-02,2021-01,2021-02").split(",");
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nBR = (s) => { const x = Number(String(s || "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : null; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byName = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  await db.query(`CREATE TABLE IF NOT EXISTS anp_precos_sc (cod_ibge TEXT, ano INTEGER, semestre INTEGER, produto TEXT, preco_medio NUMERIC, n_coletas INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, semestre, produto))`);
  let totLidos = 0, totMatch = 0;
  for (const sem of SEMS) {
    const [ano, ss] = sem.split("-").map(Number);
    const csv = process.env.DIR ? path.join(process.env.DIR, `anp_${sem}.csv`) : path.join(os.tmpdir(), `anp_${sem}.csv`);
    if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e5) { try { execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", csv, BASE + `ca-${sem}.csv`], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e5) { console.log(`  ⚠ ${sem}: sem arquivo`); continue; }

    const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
    let H = null, ix = {}; const agg = new Map(); // cod|produto -> {s,n}
    for await (const line of rl) {
      const c = line.split(";");
      if (!H) { H = c.map((h) => h.trim()); ix = { uf: H.indexOf("Estado - Sigla"), mun: H.indexOf("Municipio"), prod: H.indexOf("Produto"), val: H.indexOf("Valor de Venda") }; continue; }
      if ((c[ix.uf] || "").trim().toUpperCase() !== UF) continue;
      totLidos++;
      const cod = byName.get(norm(c[ix.mun])); if (!cod) continue;
      const v = nBR(c[ix.val]); if (v == null) continue;
      const prod = (c[ix.prod] || "").trim(); if (!prod) continue;
      const k = cod + "|" + prod;
      if (!agg.has(k)) agg.set(k, { cod, prod, s: 0, n: 0 });
      const a = agg.get(k); a.s += v; a.n++; totMatch++;
    }
    for (const a of agg.values()) {
      await db.query(`INSERT INTO anp_precos_sc (cod_ibge,ano,semestre,produto,preco_medio,n_coletas,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now())
        ON CONFLICT (cod_ibge,ano,semestre,produto) DO UPDATE SET preco_medio=EXCLUDED.preco_medio,n_coletas=EXCLUDED.n_coletas,atualizado=now()`,
        [a.cod, ano, ss, a.prod, +(a.s / a.n).toFixed(3), a.n]);
    }
    console.log(`  ✓ ${sem}: ${agg.size} (município×produto)`);
  }
  const chk = (await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) m, count(distinct produto) prods, min(ano) mi, max(ano) ma FROM anp_precos_sc`)).rows[0];
  console.log(`✔ anp_precos_sc: ${chk.linhas} linhas · ${chk.m} municípios · ${chk.prods} produtos · ${chk.mi}-${chk.ma} (SC lidos ${totLidos}, casados ${totMatch})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
