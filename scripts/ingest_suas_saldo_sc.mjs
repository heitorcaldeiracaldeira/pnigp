// SUAS — repasse do FNAS + SALDO em conta (recurso na mesa) por município. Fonte: MDS/SAGI (Solr misocial). State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const B = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial";
const UF = process.env.UF || "SC";
const get = async (u) => (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
// última competência com saldo p/ a UF
const j1 = await get(`${B}?q=*:*&fq=sigla_uf:${UF}&fq=suas_saldo_cc_mun_vl_total_geral_f:[0 TO *]&sort=anomes desc&rows=1&wt=json&fl=anomes`);
const comp = j1.response?.docs?.[0]?.anomes;
if (!comp) { console.error("sem competência SUAS p/ " + UF); process.exit(1); }
const fl = "codigo_ibge,municipio,anomes,suas_repasse_mun_vl_total_fundo_f,suas_saldo_cc_mun_vl_total_geral_f";
const j2 = await get(`${B}?q=*:*&fq=sigla_uf:${UF}&fq=anomes:${comp}&rows=1000&wt=json&fl=${encodeURIComponent(fl)}`);
const docs = j2.response?.docs || [];
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS suas_saldo_sc (cod_ibge TEXT PRIMARY KEY, competencia TEXT, repasse_mes NUMERIC, saldo NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM suas_saldo_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')"); // DELETE-por-UF (não TRUNCATE) p/ multi-UF
let n = 0;
for (const d of docs) { const cod = by6.get(String(d.codigo_ibge)); if (!cod) continue; await db.query("INSERT INTO suas_saldo_sc (cod_ibge,competencia,repasse_mes,saldo) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET competencia=EXCLUDED.competencia,repasse_mes=EXCLUDED.repasse_mes,saldo=EXCLUDED.saldo,atualizado=now()", [cod, comp, +d.suas_repasse_mun_vl_total_fundo_f || 0, +d.suas_saldo_cc_mun_vl_total_geral_f || 0]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(saldo)/1e6,1) mi FROM suas_saldo_sc")).rows[0];
console.log(`✔ suas_saldo_sc: ${n} munis · competência ${comp} · saldo total R$ ${c.mi} mi na mesa`);
await db.end();
