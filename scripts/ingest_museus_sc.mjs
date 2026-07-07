// IBRAM MuseusBr — museus por município (contagem + esfera). Fonte: IBRAM (Tainacan/cadastro.museus.gov.br). State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const val = (md, k) => { const e = md?.[k]; return e?.value_as_string || (Array.isArray(e?.value) ? e.value.join(",") : e?.value) || ""; };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map(e => [norm(e.nome), e.cod_ibge]));
const agg = new Map(); let total = 0, semMatch = 0;
for (let pag = 1; pag <= 60; pag++) {
  const r = await fetch(`https://cadastro.museus.gov.br/wp-json/tainacan/v2/collection/208/items/?perpage=100&paged=${pag}`, { headers: H }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  const items = j?.items || (Array.isArray(j) ? j : []);
  if (!items.length) break;
  for (const it of items) { const md = it.metadata || {}; if (norm(val(md, "uf")) !== UF) continue; total++; const cod = byNome.get(norm(val(md, "municipio"))); if (!cod) { semMatch++; continue; } if (!agg.has(cod)) agg.set(cod, 0); agg.set(cod, agg.get(cod) + 1); }
}
await db.query(`CREATE TABLE IF NOT EXISTS museus_sc (cod_ibge TEXT PRIMARY KEY, museus INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM museus_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, q] of agg) { await db.query("INSERT INTO museus_sc (cod_ibge,museus) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET museus=EXCLUDED.museus,atualizado=now()", [cod, q]); n++; }
const c = (await db.query("SELECT count(*) n, sum(museus) m FROM museus_sc")).rows[0];
console.log(`✔ museus_sc: ${c.n} munis com museu · ${c.m} museus (${total} em ${UF}, ${semMatch} sem match)`);
await db.end();
