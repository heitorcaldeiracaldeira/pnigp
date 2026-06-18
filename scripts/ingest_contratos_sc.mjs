// ETL — Contratos ASSINADOS do PNCP por município de SC, conectados ao processo licitatório.
// Descobre os CNPJs dos órgãos municipais (via contratações esfera M) e puxa /contratos?cnpjOrgao= de cada.
// Guarda cada contrato com numero_controle_compra (link p/ a contratação). Idempotente por município.
// node scripts/ingest_contratos_sc.mjs   (env ANOS opcional, default 2024,2025)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2024, 2025]; // PNCP exige intervalo no MESMO ano → iteramos por ano
const CONS = "https://pncp.gov.br/api/consulta/v1";
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const MODALIDADES_DESC = [6, 8, 4, 9, 12, 7, 5]; // p/ descobrir órgãos municipais

async function getJson(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (r.status === 204) return { data: [], totalPaginas: 0 };
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(800 * (t + 1)); }
  }
  return null;
}

// 1) descobrir CNPJs de órgãos municipais do ente (esfera M) a partir das contratações
async function descobrirCnpjs(codIbge) {
  const cnpjs = new Set();
  for (const ano of ANOS) {
    for (const mod of MODALIDADES_DESC) {
      let pagina = 1, totalPaginas = 1;
      do {
        const j = await getJson(`${CONS}/contratacoes/publicacao?dataInicial=${ano}0101&dataFinal=${ano}1231&codigoModalidadeContratacao=${mod}&codigoMunicipioIbge=${codIbge}&pagina=${pagina}&tamanhoPagina=50`);
        if (!j) break;
        totalPaginas = j.totalPaginas || 0;
        for (const x of j.data || []) { const o = x.orgaoEntidade; if (o?.esferaId === "M" && o.cnpj) cnpjs.add(o.cnpj); }
        pagina++;
      } while (pagina <= totalPaginas && pagina <= 6);
    }
  }
  return [...cnpjs];
}

// 2) puxar contratos assinados de um CNPJ de órgão
async function contratosDoOrgao(cnpj) {
  const out = [];
  for (const ano of ANOS) {
  let pagina = 1, totalPaginas = 1;
  do {
    const j = await getJson(`${CONS}/contratos?dataInicial=${ano}0101&dataFinal=${ano}1231&cnpjOrgao=${cnpj}&pagina=${pagina}&tamanhoPagina=500`);
    if (!j) break;
    totalPaginas = j.totalPaginas || 0;
    for (const x of j.data || []) {
      const compra = String(x.numeroControlePncpCompra || "");
      // parse "CNPJ-N-SEQ/ANO" → cnpj/ano/seq do processo (p/ conectar à contratação)
      const pp = compra.split("/");
      const anoC = pp[1] ? Number(pp[1]) : null;
      const lf = (pp[0] || "").split("-");
      const cnpjC = lf[0] || null;
      const seqC = lf.length > 1 ? parseInt(lf[lf.length - 1], 10) || null : null;
      out.push({
        compra,
        cnpjC, anoC, seqC,
        fornecedor: String(x.nomeRazaoSocialFornecedor || "").slice(0, 160),
        ni: String(x.niFornecedor || ""),
        valor: r2(Number(x.valorGlobal) || 0),
        vigIni: (x.dataVigenciaInicio || "").slice(0, 10) || null,
        vigFim: (x.dataVigenciaFim || "").slice(0, 10) || null,
        assinatura: (x.dataAssinatura || "").slice(0, 10) || null,
        objeto: String(x.objetoContrato || "").slice(0, 220),
        orgao: String(x.orgaoEntidade?.razaoSocial || ""),
      });
    }
    pagina++;
  } while (pagina <= totalPaginas && pagina <= 40);
  }
  return out;
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS contratos_sc (
      id BIGSERIAL PRIMARY KEY, cod_ibge TEXT NOT NULL, numero_controle_compra TEXT,
      cnpj_compra TEXT, ano_compra INTEGER, seq_compra INTEGER,
      fornecedor TEXT, ni_fornecedor TEXT, valor_global NUMERIC(16,2),
      vig_inicio DATE, vig_fim DATE, assinatura DATE, objeto TEXT, orgao TEXT );
    CREATE INDEX IF NOT EXISTS idx_contratos_sc_ente ON contratos_sc (cod_ibge);
    CREATE INDEX IF NOT EXISTS idx_contratos_sc_proc ON contratos_sc (cnpj_compra, ano_compra, seq_compra);
    CREATE TABLE IF NOT EXISTS contratos_sc_feitos (cod_ibge TEXT PRIMARY KEY, n INTEGER);`);
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM contratos_sc_feitos`)).rows.map((r) => r.cod_ibge));
  const pend = entes.filter((e) => !feitos.has(e.cod_ibge));
  console.log(`Contratos PNCP (${ANOS.join(",")}): ${pend.length} municípios pendentes de ${entes.length}...`);
  let comDados = 0;
  await pool(pend, 4, async (e) => {
    const cnpjs = await descobrirCnpjs(e.cod_ibge);
    let contratos = [];
    for (const cnpj of cnpjs) { contratos = contratos.concat(await contratosDoOrgao(cnpj)); }
    // grava (substitui o ente)
    await db.query(`DELETE FROM contratos_sc WHERE cod_ibge=$1`, [e.cod_ibge]);
    for (const c of contratos) {
      await db.query(
        `INSERT INTO contratos_sc (cod_ibge,numero_controle_compra,cnpj_compra,ano_compra,seq_compra,fornecedor,ni_fornecedor,valor_global,vig_inicio,vig_fim,assinatura,objeto,orgao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [e.cod_ibge, c.compra, c.cnpjC, c.anoC, c.seqC, c.fornecedor, c.ni, c.valor, c.vigIni, c.vigFim, c.assinatura, c.objeto, c.orgao],
      );
    }
    await db.query(`INSERT INTO contratos_sc_feitos (cod_ibge,n) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET n=EXCLUDED.n`, [e.cod_ibge, contratos.length]);
    if (contratos.length) comDados++;
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) e, sum(valor_global) v FROM contratos_sc`);
  console.log(`Concluído: entes c/ contratos=${comDados} | total contratos=${c.rows[0].n} | entes=${c.rows[0].e} | valor R$ ${(Number(c.rows[0].v) / 1e9).toFixed(2)} bi`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
