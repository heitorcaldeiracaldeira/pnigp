// Registro de CNPJs do GOVERNO MUNICIPAL (prefeitura + órgãos + RPPS) por município — insumo p/ CGU/Portal da Transparência.
// Fontes limpas: SICONFI /entes (prefeitura, todos os municípios) + orgaos_municipais_sc (entidades já coletadas) + rpps_crp_sc (RPPS/CADPREV).
// State-agnostic (UF env). NÃO substitui o dump completo da RFB (natureza jurídica municipal), mas cobre os principais recebedores de recurso federal.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const only = (s) => String(s || "").replace(/\D/g, "");
const validos = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map((e) => e.cod_ibge));

await db.query(`CREATE TABLE IF NOT EXISTS cnpj_municipal_sc (cod_ibge TEXT, cnpj TEXT, razao_social TEXT, tipo TEXT, fonte TEXT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, cnpj))`);
await db.query("DELETE FROM cnpj_municipal_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");

const reg = new Map(); // chave cod_ibge|cnpj → {cod,cnpj,razao,tipo,fonte}
const add = (cod, cnpj, razao, tipo, fonte) => { cnpj = only(cnpj); if (cnpj.length !== 14 || !validos.has(cod)) return; const k = cod + "|" + cnpj; if (!reg.has(k)) reg.set(k, { cod, cnpj, razao: razao || null, tipo, fonte }); };

// 1) SICONFI /entes — prefeitura (esfera M), um CNPJ por município
const sic = await (await fetch(`https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes?uf=${UF}`, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
for (const e of (sic.items || [])) { if (e.esfera === "M") add(String(e.cod_ibge), e.cnpj, e.ente, "prefeitura", "SICONFI/Tesouro"); }
const nPref = reg.size;

// 2) orgaos_municipais_sc — entidades já coletadas (fundos/autarquias)
for (const r of (await db.query("SELECT cod_ibge, cnpj FROM orgaos_municipais_sc")).rows) add(r.cod_ibge, r.cnpj, null, "orgao", "orgaos_municipais_sc");
const nOrg = reg.size - nPref;

// 3) rpps_crp_sc — RPPS (CADPREV)
for (const r of (await db.query("SELECT DISTINCT cod_ibge, nr_cnpj_entidade, no_ente FROM rpps_crp_sc WHERE cod_ibge IS NOT NULL").catch(() => ({ rows: [] }))).rows) add(r.cod_ibge, r.nr_cnpj_entidade, r.no_ente, "rpps", "CADPREV/SPREV");
const nRpps = reg.size - nPref - nOrg;

for (const v of reg.values()) await db.query("INSERT INTO cnpj_municipal_sc (cod_ibge,cnpj,razao_social,tipo,fonte) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cod_ibge,cnpj) DO UPDATE SET razao_social=COALESCE(cnpj_municipal_sc.razao_social,EXCLUDED.razao_social)", [v.cod, v.cnpj, v.razao, v.tipo, v.fonte]);
const cc = (await db.query("SELECT count(*) n, count(DISTINCT cod_ibge) m FROM cnpj_municipal_sc")).rows[0];
console.log(`✔ cnpj_municipal_sc: ${cc.n} CNPJs · ${cc.m} municípios (prefeitura +${nPref} · órgãos +${nOrg} · RPPS +${nRpps})`);
await db.end();
