// ETL — BPC (Benefício de Prestação Continuada) por município, via MI Social (SAGI/MDS), API Solr pública.
// Idosos e pessoas com deficiência de baixa renda (1 salário mínimo). Fecha a renda federal social do município.
// Truque: codigo_ibge ENTRE ASPAS; pega o ÚLTIMO período COM dado (202612 = mês futuro, vem vazio). Grava em assistencia_social_sc.
// node scripts/ingest_bpc_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial";
const FL = "anomes_s,bpc_ben_i,bpc_val_f,bpc_residencia_quantidade_idosos_i,bpc_residencia_quantidade_deficientes_i";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function bpcDe(cod6) {
  for (let t = 0; t < 4; t++) {
    try {
      const u = `${BASE}?q=codigo_ibge:%22${cod6}%22&sort=anomes_s+desc&rows=48&fl=${FL}&wt=json`;
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      const docs = (await r.json()).response?.docs || [];
      // último período com beneficiários > 0 (ignora 202612 vazio)
      const d = docs.find((x) => Number(x.bpc_ben_i) > 0);
      if (!d) return null;
      return { anomes: d.anomes_s, ben: Number(d.bpc_ben_i) || 0, val: Number(d.bpc_val_f) || 0,
               idosos: Number(d.bpc_residencia_quantidade_idosos_i) || 0, defic: Number(d.bpc_residencia_quantidade_deficientes_i) || 0 };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  for (const c of ["bpc_beneficiarios NUMERIC", "bpc_valor NUMERIC", "bpc_idosos NUMERIC", "bpc_deficientes NUMERIC", "bpc_anomes TEXT"])
    await db.query(`ALTER TABLE assistencia_social_sc ADD COLUMN IF NOT EXISTS ${c}`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC' ORDER BY cod_ibge`)).rows;
  let ok = 0;
  for (const e of entes) {
    const d = await bpcDe(String(e.cod_ibge).slice(0, 6));
    if (!d) continue;
    await q(`UPDATE assistencia_social_sc SET bpc_beneficiarios=$2, bpc_valor=$3, bpc_idosos=$4, bpc_deficientes=$5, bpc_anomes=$6 WHERE cod_ibge=$1`,
      [e.cod_ibge, d.ben, d.val, d.idosos, d.defic, d.anomes]);
    ok++;
    if (ok % 50 === 0) console.log(`  ${ok} municípios`);
    await sleep(70);
  }
  const t = await db.query(`SELECT count(*) FILTER(WHERE bpc_beneficiarios>0) m, sum(bpc_beneficiarios) ben, round(sum(bpc_valor)/1e6,1) mi FROM assistencia_social_sc`);
  console.log(`Concluído: ${ok} atualizados · ${t.rows[0].m} com BPC · ${Number(t.rows[0].ben).toLocaleString("pt-BR")} beneficiários · R$ ${t.rows[0].mi} mi/mês`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
