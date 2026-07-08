// PIB municipal a preços correntes (NOMINAL) + PIB per capita por município. Fonte: IBGE SIDRA tabela 5938, var 37. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const num = (v) => { const n = parseInt(String(v).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const H = { "User-Agent": "Mozilla/5.0" };
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/all/variaveis/37?localidades=N6[N3[${UFC}]]`;
const j = await (await fetch(u, { headers: H })).json();
const serie = j[0]?.resultados?.[0]?.series || [];
// componentes do PIB, SÉRIE HISTÓRICA (VAB tem defasagem — não vai até 2023): agro 513, indústria 517, serviços 6575, adm pública 525, impostos 543
const uc = `https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/all/variaveis/513|517|6575|525|543?localidades=N6[N3[${UFC}]]`;
const jc = await (await fetch(uc, { headers: H })).json();
const CMAP = { 513: "agro", 517: "ind", 6575: "serv", 525: "adm", 543: "imp" };
const compAno = new Map(); // cod -> { ano -> {agro,ind,serv,adm,imp} }
for (const vr of jc) { const key = CMAP[+vr.id]; if (!key) continue; for (const s of (vr.resultados?.[0]?.series || [])) { const cod = s.localidade.id; if (!compAno.has(cod)) compAno.set(cod, {}); const porAno = compAno.get(cod); for (const [a, v] of Object.entries(s.serie)) { const val = num(v) * 1000; if (!porAno[a]) porAno[a] = {}; porAno[a][key] = val; } } }
// vira série ordenada, só anos com dado (soma > 0)
const compSerie = new Map();
for (const [cod, porAno] of compAno) { const arr = Object.entries(porAno).map(([ano, o]) => ({ ano, agro: o.agro || 0, ind: o.ind || 0, serv: o.serv || 0, adm: o.adm || 0, imp: o.imp || 0 })).filter((x) => (x.agro + x.ind + x.serv + x.adm + x.imp) > 0).sort((a, b) => a.ano.localeCompare(b.ano)); if (arr.length) compSerie.set(cod, arr); }
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
const pop = new Map((await db.query("SELECT cod_ibge, total FROM populacao_faixa_sc").catch(() => ({ rows: [] })).then(r => r.rows || [])).map(e => [e.cod_ibge, e.total]));
await db.query(`CREATE TABLE IF NOT EXISTS pib_municipal_sc (cod_ibge TEXT PRIMARY KEY, ano TEXT, pib NUMERIC, pib_per_capita NUMERIC, serie JSONB, componentes_serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`ALTER TABLE pib_municipal_sc ADD COLUMN IF NOT EXISTS serie JSONB, ADD COLUMN IF NOT EXISTS componentes_serie JSONB`);
await db.query("DELETE FROM pib_municipal_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0, ano = "";
for (const s of serie) { const cod = s.localidade.id; if (!by7.has(cod)) continue; const anos = Object.entries(s.serie).map(([a, v]) => ({ ano: a, pib: num(v) * 1000 })).filter((x) => x.pib > 0).sort((a, b) => a.ano.localeCompare(b.ano)); if (!anos.length) continue; const ult = anos[anos.length - 1]; ano = ult.ano; const pc = pop.get(cod) ? Math.round(ult.pib / pop.get(cod)) : null; const cs = compSerie.get(cod) || null; await db.query("INSERT INTO pib_municipal_sc (cod_ibge,ano,pib,pib_per_capita,serie,componentes_serie) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano,pib=EXCLUDED.pib,pib_per_capita=EXCLUDED.pib_per_capita,serie=EXCLUDED.serie,componentes_serie=EXCLUDED.componentes_serie,atualizado=now()", [cod, ult.ano, ult.pib, pc, JSON.stringify(anos), cs ? JSON.stringify(cs) : null]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(pib)/1e9,1) bi, max(jsonb_array_length(componentes_serie)) pts FROM pib_municipal_sc")).rows[0];
console.log(`✔ pib_municipal_sc: ${c.n} munis · PIB ${ano} · componentes ${c.pts} anos · PIB total SC R$ ${c.bi} bi (nominal)`);
await db.end();
