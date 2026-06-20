// ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon.
// Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd,
// unitário estimado×homologado, fornecedor/CNPJ/porte, LC123). Idempotente, resumível.
// node scripts/ingest_itens_sc.mjs   (env ANO opcional p/ um ano; padrão = último ano por ente)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP_MAIN = "https://pncp.gov.br/api/pncp/v1";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getMain(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(2500 + t * 2500); continue; }
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(600 * (t + 1)); }
  }
  return null;
}

const CAP_RES = Number(process.env.CAP_RES || 5000); // teto de buscas de homologado por compra (atas podem ter ~20k itens)
async function fetchItens(cnpj, ano, seq) {
  // paginação completa dos itens (default da API é 10!) — pega TODOS, mesmo atas com milhares
  const base = `${PNCP_MAIN}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`;
  const itens = []; let p = 1;
  while (p <= 60) {
    const pg = await getMain(`${base}?pagina=${p}&tamanhoPagina=500`);
    if (!Array.isArray(pg) || !pg.length) break;
    itens.push(...pg);
    if (pg.length < 500) break;
    p++;
  }
  if (!itens.length) return [];
  // homologado só dos itens premiados (temResultado), com concorrência; cap c/ log honesto
  const premiados = itens.filter((it) => it.temResultado);
  const alvo = premiados.slice(0, CAP_RES);
  if (premiados.length > CAP_RES) console.log(`  ${cnpj}/${ano}/${seq}: ${premiados.length} itens c/ resultado — homologado coletado dos ${CAP_RES} primeiros (cap)`);
  const resMap = new Map();
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < alvo.length) {
      const it = alvo[i++];
      const r = await getMain(`${base}/${it.numeroItem}/resultados`).catch(() => null);
      if (Array.isArray(r) && r[0]) resMap.set(it.numeroItem, r[0]);
    }
  }));
  return itens.map((it, idx) => {
    const r = resMap.get(it.numeroItem) || null;
    const unitEst = Number(it.valorUnitarioEstimado) || 0;
    const unitHom = r ? Number(r.valorUnitarioHomologado) || Number(r.valorUnitario) || 0 : 0;
    const benef = String(it.tipoBeneficioNome || "");
    return {
      numero: Number(it.numeroItem) || idx + 1,
      descricao: String(it.descricao || "").slice(0, 240),
      unidade: String(it.unidadeMedida || ""),
      quantidade: Number(it.quantidade) || 0,
      unitEst, unitHom: unitHom > 0 ? unitHom : null,
      fornecedor: r ? String(r.nomeRazaoSocialFornecedor || r.niFornecedor || "") || null : null,
      cnpjFornecedor: r ? String(r.niFornecedor || "") || null : null,
      porteFornecedor: r ? String(r.porteFornecedorNome || r.porteFornecedor || "") || null : null,
      beneficioLC: benef && !/nenhum|não|nao|sem benef/i.test(benef) ? benef : null,
      economiaPct: unitEst > 0 && unitHom > 0 ? Math.round(((unitEst - unitHom) / unitEst) * 1000) / 10 : null,
      ncm: String(it.ncmNbsCodigo || "") || null,                         // código fiscal do produto (comparar mesmo produto)
      catmat: it.catalogoCodigoItem != null ? String(it.catalogoCodigoItem) : null, // CATMAT/CATSER (catálogo oficial)
      tipo: String(it.materialOuServicoNome || "") || null,              // Material | Serviço
      situacao: String(it.situacaoCompraItemNome || "") || null,         // Homologado/Fracassado/Deserto/Cancelado — comportamento da compra
    };
  });
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS itens_sc (
      cod_ibge TEXT, cnpj TEXT, ano INTEGER, seq INTEGER, numero INTEGER,
      descricao TEXT, unidade TEXT, quantidade NUMERIC, unit_estimado NUMERIC, unit_homologado NUMERIC,
      fornecedor TEXT, cnpj_fornecedor TEXT, porte_fornecedor TEXT, beneficio_lc TEXT, economia_pct NUMERIC,
      ncm TEXT, catmat TEXT, tipo TEXT, situacao TEXT,
      PRIMARY KEY (cnpj, ano, seq, numero) );
    CREATE INDEX IF NOT EXISTS idx_itens_proc ON itens_sc (cnpj, ano, seq);
    CREATE INDEX IF NOT EXISTS idx_itens_catmat ON itens_sc (catmat) WHERE catmat IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_itens_ncm ON itens_sc (ncm) WHERE ncm IS NOT NULL;
    CREATE TABLE IF NOT EXISTS itens_sc_feitos (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano));`);
  for (const c of ["ncm TEXT", "catmat TEXT", "tipo TEXT", "situacao TEXT"]) await db.query(`ALTER TABLE itens_sc ADD COLUMN IF NOT EXISTS ${c}`); // robusto se a tabela já existir
  const q = async (sql, params) => { for (let t = 0; t < 12; t++) { try { return await db.query(sql, params); } catch { await sleep(1500 * (t + 1)); } } throw new Error("db indisponível"); };
  // universo COMPLETO: todos os processos do PNCP em SC (processos_sc)
  await db.query(`CREATE TABLE IF NOT EXISTS itens_proc_feitos (numero_controle TEXT PRIMARY KEY, n INTEGER, feito_em timestamptz DEFAULT now())`);
  const procs = (await db.query(`SELECT numero_controle, cod_ibge, cnpj_orgao cnpj, ano, sequencial seq FROM processos_sc WHERE cnpj_orgao IS NOT NULL AND sequencial IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
  const feitos = new Set((await db.query(`SELECT numero_controle FROM itens_proc_feitos`)).rows.map((r) => r.numero_controle));
  const pend = procs.filter((p) => !feitos.has(p.numero_controle));
  console.log(`Itens: ${pend.length} processos pendentes (de ${procs.length} no PNCP/SC)...`);
  let comItens = 0;
  await pool(pend, 2, async (e) => {
    try {
      const itens = await fetchItens(e.cnpj, e.ano, e.seq);
      let n = 0;
      for (const it of itens) {
        await q(`INSERT INTO itens_sc (cod_ibge,cnpj,ano,seq,numero,descricao,unidade,quantidade,unit_estimado,unit_homologado,fornecedor,cnpj_fornecedor,porte_fornecedor,beneficio_lc,economia_pct,ncm,catmat,tipo,situacao)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                 ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=EXCLUDED.descricao,unit_homologado=EXCLUDED.unit_homologado,fornecedor=EXCLUDED.fornecedor,cnpj_fornecedor=EXCLUDED.cnpj_fornecedor,porte_fornecedor=EXCLUDED.porte_fornecedor,beneficio_lc=EXCLUDED.beneficio_lc,economia_pct=EXCLUDED.economia_pct,ncm=EXCLUDED.ncm,catmat=EXCLUDED.catmat,tipo=EXCLUDED.tipo,situacao=EXCLUDED.situacao`,
          [e.cod_ibge, e.cnpj, e.ano, e.seq, it.numero, it.descricao, it.unidade, it.quantidade, it.unitEst, it.unitHom, it.fornecedor, it.cnpjFornecedor, it.porteFornecedor, it.beneficioLC, it.economiaPct, it.ncm, it.catmat, it.tipo, it.situacao]);
        n++;
      }
      await q(`INSERT INTO itens_proc_feitos (numero_controle,n) VALUES ($1,$2) ON CONFLICT (numero_controle) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [e.numero_controle, n]);
      if (n) comItens++;
    } catch (err) { console.log(`  ! falha ${e.numero_controle} (${String(err).slice(0, 35)})`); }
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT (cnpj,ano,seq)) p FROM itens_sc`);
  console.log(`Concluído: ${comItens} processos c/ itens nesta rodada | total ${c.rows[0].n} itens em ${c.rows[0].p} processos`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
