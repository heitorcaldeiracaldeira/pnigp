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

async function fetchItens(cnpj, ano, seq) {
  const itens = await getMain(`${PNCP_MAIN}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`);
  if (!Array.isArray(itens) || !itens.length) return [];
  const lim = itens.slice(0, 30);
  const comRes = lim.slice(0, 12);
  const resultados = await Promise.all(comRes.map((it) => getMain(`${PNCP_MAIN}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${it.numeroItem}/resultados`).catch(() => null)));
  return lim.map((it, i) => {
    const r = (i < resultados.length && Array.isArray(resultados[i]) ? resultados[i][0] : null) || null;
    const unitEst = Number(it.valorUnitarioEstimado) || 0;
    const unitHom = r ? Number(r.valorUnitarioHomologado) || Number(r.valorUnitario) || 0 : 0;
    const benef = String(it.tipoBeneficioNome || "");
    return {
      numero: Number(it.numeroItem) || i + 1,
      descricao: String(it.descricao || "").slice(0, 240),
      unidade: String(it.unidadeMedida || ""),
      quantidade: Number(it.quantidade) || 0,
      unitEst, unitHom: unitHom > 0 ? unitHom : null,
      fornecedor: r ? String(r.nomeRazaoSocialFornecedor || r.niFornecedor || "") || null : null,
      cnpjFornecedor: r ? String(r.niFornecedor || "") || null : null,
      porteFornecedor: r ? String(r.porteFornecedorNome || r.porteFornecedor || "") || null : null,
      beneficioLC: benef && !/nenhum|não|nao|sem benef/i.test(benef) ? benef : null,
      economiaPct: unitEst > 0 && unitHom > 0 ? Math.round(((unitEst - unitHom) / unitEst) * 1000) / 10 : null,
    };
  });
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS itens_sc (
      cod_ibge TEXT, cnpj TEXT, ano INTEGER, seq INTEGER, numero INTEGER,
      descricao TEXT, unidade TEXT, quantidade NUMERIC, unit_estimado NUMERIC, unit_homologado NUMERIC,
      fornecedor TEXT, cnpj_fornecedor TEXT, porte_fornecedor TEXT, beneficio_lc TEXT, economia_pct NUMERIC,
      PRIMARY KEY (cnpj, ano, seq, numero) );
    CREATE INDEX IF NOT EXISTS idx_itens_proc ON itens_sc (cnpj, ano, seq);
    CREATE TABLE IF NOT EXISTS itens_sc_feitos (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano));`);
  const q = async (sql, params) => { for (let t = 0; t < 6; t++) { try { return await db.query(sql, params); } catch { await sleep(900 * (t + 1)); } } throw new Error("db indisponível"); };
  // último ano por ente (o que o drill mostra), com top contendo IDs
  const rows = (await db.query(`SELECT DISTINCT ON (cod_ibge) cod_ibge, ano, top FROM compras_sc WHERE top IS NOT NULL ORDER BY cod_ibge, ano DESC`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge, ano FROM itens_sc_feitos`)).rows.map((r) => `${r.cod_ibge}-${r.ano}`));
  const pend = rows.filter((r) => !feitos.has(`${r.cod_ibge}-${r.ano}`));
  console.log(`Itens: ${pend.length} entes pendentes (de ${rows.length} com compras)...`);
  let comItens = 0;
  await pool(pend, 3, async (e) => {
    try {
      const top = Array.isArray(e.top) ? e.top : [];
      const procs = top.filter((c) => c.cnpj && c.ano && c.seq).slice(0, 12);
      let n = 0;
      for (const c of procs) {
        const itens = await fetchItens(c.cnpj, c.ano, c.seq);
        for (const it of itens) {
          await q(`INSERT INTO itens_sc (cod_ibge,cnpj,ano,seq,numero,descricao,unidade,quantidade,unit_estimado,unit_homologado,fornecedor,cnpj_fornecedor,porte_fornecedor,beneficio_lc,economia_pct)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                   ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=EXCLUDED.descricao,unit_homologado=EXCLUDED.unit_homologado,fornecedor=EXCLUDED.fornecedor,cnpj_fornecedor=EXCLUDED.cnpj_fornecedor,porte_fornecedor=EXCLUDED.porte_fornecedor,beneficio_lc=EXCLUDED.beneficio_lc,economia_pct=EXCLUDED.economia_pct`,
            [e.cod_ibge, c.cnpj, c.ano, c.seq, it.numero, it.descricao, it.unidade, it.quantidade, it.unitEst, it.unitHom, it.fornecedor, it.cnpjFornecedor, it.porteFornecedor, it.beneficioLC, it.economiaPct]);
          n++;
        }
      }
      await q(`INSERT INTO itens_sc_feitos (cod_ibge,ano) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [e.cod_ibge, e.ano]);
      if (n) comItens++;
    } catch (err) { console.log(`  ! falha ${e.cod_ibge} (${String(err).slice(0, 35)})`); }
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT (cnpj,ano,seq)) p FROM itens_sc`);
  console.log(`Concluído: ${comItens} entes c/ itens | total ${c.rows[0].n} itens em ${c.rows[0].p} processos`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
