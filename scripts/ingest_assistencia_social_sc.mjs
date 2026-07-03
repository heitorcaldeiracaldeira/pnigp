// ETL — Assistência social COMPLETA por município de SC (MDS · MI Social Solr).
// (1) assistencia_repasse_sc: SÉRIE ANUAL do repasse FNAS/SUAS recebido (2005→atual · total/PSB/PSE) — "valores recebidos".
// (2) assistencia_social_sc: estoque mais recente — CadÚnico (famílias/pessoas/pobreza/renda zero/atualização),
//     Bolsa Família (famílias, benefício médio) e CRAS/CREAS/acolhimento.
// IBGE 6 dígitos na MI Social → resolve p/ 7 via entes_sc. Idempotente. node scripts/ingest_assistencia_social_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) || v == null ? null : n; };
const FL = ["anomes", "cadsuas_qtd_cras_i", "cadsuas_qtd_creas_i", "cadsuas_qtd_unidade_acolhimento_i", "populacao_censo_2022_i",
  "cadun_qtd_familias_cadastradas_i", "cadun_qtd_pessoas_cadastradas_i", "cadun_qtd_familias_cadastradas_pobreza_pbf_i",
  "cadun_qtd_familias_atualizadas_renda_zero_i", "cadun_taxa_atualizacao_cadastral_d",
  "qtd_familias_beneficiarias_bolsa_familia_i", "pbf_vlr_medio_benef_f",
  "suas_repasse_mun_vl_total_fundo_f", "suas_repasse_mun_vl_psb_f", "suas_repasse_mun_vl_pse_f"].join(",");

async function get(url) {
  for (let t = 0; t < 5; t++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(50000) }); if (!r.ok) throw 0; return await r.json(); }
    catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
const ultimo = (docs, campo) => { for (const d of docs) if (d[campo] != null) return num(d[campo]); return null; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  await db.query(`CREATE TABLE IF NOT EXISTS assistencia_repasse_sc (
    cod_ibge TEXT, ano INTEGER, fnas_total NUMERIC, fnas_psb NUMERIC, fnas_pse NUMERIC, meses INTEGER,
    atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS assistencia_social_sc (
    cod_ibge TEXT PRIMARY KEY, municipio TEXT, anomes_ref TEXT, populacao INTEGER,
    cras INTEGER, creas INTEGER, acolhimento INTEGER, hab_por_cras NUMERIC,
    cad_familias INTEGER, cad_pessoas INTEGER, cad_familias_pobreza INTEGER, cad_familias_renda_zero INTEGER, cad_taxa_atualizacao NUMERIC,
    pbf_familias INTEGER, pbf_beneficio_medio NUMERIC,
    fnas_repasse_ult_ano NUMERIC, fnas_total_historico NUMERIC, ano_ult INTEGER, atualizado_em timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  const entes = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  console.log(`coletando assistência (MI Social, série histórica) p/ ${entes.length} municípios…`);
  let n = 0, totLinhasAno = 0;
  for (const e of entes) {
    const cod6 = String(e.cod_ibge).slice(0, 6);
    const j = await get(`${API}?q=codigo_ibge:${cod6}+AND+anomes:[200001 TO *]&fl=${FL}&sort=anomes desc&rows=400&wt=json`);
    const docs = j?.response?.docs || [];
    if (!docs.length) { if (n % 50 === 0) console.log(`  ${n}/${entes.length}…`); await sleep(120); continue; }

    // (1) série ANUAL de repasse (soma meses por ano)
    const porAno = new Map();
    for (const d of docs) {
      const tot = num(d.suas_repasse_mun_vl_total_fundo_f);
      if (!tot || tot <= 0) continue;
      const ano = Math.floor(Number(d.anomes) / 100);
      if (!porAno.has(ano)) porAno.set(ano, { t: 0, psb: 0, pse: 0, m: 0 });
      const a = porAno.get(ano); a.t += tot; a.psb += num(d.suas_repasse_mun_vl_psb_f) || 0; a.pse += num(d.suas_repasse_mun_vl_pse_f) || 0; a.m++;
    }
    for (const [ano, a] of porAno) {
      await q(`INSERT INTO assistencia_repasse_sc (cod_ibge,ano,fnas_total,fnas_psb,fnas_pse,meses,atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (cod_ibge,ano) DO UPDATE SET fnas_total=EXCLUDED.fnas_total, fnas_psb=EXCLUDED.fnas_psb, fnas_pse=EXCLUDED.fnas_pse, meses=EXCLUDED.meses, atualizado_em=now()`,
        [e.cod_ibge, ano, Math.round(a.t), Math.round(a.psb), Math.round(a.pse), a.m]);
      totLinhasAno++;
    }
    const anos = [...porAno.keys()].sort((x, y) => y - x);
    const anoUlt = anos[0] ?? null;
    const repUlt = anoUlt ? Math.round(porAno.get(anoUlt).t) : null;
    const totHist = Math.round([...porAno.values()].reduce((s, a) => s + a.t, 0));

    // (2) estoque mais recente
    const cras = ultimo(docs, "cadsuas_qtd_cras_i"), pop = ultimo(docs, "populacao_censo_2022_i");
    await q(`INSERT INTO assistencia_social_sc (cod_ibge,municipio,anomes_ref,populacao,cras,creas,acolhimento,hab_por_cras,cad_familias,cad_pessoas,cad_familias_pobreza,cad_familias_renda_zero,cad_taxa_atualizacao,pbf_familias,pbf_beneficio_medio,fnas_repasse_ult_ano,fnas_total_historico,ano_ult,atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET anomes_ref=EXCLUDED.anomes_ref, populacao=EXCLUDED.populacao, cras=EXCLUDED.cras, creas=EXCLUDED.creas, acolhimento=EXCLUDED.acolhimento, hab_por_cras=EXCLUDED.hab_por_cras, cad_familias=EXCLUDED.cad_familias, cad_pessoas=EXCLUDED.cad_pessoas, cad_familias_pobreza=EXCLUDED.cad_familias_pobreza, cad_familias_renda_zero=EXCLUDED.cad_familias_renda_zero, cad_taxa_atualizacao=EXCLUDED.cad_taxa_atualizacao, pbf_familias=EXCLUDED.pbf_familias, pbf_beneficio_medio=EXCLUDED.pbf_beneficio_medio, fnas_repasse_ult_ano=EXCLUDED.fnas_repasse_ult_ano, fnas_total_historico=EXCLUDED.fnas_total_historico, ano_ult=EXCLUDED.ano_ult, atualizado_em=now()`,
      [e.cod_ibge, e.nome, String(docs[0].anomes || ""), pop, cras, ultimo(docs, "cadsuas_qtd_creas_i"), ultimo(docs, "cadsuas_qtd_unidade_acolhimento_i"), cras && cras > 0 && pop ? Math.round(pop / cras) : null,
       ultimo(docs, "cadun_qtd_familias_cadastradas_i"), ultimo(docs, "cadun_qtd_pessoas_cadastradas_i"), ultimo(docs, "cadun_qtd_familias_cadastradas_pobreza_pbf_i"), ultimo(docs, "cadun_qtd_familias_atualizadas_renda_zero_i"), ultimo(docs, "cadun_taxa_atualizacao_cadastral_d"),
       ultimo(docs, "qtd_familias_beneficiarias_bolsa_familia_i"), ultimo(docs, "pbf_vlr_medio_benef_f"), repUlt, totHist, anoUlt]);
    n++;
    if (n % 50 === 0) console.log(`  ${n}/${entes.length}… (${totLinhasAno} linhas-ano)`);
    await sleep(140);
  }
  const r = (await db.query(`SELECT min(ano) a0, max(ano) a1, count(*) linhas, round(sum(fnas_total)/1e6,1) mi FROM assistencia_repasse_sc`)).rows[0];
  console.log(`OK · assistencia_social_sc: ${n} municípios · repasse: ${r.linhas} linhas-ano (${r.a0}–${r.a1}) · R$${r.mi}mi histórico`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
