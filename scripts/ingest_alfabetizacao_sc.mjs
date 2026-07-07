// IBGE Censo 2022 — taxa de alfabetização das pessoas de 15 anos ou mais por município. Fonte: IBGE tabela 9543. State-agnostic.
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const numF = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/9543/periodos/2022/variaveis/2513?localidades=N6[N3[${UFC}]]&classificacao=2[6794]|86[95251]|287[100362]`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const serie = j[0]?.resultados?.[0]?.series || [];
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS alfabetizacao_sc (cod_ibge TEXT PRIMARY KEY, taxa NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM alfabetizacao_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const s of serie) { const cod = s.localidade.id; if (!by7.has(cod)) continue; const taxa = numF(Object.values(s.serie)[0]); if (taxa == null) continue; await db.query("INSERT INTO alfabetizacao_sc (cod_ibge,taxa) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET taxa=EXCLUDED.taxa,atualizado=now()", [cod, taxa]); n++; }
const c = (await db.query("SELECT count(*) n, round(avg(taxa),2) m, round(min(taxa),1) mn FROM alfabetizacao_sc")).rows[0];
console.log(`✔ alfabetizacao_sc: ${c.n} munis · taxa média ${c.m}% · menor ${c.mn}%`);
await db.end();
