// IBGE Censo 2022 — domicílios particulares permanentes ocupados + densidade (moradores/domicílio) por município. Fonte: IBGE tabela 4712 (universo). State-agnostic.
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const numI = (v) => { const n = parseInt(String(v).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const numF = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/4712/periodos/2022/variaveis/381|382|5930?localidades=N6[N3[${UFC}]]`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const pick = (varId) => { const vr = j.find(x => String(x.id) === String(varId)); const m = {}; for (const s of (vr?.resultados?.[0]?.series || [])) m[s.localidade.id] = Object.values(s.serie)[0]; return m; };
const dom = pick(381), mor = pick(382), med = pick(5930);
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS domicilios_sc (cod_ibge TEXT PRIMARY KEY, domicilios INT, moradores INT, densidade NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM domicilios_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const cod of by7) { const d = numI(dom[cod]); if (!d) continue; const mo = numI(mor[cod]); const dens = numF(med[cod]) || (mo / d); await db.query("INSERT INTO domicilios_sc (cod_ibge,domicilios,moradores,densidade) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET domicilios=EXCLUDED.domicilios,moradores=EXCLUDED.moradores,densidade=EXCLUDED.densidade,atualizado=now()", [cod, d, mo, Math.round(dens * 100) / 100]); n++; }
const c = (await db.query("SELECT count(*) n, sum(domicilios) d, round(avg(densidade),2) dm FROM domicilios_sc")).rows[0];
console.log(`✔ domicilios_sc: ${c.n} munis · ${c.d} domicílios · densidade média ${c.dm} moradores/domicílio`);
await db.end();
