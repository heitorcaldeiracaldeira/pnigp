// Catálogo CATMAT (materiais) completo — a taxonomia federal. Base do classificador descrição→CATMAT.
// Fonte: dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial (687 páginas × 500). ~343k itens. NACIONAL.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import pg from "pg";
const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 }); db.on("error", () => {});
await db.query(`CREATE TABLE IF NOT EXISTS catmat_catalogo (codigo_item INTEGER PRIMARY KEY, nome_pdm TEXT, nome_classe TEXT, descricao TEXT, codigo_pdm INTEGER, codigo_classe INTEGER, ncm TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
const getPage = async (pag) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(`https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?pagina=${pag}&tamanhoPagina=500`, { headers: H }); if (!r.ok) throw 0; const j = await r.json(); return j.resultado || null; } catch { await sleep(1500 * (t + 1)); } } return null; };
let total = 0;
for (let pag = 1; pag <= 700; pag++) {
  const arr = await getPage(pag);
  if (arr === null) { console.log(`pág ${pag}: falha`); continue; }
  if (!arr.length) break;
  // batch insert
  const vals = [], ph = [];
  arr.forEach((it, i) => { const b = i * 7; ph.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`); vals.push(+it.codigoItem, it.nomePdm || null, it.nomeClasse || null, (it.descricaoItem || "").slice(0, 500), it.codigoPdm != null ? +it.codigoPdm : null, it.codigoClasse != null ? +it.codigoClasse : null, it.codigo_ncm || null); });
  await db.query(`INSERT INTO catmat_catalogo (codigo_item,nome_pdm,nome_classe,descricao,codigo_pdm,codigo_classe,ncm) VALUES ${ph.join(",")} ON CONFLICT (codigo_item) DO UPDATE SET descricao=EXCLUDED.descricao,atualizado=now()`, vals);
  total += arr.length;
  if (pag % 50 === 0) console.log(`  pág ${pag} · ${total} itens`);
}
console.log("criando índice trigram (para o classificador)…");
await db.query(`CREATE INDEX IF NOT EXISTS ix_catmat_trgm ON catmat_catalogo USING gin (descricao gin_trgm_ops)`).catch((e) => console.log("índice:", e.message.slice(0, 60)));
const c = (await db.query("SELECT count(*) n, count(DISTINCT codigo_classe) cl FROM catmat_catalogo")).rows[0];
console.log(`✔ catmat_catalogo: ${c.n} itens · ${c.cl} classes`);
await db.end();
