// PIB municipal a preços correntes (NOMINAL) + PIB per capita por município. Fonte: IBGE SIDRA tabela 5938, var 37. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const num = (v) => { const n = parseInt(String(v).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/-1/variaveis/37?localidades=N6[N3[${UFC}]]`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const serie = j[0]?.resultados?.[0]?.series || [];
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
const pop = new Map((await db.query("SELECT cod_ibge, total FROM populacao_faixa_sc").catch(() => ({ rows: [] })).then(r => r.rows || [])).map(e => [e.cod_ibge, e.total]));
await db.query(`CREATE TABLE IF NOT EXISTS pib_municipal_sc (cod_ibge TEXT PRIMARY KEY, ano TEXT, pib NUMERIC, pib_per_capita NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM pib_municipal_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0, ano = "";
for (const s of serie) { const cod = s.localidade.id; if (!by7.has(cod)) continue; const [a, v] = Object.entries(s.serie)[0] || []; ano = a || ano; const pib = num(v) * 1000; if (!pib) continue; const pc = pop.get(cod) ? Math.round(pib / pop.get(cod)) : null; await db.query("INSERT INTO pib_municipal_sc (cod_ibge,ano,pib,pib_per_capita) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano,pib=EXCLUDED.pib,pib_per_capita=EXCLUDED.pib_per_capita,atualizado=now()", [cod, a, pib, pc]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(pib)/1e9,1) bi FROM pib_municipal_sc")).rows[0];
console.log(`✔ pib_municipal_sc: ${c.n} munis · ano ${ano} · PIB total SC R$ ${c.bi} bi (nominal, preços correntes)`);
await db.end();
