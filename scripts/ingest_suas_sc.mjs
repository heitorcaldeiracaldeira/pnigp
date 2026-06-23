// ETL — Assistência social / FNAS por município de SC (MDS · MI Social / CadSUAS). Quantidade de CRAS, CREAS e
// unidades de acolhimento + população + repasse FNAS fundo-a-fundo. Base do sinal de DÉFICIT da assistência
// (habitantes por CRAS vs referência MDS de 1 CRAS por 20 mil hab). Fonte: API Solr da Matriz de Informações Sociais
// (aplicacoes.mds.gov.br/sagi/servicos/misocial). Idempotente. node scripts/ingest_suas_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_PREFIX = process.env.UF_IBGE || "42"; // SC
const API = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) || v == null ? null : n; };

async function get(url) {
  for (let t = 0; t < 5; t++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60000) }); if (!r.ok) throw 0; return await r.json(); }
    catch { await sleep(2500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const fl = "codigo_ibge,municipio,anomes,cadsuas_qtd_cras_i,cadsuas_qtd_creas_i,cadsuas_qtd_unidade_acolhimento_i,populacao_censo_2022_i,suas_repasse_mun_vl_fundo_a_fundo_f";
  const q = encodeURIComponent(`codigo_ibge:${UF_PREFIX}* AND cadsuas_qtd_cras_i:[0 TO *]`);
  console.log("Coletando CadSUAS (CRAS/CREAS) da MI Social…");
  const j = await get(`${API}?q=${q}&fl=${fl}&sort=anomes desc&rows=20000&wt=json`);
  if (!j || !j.response) { console.error("falha MI Social"); process.exit(1); }
  // dedupe: 1 doc por município, mantendo o anomes mais recente (já vem ordenado desc)
  const porMun = new Map();
  for (const d of j.response.docs) { const cod = String(d.codigo_ibge); if (!porMun.has(cod)) porMun.set(cod, d); }
  console.log(`  ${j.response.numFound} docs · ${porMun.size} municípios (último período por ente)`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  await db.query(`CREATE TABLE IF NOT EXISTS suas_sc (
    cod_ibge TEXT PRIMARY KEY, municipio TEXT, anomes TEXT, cras INTEGER, creas INTEGER, acolhimento INTEGER,
    populacao INTEGER, hab_por_cras NUMERIC, fnas_repasse NUMERIC, atualizado_em timestamptz DEFAULT now())`);
  // MI Social usa IBGE de 6 dígitos (sem dígito verificador) — resolve p/ o código de 7 dígitos do nosso sistema
  const map6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc`)).rows.map((r) => [String(r.cod_ibge).slice(0, 6), String(r.cod_ibge)]));
  let n = 0, naoResolv = 0;
  for (const d of porMun.values()) {
    const cod7 = map6.get(String(d.codigo_ibge).slice(0, 6));
    if (!cod7) { naoResolv++; continue; }
    const cras = num(d.cadsuas_qtd_cras_i), pop = num(d.populacao_censo_2022_i);
    const hpc = cras && cras > 0 && pop ? pop / cras : null;
    await db.query(`INSERT INTO suas_sc (cod_ibge,municipio,anomes,cras,creas,acolhimento,populacao,hab_por_cras,fnas_repasse,atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET anomes=EXCLUDED.anomes, cras=EXCLUDED.cras, creas=EXCLUDED.creas, acolhimento=EXCLUDED.acolhimento, populacao=EXCLUDED.populacao, hab_por_cras=EXCLUDED.hab_por_cras, fnas_repasse=EXCLUDED.fnas_repasse, atualizado_em=now()`,
      [cod7, d.municipio || null, String(d.anomes || ""), cras, num(d.cadsuas_qtd_creas_i), num(d.cadsuas_qtd_unidade_acolhimento_i), pop, hpc, num(d.suas_repasse_mun_vl_fundo_a_fundo_f)]);
    n++;
  }
  const r = (await db.query(`SELECT count(*) n, sum(cras) cras, round(avg(hab_por_cras)) media_hpc, count(*) FILTER (WHERE hab_por_cras > 20000) deficit FROM suas_sc`)).rows[0];
  console.log(`suas_sc: ${n} municípios (${naoResolv} não resolvidos) · ${r.cras} CRAS · média ${r.media_hpc} hab/CRAS · ${r.deficit} com déficit (>20 mil hab/CRAS)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
