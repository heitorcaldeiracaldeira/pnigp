// ETL — Estabelecimentos de saúde por município (CNES, API DEMAS). Rede PÚBLICA (municipal/estadual/federal): cada
// unidade com tipo, gestão, esfera, SUS, centro cirúrgico/obstétrico, geo. Espelha as escolas. Idempotente + resumível.
// node scripts/ingest_cnes_estab_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) || v == null ? null : n; };
// rótulos dos tipos de unidade (CNES TP_UNID) — principais
const TIPO = { 1: "Posto de Saúde", 2: "Centro de Saúde / UBS", 4: "Policlínica", 5: "Hospital Geral", 7: "Hospital Especializado", 15: "Unidade Mista", 20: "Pronto Socorro Geral", 21: "Pronto Socorro Especializado", 22: "Consultório Isolado", 36: "Clínica / Centro de Especialidade", 39: "Apoio Diagnose e Terapia (SADT)", 40: "Unidade Móvel Terrestre", 42: "Unidade Móvel Fluvial", 43: "Farmácia", 45: "Unidade de Saúde da Família", 50: "Unidade de Vigilância em Saúde", 60: "Cooperativa", 61: "Centro de Parto Normal", 62: "Hospital/Dia", 67: "Laboratório", 68: "Central de Gestão", 69: "Hemocentro", 70: "CAPS", 71: "Centro de Apoio", 72: "Saúde Indígena", 73: "Pronto Atendimento (UPA)", 74: "Academia da Saúde", 76: "Central de Regulação", 77: "CEO (odontológico)", 78: "Residencial Terapêutico", 80: "Lab. Saúde Pública", 81: "Captação de Órgãos", 82: "Central de Regulação Médica", 83: "Polo de Prevenção" };

const natGrupo = (cod) => { const c = String(cod || ""); return c.startsWith("1") ? "Público" : c.startsWith("2") ? "Privado" : c.startsWith("3") ? "Filantrópico" : "Outro"; };
async function api(mun, offset) {
  const url = `${API}?codigo_municipio=${mun}&limit=20&offset=${offset}`;
  for (let t = 0; t < 5; t++) { try { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(40000) }); if (!r.ok) throw 0; const j = await r.json(); return j.estabelecimentos || []; } catch { await sleep(1500 * (t + 1)); } }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS estabelecimentos_saude_sc (
    codigo_cnes TEXT PRIMARY KEY, cod_ibge TEXT, nome TEXT, tipo_codigo INTEGER, tipo TEXT, gestao TEXT, esfera TEXT,
    sus_ambulatorial BOOLEAN, hospitalar BOOLEAN, centro_cirurgico BOOLEAN, centro_obstetrico BOOLEAN, centro_neonatal BOOLEAN,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, bairro TEXT, telefone TEXT)`);
  await db.query(`ALTER TABLE estabelecimentos_saude_sc ADD COLUMN IF NOT EXISTS natureza_grupo TEXT`);
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_estab_check (cod_ibge TEXT PRIMARY KEY, n INTEGER)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ${process.env.MUN ? "AND cod_ibge=$1" : ""} ORDER BY cod_ibge`, process.env.MUN ? [process.env.MUN] : [])).rows
    .map((e) => ({ ibge7: e.cod_ibge, ibge6: String(e.cod_ibge).slice(0, 6) }));
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM cnes_estab_check`)).rows.map((r) => r.cod_ibge));
  let proc = 0, grav = 0;
  for (const e of entes) {
    if (feitos.has(e.ibge7)) continue;
    let n = 0;
    for (let off = 0; off < 20000; off += 20) {
      const arr = await api(e.ibge6, off);
      await sleep(150);
      if (!arr || !arr.length) break;
      for (const x of arr) {
        await q(`INSERT INTO estabelecimentos_saude_sc (codigo_cnes,cod_ibge,nome,tipo_codigo,tipo,gestao,esfera,natureza_grupo,sus_ambulatorial,hospitalar,centro_cirurgico,centro_obstetrico,centro_neonatal,latitude,longitude,bairro,telefone)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (codigo_cnes) DO UPDATE SET nome=EXCLUDED.nome, tipo=EXCLUDED.tipo, gestao=EXCLUDED.gestao, esfera=EXCLUDED.esfera, natureza_grupo=EXCLUDED.natureza_grupo, sus_ambulatorial=EXCLUDED.sus_ambulatorial, hospitalar=EXCLUDED.hospitalar, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude`,
          [String(x.codigo_cnes), e.ibge7, x.nome_fantasia || x.nome_razao_social, num(x.codigo_tipo_unidade), TIPO[num(x.codigo_tipo_unidade)] || `Tipo ${x.codigo_tipo_unidade}`, x.tipo_gestao, x.descricao_esfera_administrativa, natGrupo(x.descricao_natureza_juridica_estabelecimento),
            x.estabelecimento_faz_atendimento_ambulatorial_sus === true, x.estabelecimento_possui_atendimento_hospitalar === true, x.estabelecimento_possui_centro_cirurgico === true, x.estabelecimento_possui_centro_obstetrico === true, x.estabelecimento_possui_centro_neonatal === true,
            num(x.latitude_estabelecimento_decimo_grau), num(x.longitude_estabelecimento_decimo_grau), x.bairro_estabelecimento || null, x.numero_telefone_estabelecimento || null]);
        n++; grav++;
      }
      if (arr.length < 20) break;
    }
    await q(`INSERT INTO cnes_estab_check (cod_ibge,n) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET n=EXCLUDED.n`, [e.ibge7, n]);
    proc++;
    if (proc % 20 === 0) console.log(`  ${proc}/${entes.length} municípios · ${grav} estabelecimentos`);
  }
  const r = await db.query(`SELECT count(*) tot, count(distinct cod_ibge) entes FROM estabelecimentos_saude_sc`);
  console.log(`CNES estabelecimentos concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
