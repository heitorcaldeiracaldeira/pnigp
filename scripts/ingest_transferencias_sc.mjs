// Ingestão de Transferências da União / Convênios (Transferegov) via Portal da Transparência (CGU).
// Requer PORTAL_TRANSPARENCIA_KEY no .env.local. Idempotente (UPSERT por município).
// node scripts/ingest_transferencias_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = (env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)?.[1] || "").trim();
if (!KEY) { console.error("PORTAL_TRANSPARENCIA_KEY ausente no .env.local — cadastre em portaldatransparencia.gov.br/api-de-dados/cadastrar-email"); process.exit(1); }

const API = "https://api.portaldatransparencia.gov.br/api-de-dados";
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const numF = (v) => { if (v == null || v === "") return 0; const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : (Number(v) || 0); };
const strF = (c, ...ns) => { for (const n of ns) { const v = c[n]; if (v == null) continue; if (typeof v === "object") { const o = v.nome ?? v.descricao ?? v.razaoSocial; if (o) return String(o); } else if (String(v).trim()) return String(v); } return "—"; };

async function getPagina(cod, pagina) {
  const url = `${API}/convenios?codigoIBGE=${cod}&pagina=${pagina}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { "chave-api-dados": KEY, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 401 || r.status === 403) { console.error("Chave inválida (401/403)."); process.exit(1); }
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(700 * (t + 1)); }
  }
  return [];
}

function agregar(convenios) {
  const norm = convenios.map((c) => {
    const dim = c.dimConvenio || {}; const org = c.orgao || {}; const orgMax = org.orgaoMaximo || {}; const conv = c.convenente || {};
    return {
      objeto: String(dim.objeto ?? "—").slice(0, 220),
      orgao: String(orgMax.nome ?? org.nome ?? "—"),
      convenente: String(conv.nome ?? conv.razaoSocialReceita ?? "—"),
      situacao: String(c.situacao ?? "—"),
      valor: r2(Number(c.valor) || 0),
      liberado: r2(Number(c.valorLiberado) || 0),
      inicio: String(c.dataInicioVigencia ?? c.dataPublicacao ?? ""),
      fim: String(c.dataFinalVigencia ?? ""),
    };
  });
  const agg = (key) => { const m = {}; for (const c of norm) { const k = c[key] || "—"; (m[k] ??= { n: 0, valor: 0 }); m[k].n++; m[k].valor = r2(m[k].valor + c.valor); } return Object.entries(m).map(([nome, v]) => ({ [key]: nome, n: v.n, valor: v.valor })).sort((a, b) => b.valor - a.valor); };
  return {
    n_instrumentos: norm.length,
    valor_total: r2(norm.reduce((s, c) => s + c.valor, 0)),
    valor_liberado: r2(norm.reduce((s, c) => s + c.liberado, 0)),
    por_situacao: agg("situacao"),
    por_orgao: agg("orgao").slice(0, 8),
    top: [...norm].sort((a, b) => b.valor - a.valor).slice(0, 12),
  };
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS transferencias_sc (cod_ibge TEXT PRIMARY KEY, n_instrumentos INTEGER, valor_total NUMERIC(16,2), valor_liberado NUMERIC(16,2), por_situacao JSONB, por_orgao JSONB, top JSONB);`);
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM transferencias_sc`)).rows.map((r) => r.cod_ibge));
  const pend = entes.filter((e) => !feitos.has(e.cod_ibge));
  console.log(`Transferências (Transferegov/CGU): ${pend.length} municípios pendentes...`);
  let ok = 0;
  await pool(pend, 3, async (e) => {
    const conv = [];
    let p = 1;
    while (p <= 20) { const a = await getPagina(e.cod_ibge, p); if (!a.length) break; conv.push(...a); if (a.length < 15) break; p++; }
    if (!conv.length) return;
    const d = agregar(conv);
    await db.query(
      `INSERT INTO transferencias_sc (cod_ibge,n_instrumentos,valor_total,valor_liberado,por_situacao,por_orgao,top) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (cod_ibge) DO UPDATE SET n_instrumentos=EXCLUDED.n_instrumentos,valor_total=EXCLUDED.valor_total,valor_liberado=EXCLUDED.valor_liberado,por_situacao=EXCLUDED.por_situacao,por_orgao=EXCLUDED.por_orgao,top=EXCLUDED.top`,
      [e.cod_ibge, d.n_instrumentos, d.valor_total, d.valor_liberado, JSON.stringify(d.por_situacao), JSON.stringify(d.por_orgao), JSON.stringify(d.top)],
    );
    ok++;
  });
  const c = await db.query(`SELECT count(*) n FROM transferencias_sc`);
  console.log(`Concluído: ${ok} municípios com transferências | total na tabela: ${c.rows[0].n}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
