// ETL — IBGE produção agropecuária (PAM/PPM) + empresas (CEMPRE) por município via SIDRA. Complementa Agropecuária e Base Econômica.
// PAM 5457 (valor da produção agrícola + área), PPM 3939 (efetivo de rebanhos por tipo), CEMPRE 9509 (empresas/pessoal/salário).
// node scripts/ingest_ibge_producao_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UFCOD || "42";
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sidra = async (path) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(`https://apisidra.ibge.gov.br/values/${path}`, { signal: AbortSignal.timeout(60000), headers: { "User-Agent": "Mozilla/5.0" } }); if (r.ok) { const j = await r.json(); return j.slice(1); } } catch (e) {} await new Promise((s) => setTimeout(s, 3000 * (t + 1))); } return []; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const M = new Map(); const g = (c) => { if (!M.has(c)) M.set(c, {}); return M.get(c); };

  // PAM 5457 — valor da produção agrícola + área colhida (produto=Total)
  console.log("PAM (valor da produção agrícola)…");
  for (const r of await sidra(`t/5457/n6/in%20n3%20${UF}/p/last/v/all`)) {
    const c = r.D1C; const v = num(r.V); const va = r.D3N || "";
    if (/^Valor da produção$/.test(va)) g(c).vbp = v * 1000; // valor vem em Mil Reais
    else if (/^Área colhida$/.test(va)) g(c).area = v;
    g(c).pam_ano = r.D2C;
  }
  // PPM 3939 — efetivo de rebanhos por tipo (classificação c79)
  console.log("PPM (efetivo de rebanhos)…");
  for (const r of await sidra(`t/3939/n6/in%20n3%20${UF}/p/last/v/all/c79/all`)) {
    const c = r.D1C; const v = num(r.V); const tipo = (r.D4N || "").toLowerCase();
    if (/bovino/.test(tipo)) g(c).bovino = v;
    else if (/suíno.*total|suíno$/.test(tipo)) g(c).suino = v;
    else if (/galináceos.*total|galináceos$/.test(tipo)) g(c).aves = v;
    g(c).ppm_ano = r.D2C;
  }
  // CEMPRE 9509 — empresas / pessoal / salário
  console.log("CEMPRE (empresas/pessoal)…");
  for (const r of await sidra(`t/9509/n6/in%20n3%20${UF}/p/last/v/all`)) {
    const c = r.D1C; const v = num(r.V); const va = r.D3N || "";
    if (/^Número de empresas/.test(va)) g(c).empresas = v;
    else if (/^Pessoal ocupado total$/.test(va)) g(c).pessoal = v;
    else if (/^Salário médio mensal em reais$/.test(va) || /^Salário médio mensal$/.test(va)) g(c).salario_sm = v;
    g(c).cempre_ano = r.D2C;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS ibge_producao_sc (cod_ibge TEXT PRIMARY KEY, vbp_agricola NUMERIC, area_colhida_ha NUMERIC, efetivo_bovino BIGINT, efetivo_suino BIGINT, efetivo_aves BIGINT, n_empresas INTEGER, pessoal_ocupado INTEGER, salario_sm NUMERIC, pam_ano INTEGER, ppm_ano INTEGER, cempre_ano INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE ibge_producao_sc`);
  const cods = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  let n = 0;
  for (const [c, d] of M) {
    if (!cods.has(c)) continue;
    await db.query(`INSERT INTO ibge_producao_sc (cod_ibge,vbp_agricola,area_colhida_ha,efetivo_bovino,efetivo_suino,efetivo_aves,n_empresas,pessoal_ocupado,salario_sm,pam_ano,ppm_ano,cempre_ano) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c, d.vbp || null, d.area || null, d.bovino || null, d.suino || null, d.aves || null, d.empresas || null, d.pessoal || null, d.salario_sm || null, d.pam_ano || null, d.ppm_ano || null, d.cempre_ano || null]); n++;
  }
  const chk = (await db.query(`SELECT count(*) m, round(sum(vbp_agricola)/1e9,2) vbp, sum(efetivo_aves) aves, sum(pessoal_ocupado) pes FROM ibge_producao_sc`)).rows[0];
  console.log(`✔ ibge_producao_sc: ${chk.m} munis · VBP agrícola R$ ${chk.vbp} bi · ${Number(chk.aves).toLocaleString("pt-BR")} aves · ${Number(chk.pes).toLocaleString("pt-BR")} pessoal ocupado`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
