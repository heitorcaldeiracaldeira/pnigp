// SALIC / Lei Rouanet — projetos culturais por município: valor aprovado vs captado (gap = captação na mesa). Fonte: MinC API SALIC. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const H = { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map(e => [norm(e.nome), e.cod_ibge]));
const agg = new Map(); let off = 0, total = 0, semMatch = 0;
for (let pag = 0; pag < 60; pag++) {
  const j = await fetch(`https://api.salic.cultura.gov.br/api/v1/projetos?UF=${UF}&limit=100&offset=${off}`, { headers: H }).then(r => r.json()).catch(() => null);
  const arr = j?._embedded?.projetos || j?.projetos || [];
  if (!arr.length) break;
  for (const p of arr) { total++; const cod = byNome.get(norm(p.municipio)); if (!cod) { semMatch++; continue; } if (!agg.has(cod)) agg.set(cod, { proj: 0, aprovado: 0, captado: 0 }); const o = agg.get(cod); o.proj++; o.aprovado += (+p.valor_aprovado || 0); o.captado += (+p.valor_captado || 0); }
  off += 100;
}
await db.query(`CREATE TABLE IF NOT EXISTS salic_sc (cod_ibge TEXT PRIMARY KEY, projetos INT, aprovado NUMERIC, captado NUMERIC, gap NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM salic_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { const gap = Math.max(0, o.aprovado - o.captado); await db.query("INSERT INTO salic_sc (cod_ibge,projetos,aprovado,captado,gap) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cod_ibge) DO UPDATE SET projetos=EXCLUDED.projetos,aprovado=EXCLUDED.aprovado,captado=EXCLUDED.captado,gap=EXCLUDED.gap,atualizado=now()", [cod, o.proj, o.aprovado, o.captado, gap]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(gap)/1e6,1) g FROM salic_sc")).rows[0];
console.log(`✔ salic_sc: ${n} munis (${total} projetos, ${semMatch} sem match) · gap de captação R$ ${c.g} mi na mesa`);
await db.end();
