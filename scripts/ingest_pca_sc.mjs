// ETL — PCA (Plano Anual de Contratações) do PNCP por município de SC.
// Descobre os CNPJs dos órgãos municipais (contratações esfera M) e puxa
// /pca/atualizacao?cnpj= de cada (o filtro cnpj FUNCIONA aqui). Agrega por município.
// Conecta o PLANEJADO (PCA) com o CONTRATADO (compras/contratos). Idempotente (UPSERT).
// node scripts/ingest_pca_sc.mjs   (env ANOS opcional, default 2024,2025,2026)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2024, 2025, 2026];
const CONS = "https://pncp.gov.br/api/consulta/v1";
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const MODALIDADES_DESC = [6, 8, 4, 9, 12, 7, 5];

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

async function pcaDoOrgao(cnpj) {
  const itens = [];
  for (const ano of ANOS) {
    let pagina = 1, totalPaginas = 1;
    do {
      const j = await getJson(`${CONS}/pca/atualizacao?dataInicio=${ano}0101&dataFim=${ano}1231&cnpj=${cnpj}&pagina=${pagina}&tamanhoPagina=500`);
      if (!j) break;
      totalPaginas = j.totalPaginas || 0;
      for (const plano of j.data || []) {
        const anoPca = plano.anoPca;
        for (const it of plano.itens || []) {
          itens.push({
            anoPca,
            descricao: String(it.descricaoItem || "—").slice(0, 200),
            categoria: String(it.categoriaItemPcaNome || it.classificacaoSuperiorNome || "—"),
            grupo: String(it.grupoContratacaoNome || "—"),
            unidade: String(it.unidadeRequisitante || ""),
            qtd: Number(it.quantidadeEstimada) || 0,
            valor: r2(Number(it.valorTotal) || 0),
            dataDesejada: (it.dataDesejada || "").slice(0, 10) || null,
          });
        }
      }
      pagina++;
    } while (pagina <= totalPaginas && pagina <= 40);
  }
  return itens;
}

function agregar(itens) {
  const aggBy = (key, lim) => {
    const m = {};
    for (const it of itens) { const k = it[key] || "—"; (m[k] ??= { n: 0, valor: 0 }); m[k].n++; m[k].valor = r2(m[k].valor + it.valor); }
    return Object.entries(m).map(([nome, v]) => ({ nome, n: v.n, valor: v.valor })).sort((a, b) => b.valor - a.valor).slice(0, lim);
  };
  return {
    n_itens: itens.length,
    valor_total: r2(itens.reduce((s, c) => s + c.valor, 0)),
    por_categoria: aggBy("categoria", 8),
    por_ano: aggBy("anoPca", 6),
    top: [...itens].sort((a, b) => b.valor - a.valor).slice(0, 15).map((it) => ({ descricao: it.descricao, categoria: it.categoria, qtd: it.qtd, valor: it.valor, dataDesejada: it.dataDesejada, anoPca: it.anoPca })),
  };
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS pca_sc (
      cod_ibge TEXT PRIMARY KEY, n_itens INTEGER, valor_total NUMERIC(16,2),
      por_categoria JSONB, por_ano JSONB, top JSONB );
    CREATE TABLE IF NOT EXISTS pca_sc_feitos (cod_ibge TEXT PRIMARY KEY, n INTEGER);`);
  const q = async (sql, params) => { for (let t = 0; t < 6; t++) { try { return await db.query(sql, params); } catch { await sleep(900 * (t + 1)); } } throw new Error("db indisponível"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM pca_sc_feitos`)).rows.map((r) => r.cod_ibge));
  const pend = entes.filter((e) => !feitos.has(e.cod_ibge));
  console.log(`PCA PNCP (${ANOS.join(",")}): ${pend.length} municípios pendentes de ${entes.length}...`);
  let comDados = 0;
  await pool(pend, 4, async (e) => {
    try {
      // reaproveita CNPJs já descobertos pelo ETL de contratos; senão descobre
      let cnpjs = (await db.query(`SELECT DISTINCT cnpj_compra FROM contratos_sc WHERE cod_ibge=$1 AND cnpj_compra IS NOT NULL`, [e.cod_ibge]).catch(() => ({ rows: [] }))).rows.map((r) => r.cnpj_compra);
      if (!cnpjs.length) cnpjs = await descobrirCnpjs(e.cod_ibge);
      let itens = [];
      for (const cnpj of cnpjs) { itens = itens.concat(await pcaDoOrgao(cnpj)); }
      if (itens.length) {
        const d = agregar(itens);
        await q(`INSERT INTO pca_sc (cod_ibge,n_itens,valor_total,por_categoria,por_ano,top) VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (cod_ibge) DO UPDATE SET n_itens=EXCLUDED.n_itens,valor_total=EXCLUDED.valor_total,por_categoria=EXCLUDED.por_categoria,por_ano=EXCLUDED.por_ano,top=EXCLUDED.top`,
          [e.cod_ibge, d.n_itens, d.valor_total, JSON.stringify(d.por_categoria), JSON.stringify(d.por_ano), JSON.stringify(d.top)]);
        comDados++;
      }
      await q(`INSERT INTO pca_sc_feitos (cod_ibge,n) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET n=EXCLUDED.n`, [e.cod_ibge, itens.length]);
    } catch (err) { console.log(`  ! falha em ${e.cod_ibge} (${String(err).slice(0, 40)}) — retomado depois`); }
  });
  const c = await db.query(`SELECT count(*) e, sum(n_itens) n, sum(valor_total) v FROM pca_sc`);
  console.log(`Concluído: ${comDados} entes c/ PCA | itens=${c.rows[0].n} | planejado R$ ${(Number(c.rows[0].v) / 1e9).toFixed(2)} bi`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
