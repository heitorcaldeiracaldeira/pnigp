// ANA SNISB — barragens por município: total + dano potencial alto + categoria de risco alta. Fonte: ANA/SNISB (ArcGIS). State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const u = `https://portal1.snirh.gov.br/server/rest/services/SRE/Barragens_SNISB/MapServer/0/query?where=ING_SG_UFMUNICIPIO%3D%27${UF}%27&outFields=*&f=json&resultRecordCount=8000`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const feats = j.features || [];
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map(e => [norm(e.nome), e.cod_ibge]));
const agg = new Map(); let semMatch = 0;
for (const f of feats) { const a = f.attributes; const cod = byNome.get(norm(a.ING_NM_MUNICIPIO)); if (!cod) { semMatch++; continue; } if (!agg.has(cod)) agg.set(cod, { total: 0, danoAlto: 0, riscoAlto: 0 }); const o = agg.get(cod); o.total++; if (/alto/i.test(a.DANO_POTENCIAL || "")) o.danoAlto++; if (/alto/i.test(a.CATEGORIA_RISCO || "")) o.riscoAlto++; }
await db.query(`CREATE TABLE IF NOT EXISTS barragens_sc (cod_ibge TEXT PRIMARY KEY, total INT, dano_alto INT, risco_alto INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM barragens_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { await db.query("INSERT INTO barragens_sc (cod_ibge,total,dano_alto,risco_alto) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET total=EXCLUDED.total,dano_alto=EXCLUDED.dano_alto,risco_alto=EXCLUDED.risco_alto,atualizado=now()", [cod, o.total, o.danoAlto, o.riscoAlto]); n++; }
const c = (await db.query("SELECT count(*) n, sum(total) t, sum(dano_alto) da FROM barragens_sc")).rows[0];
console.log(`✔ barragens_sc: ${n} munis · ${c.t} barragens · ${c.da} de dano potencial ALTO · ${semMatch} sem match de nome`);
await db.end();
