// ETL — Catálogo oficial do governo federal (CATMAT + CATSER) do Compras.gov.br: espinha dorsal p/ classificar
// os itens de compra. Snapshot completo (rebuild idempotente). node scripts/ingest_catalogo_govbr_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://dadosabertos.compras.gov.br";

async function baixar(url, push, maxPg = 60) {
  let pg = 1, n = 0;
  for (;;) {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}pagina=${pg}&tamanhoPagina=500`).then((x) => x.json()).catch(() => null);
    if (!r || !r.resultado || !r.resultado.length) break;
    for (const x of r.resultado) { push(x); n++; }
    if (r.paginasRestantes === 0 || pg > maxPg) break; pg++;
  }
  return n;
}

async function main() {
  const linhas = [];
  console.log("baixando CATMAT (PDMs de material)…");
  const nM = await baixar(`${BASE}/modulo-material/3_consultarPdmMaterial`, (p) =>
    linhas.push(["PDM", "Material", String(p.codigoPdm), p.nomePdm, p.nomeClasse, p.nomeGrupo]));
  console.log(`  PDMs: ${nM}`);
  console.log("baixando CATSER (itens de serviço)…");
  const nS = await baixar(`${BASE}/modulo-servico/6_consultarItemServico`, (s) =>
    linhas.push(["ITEM", "Serviço", String(s.codigoServico), s.nomeServico, s.nomeClasse, s.nomeGrupo]));
  console.log(`  itens de serviço: ${nS}`);
  console.log("baixando CATSER (classes de serviço — fallback)…");
  const nC = await baixar(`${BASE}/modulo-servico/4_consultarClasseServico`, (c) =>
    linhas.push(["CLASSE", "Serviço", String(c.codigoClasse), c.nomeClasse, c.nomeClasse, c.nomeGrupo]));
  console.log(`  classes de serviço: ${nC}`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 600000 });
  await db.query(`CREATE TABLE IF NOT EXISTS catalogo_govbr_sc (
    nivel TEXT NOT NULL, tipo TEXT NOT NULL, cod TEXT NOT NULL,
    nome TEXT NOT NULL, classe TEXT, grupo TEXT, atualizado_em timestamptz DEFAULT now(),
    PRIMARY KEY (nivel, cod))`);
  await db.query(`TRUNCATE catalogo_govbr_sc`); // rebuild idempotente
  // dedup por (nivel,cod) — a API repete códigos
  const visto = new Set(), unicas = [];
  for (const l of linhas) { const k = `${l[0]}|${l[2]}`; if (visto.has(k)) continue; visto.add(k); unicas.push(l); }
  const dups = linhas.length - unicas.length;
  // insere em lotes (tabela truncada → INSERT simples)
  const B = 1000;
  for (let i = 0; i < unicas.length; i += B) {
    const lote = unicas.slice(i, i + B);
    const vals = [], ph = [];
    lote.forEach((l, j) => { const b = j * 6; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`); vals.push(...l); });
    await db.query(`INSERT INTO catalogo_govbr_sc (nivel,tipo,cod,nome,classe,grupo) VALUES ${ph.join(",")}`, vals);
  }
  const r = (await db.query(`SELECT nivel, count(*) n FROM catalogo_govbr_sc GROUP BY 1 ORDER BY 1`)).rows;
  console.log(`catalogo_govbr_sc: ${r.map((x) => `${x.nivel}=${x.n}`).join(" · ")} (${unicas.length} únicas, ${dups} duplicadas descartadas)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
