// ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon.
// Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd,
// unitário estimado×homologado, fornecedor/CNPJ/porte, LC123). Idempotente, resumível.
// node scripts/ingest_itens_sc.mjs   (env ANO opcional p/ um ano; padrão = último ano por ente)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP_MAIN = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 2);   // concorrência de processos; backoff robusto de 429 mantém confiabilidade em conc alto
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getMain(url) {
  for (let t = 0; t < 8; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }   // 429 agressivo do PNCP: backoff longo (até ~32s)
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;   // esgotou (429/timeout persistente) — o chamador NÃO deve marcar feito
}

const CAP_RES = Number(process.env.CAP_RES || 5000); // teto de buscas de homologado por compra (atas podem ter ~20k itens)
async function fetchItens(cnpj, ano, seq) {
  // paginação completa dos itens (default da API é 10!) — pega TODOS, mesmo atas com milhares
  const base = `${PNCP_MAIN}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`;
  const itens = []; let p = 1;
  while (p <= 60) {
    const pg = await getMain(`${base}?pagina=${p}&tamanhoPagina=500`);
    if (pg === null) throw new Error("fetch itens falhou (429/timeout) — retenta no re-run");  // NÃO marca feito
    if (!pg.length) break;                                                                     // genuinamente sem mais itens
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
  await pool(pend, CONC, async (e) => {
    try {
      const itens = await fetchItens(e.cnpj, e.ano, e.seq);
      const n = itens.length;
      if (n > 0) {
        // LOTE: 1 INSERT por processo (não por item) — corta as requisições ao Neon em N× e evita a queda por bombardeio.
        const A = { num: [], desc: [], uni: [], qtd: [], est: [], hom: [], forn: [], cf: [], pf: [], blc: [], ec: [], ncm: [], cat: [], tipo: [], sit: [] };
        for (const it of itens) { A.num.push(it.numero); A.desc.push(it.descricao); A.uni.push(it.unidade); A.qtd.push(it.quantidade); A.est.push(it.unitEst); A.hom.push(it.unitHom); A.forn.push(it.fornecedor); A.cf.push(it.cnpjFornecedor); A.pf.push(it.porteFornecedor); A.blc.push(it.beneficioLC); A.ec.push(it.economiaPct); A.ncm.push(it.ncm); A.cat.push(it.catmat); A.tipo.push(it.tipo); A.sit.push(it.situacao); }
        await q(`INSERT INTO itens_sc (cod_ibge,cnpj,ano,seq,numero,descricao,unidade,quantidade,unit_estimado,unit_homologado,fornecedor,cnpj_fornecedor,porte_fornecedor,beneficio_lc,economia_pct,ncm,catmat,tipo,situacao)
                 SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::numeric[],$9::numeric[],$10::numeric[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::text[],$17::text[],$18::text[],$19::text[])
                   AS t(numero,descricao,unidade,quantidade,unit_estimado,unit_homologado,fornecedor,cnpj_fornecedor,porte_fornecedor,beneficio_lc,economia_pct,ncm,catmat,tipo,situacao)
                 ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=EXCLUDED.descricao,unit_homologado=EXCLUDED.unit_homologado,fornecedor=EXCLUDED.fornecedor,cnpj_fornecedor=EXCLUDED.cnpj_fornecedor,porte_fornecedor=EXCLUDED.porte_fornecedor,beneficio_lc=EXCLUDED.beneficio_lc,economia_pct=EXCLUDED.economia_pct,ncm=EXCLUDED.ncm,catmat=EXCLUDED.catmat,tipo=EXCLUDED.tipo,situacao=EXCLUDED.situacao`,
          [e.cod_ibge, e.cnpj, e.ano, e.seq, A.num, A.desc, A.uni, A.qtd, A.est, A.hom, A.forn, A.cf, A.pf, A.blc, A.ec, A.ncm, A.cat, A.tipo, A.sit]);
        // todo processo tem ≥1 item: só marca FEITO com n>0 (n=0 = fetch vazio/anomalia → fica pendente, retenta)
        await q(`INSERT INTO itens_proc_feitos (numero_controle,n) VALUES ($1,$2) ON CONFLICT (numero_controle) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [e.numero_controle, n]); comItens++;
      }
    } catch (err) { console.log(`  ! falha ${e.numero_controle} (${String(err).slice(0, 35)})`); }
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT (cnpj,ano,seq)) p FROM itens_sc`);
  console.log(`Concluído: ${comItens} processos c/ itens nesta rodada | total ${c.rows[0].n} itens em ${c.rows[0].p} processos`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
