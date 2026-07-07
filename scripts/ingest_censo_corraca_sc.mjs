// IBGE Censo 2022 — população residente por cor/raça por município. Fonte: IBGE (API agregados, tabela 9605). State-agnostic (UF env → cód IBGE).
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const num = (v) => { const n = parseInt(String(v).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/9605/periodos/2022/variaveis/93?localidades=N6[N3[${UFC}]]&classificacao=86[all]`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const cats = {}; // catNome -> {cod6 -> valor}
for (const res of (j[0]?.resultados || [])) { const cat = Object.values(res.classificacoes[0].categoria)[0]; cats[cat] = {}; for (const s of res.series) cats[cat][s.localidade.id.slice(0, 6)] = num(Object.values(s.serie)[0]); }
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS censo_corraca_sc (cod_ibge TEXT PRIMARY KEY, total INT, branca INT, preta INT, amarela INT, parda INT, indigena INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM censo_corraca_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [c6, cod] of by6) { const g = (k) => cats[k]?.[c6] || 0; const tot = g("Total"); if (!tot) continue; await db.query("INSERT INTO censo_corraca_sc (cod_ibge,total,branca,preta,amarela,parda,indigena) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (cod_ibge) DO UPDATE SET total=EXCLUDED.total,branca=EXCLUDED.branca,preta=EXCLUDED.preta,amarela=EXCLUDED.amarela,parda=EXCLUDED.parda,indigena=EXCLUDED.indigena,atualizado=now()", [cod, tot, g("Branca"), g("Preta"), g("Amarela"), g("Parda"), g("Indígena")]); n++; }
const c = (await db.query("SELECT count(*) n, round(100.0*sum(preta+parda)/sum(total),1) pctNegra, sum(indigena) ind FROM censo_corraca_sc")).rows[0];
console.log(`✔ censo_corraca_sc: ${n} munis · SC ${c.pctnegra}% negra (preta+parda) · ${c.ind} indígenas`);
await db.end();
