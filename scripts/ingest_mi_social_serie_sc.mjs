// ETL — MI SOCIAL série histórica COMPLETA por município (SAGI/MDS, API Solr pública). Formato longo (cod, anomes, indicador, valor).
// Insumo do moat (granular + série + demografia). Indicadores curados; todos os meses disponíveis (desde ~2004). Bulk insert via UNNEST.
// Truque: codigo_ibge ENTRE ASPAS. node scripts/ingest_mi_social_serie_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial";
// indicador curado -> campo no Solr
const IND = {
  pbf_familias: "qtd_familias_beneficiarias_bolsa_familia", pbf_valor: "pbf_vlr_repassado_d", pbf_valor_medio: "valor_medio_familias_benef_do_pbf_sem_ae_aer_f",
  pbf_mulheres: "qtd_pes_total_pbf_sexo_feminino_i", pbf_homens: "qtd_pes_total_pbf_sexo_masculino_i",
  bpc_beneficiarios: "bpc_ben_i", bpc_valor: "bpc_val_f",
  // NÃO ingerir bpc_idosos/bpc_deficientes: o campo da fonte é um snapshot CONGELADO de mai/2018 (não varia no tempo). Ver QA.
  cad_elegiveis_pbf: "cadunico_tot_pes_rpc_ate_meio_sm_pbf_i", cad_pobreza: "cadunico_tot_pes_pob_e_ext_pob_pbf_i",
  cad_mulheres: "qtd_pes_total_cadunico_sexo_feminino_i", cad_homens: "qtd_pes_total_cadunico_sexo_masculino_i", cad_criancas_0_15: "qtd_pes_total_cadunico_idade_0_a_15_i",
  cond_saude_cobertura: "tx_cobertura_acompanhamento_saude_cond_pbf_f", cond_saude_cumprimento: "tx_cumprimento_saude_mulheres_criancas_cond_pbf_f",
  cond_educacao_cobertura: "tx_cobertura_acomp_cri_adol_6_a_17_anos_educacao_cond_pbf_f", igd_recebeu: "ind_municipio_recebeu_recurso_igdm_i",
};
const CAMPOS = Object.values(IND);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function serieDe(cod6) {
  for (let t = 0; t < 4; t++) {
    try {
      const u = `${BASE}?q=codigo_ibge:%22${cod6}%22&sort=anomes_s+asc&rows=400&fl=anomes_s,${CAMPOS.join(",")}&wt=json`;
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      return (await r.json()).response?.docs || [];
    } catch { await sleep(1500 * (t + 1)); }
  }
  return [];
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS mi_social_serie_sc (cod_ibge TEXT, anomes TEXT, indicador TEXT, valor NUMERIC, PRIMARY KEY (cod_ibge, anomes, indicador))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC' ORDER BY cod_ibge`)).rows;
  let ok = 0, linhas = 0;
  for (const e of entes) {
    const docs = await serieDe(String(e.cod_ibge).slice(0, 6));
    if (!docs.length) continue;
    const aA = [], iA = [], vA = [];
    for (const d of docs) {
      const am = String(d.anomes_s || ""); if (!/^\d{6}$/.test(am)) continue;
      for (const [k, f] of Object.entries(IND)) {
        const v = d[f]; if (v == null || v === "") continue;
        const nv = Number(v); if (!Number.isFinite(nv)) continue;
        aA.push(am); iA.push(k); vA.push(nv);
      }
    }
    if (aA.length) {
      // bulk insert por município via UNNEST (rápido)
      await q(`INSERT INTO mi_social_serie_sc (cod_ibge,anomes,indicador,valor)
               SELECT $1, t.a, t.i, t.v FROM unnest($2::text[],$3::text[],$4::numeric[]) t(a,i,v)
               ON CONFLICT (cod_ibge,anomes,indicador) DO UPDATE SET valor=EXCLUDED.valor`, [e.cod_ibge, aA, iA, vA]);
      linhas += aA.length;
    }
    ok++;
    if (ok % 30 === 0) console.log(`  ${ok}/295 municípios · ${linhas} linhas`);
    await sleep(60);
  }
  const t = await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) m, count(distinct indicador) ind, min(anomes) ini, max(anomes) fim FROM mi_social_serie_sc`);
  const x = t.rows[0];
  console.log(`Concluído: ${x.linhas} linhas · ${x.m} municípios · ${x.ind} indicadores · período ${x.ini}–${x.fim}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
