// ETL — Notas Fiscais / Instrumentos de Cobrança (PNCP, API de Consulta /v1/instrumentoscobranca).
// Traz chave NFe + vínculo ao contrato. Hoje cobertura em SC ~0 (municípios não publicam ainda);
// coletor pronto p/ acender quando publicarem. Resumível por órgão. node scripts/ingest_nf_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();
const DI = `${process.env.ANO_MIN || ANO - 1}0101`, DF = `${ANO}1231`;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const d10 = (s) => (s ? String(s).slice(0, 10) : null);

async function pagina(cnpj, pg_) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/instrumentoscobranca/inclusao?dataInicial=${DI}&dataFinal=${DF}&cnpjOrgao=${cnpj}&pagina=${pg_}&tamanhoPagina=50`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 404 || r.status === 204) return { data: [], totalPaginas: 0 };
      if (!r.ok) throw 0;
      return await r.json();
    } catch { await sleep(1200 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS nf_sc (
    cod_ibge TEXT, cnpj_orgao TEXT, ano INTEGER, seq_contrato INTEGER, seq_instrumento INTEGER,
    tipo INTEGER, numero TEXT, chave_nfe TEXT, data_emissao DATE, raw JSONB, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj_orgao, ano, seq_contrato, seq_instrumento) )`);
  await db.query(`CREATE TABLE IF NOT EXISTS nf_check (cnpj_orgao TEXT PRIMARY KEY, checado timestamptz DEFAULT now(), n INTEGER DEFAULT 0)`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const mapRows = (await db.query(`SELECT DISTINCT ON (cnpj_compra) cnpj_compra cnpj, cod_ibge FROM contratos_sc WHERE cnpj_compra IS NOT NULL ORDER BY cnpj_compra, cod_ibge`)).rows;
  const cod = Object.fromEntries(mapRows.map((r) => [r.cnpj, r.cod_ibge]));
  const orgaos = Object.keys(cod);
  const feitos = new Set((await db.query(`SELECT cnpj_orgao FROM nf_check WHERE checado > now() - interval '14 days'`)).rows.map((r) => r.cnpj_orgao));
  const pend = orgaos.filter((c) => !feitos.has(c));
  console.log(`NF: ${pend.length} órgãos a verificar (de ${orgaos.length})...`);
  let comNF = 0, totalNF = 0, proc = 0;
  for (const cnpj of pend) {
    let p = 1, totalPag = 1, n = 0;
    do {
      const j = await pagina(cnpj, p);
      if (j == null) break;
      totalPag = Number(j.totalPaginas) || 1;
      for (const x of (j.data || [])) {
        await q(`INSERT INTO nf_sc (cod_ibge,cnpj_orgao,ano,seq_contrato,seq_instrumento,tipo,numero,chave_nfe,data_emissao,raw)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (cnpj_orgao,ano,seq_contrato,seq_instrumento) DO UPDATE SET chave_nfe=EXCLUDED.chave_nfe,numero=EXCLUDED.numero,data_emissao=EXCLUDED.data_emissao,raw=EXCLUDED.raw,atualizado=now()`,
          [cod[cnpj], cnpj, Number(x.ano) || ANO, Number(x.sequencialContrato) || 0, Number(x.sequencialInstrumentoCobranca) || 0,
           Number(x.tipoInstrumentoCobranca) || null, String(x.numeroInstrumentoCobranca || ""), x.chaveNFe || null, d10(x.dataEmissaoDocumento), JSON.stringify(x)]);
        n++;
      }
      p++;
    } while (p <= totalPag && p <= 40);
    if (n) { comNF++; totalNF += n; }
    await q(`INSERT INTO nf_check (cnpj_orgao,checado,n) VALUES ($1,now(),$2) ON CONFLICT (cnpj_orgao) DO UPDATE SET checado=now(), n=EXCLUDED.n`, [cnpj, n]);
    proc++;
    if (proc % 50 === 0) console.log(`  …${proc}/${pend.length} (órgãos com NF: ${comNF}, NFs: ${totalNF})`);
    await sleep(120);
  }
  console.log(`Concluído: ${proc} órgãos · ${comNF} com NF · ${totalNF} notas gravadas.`);
  if (comNF === 0) console.log("(cobertura 0 em SC — municípios não publicam NF no PNCP ainda; coletor pronto p/ acender)");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
