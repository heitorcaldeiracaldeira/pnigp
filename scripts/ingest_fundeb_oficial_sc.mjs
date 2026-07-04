// ETL — Matrículas FUNDEB OFICIAIS por município (FNDE, Plataforma Antonieta de Barros, produto 36 "Matriculas - FUNDEB").
// Classificação oficial do FUNDEB (tipo_educacao/ensino/turma/carga/localização) + DUPLA matrícula de educação especial.
// Anos 2025 e 2026 (parâmetros vigentes). Casa por (UF, nome) → cod_ibge. Rede MUNICIPAL. Base do Painel FUNDEB Retrato.
// Baixa via curl (FNDE trava node fetch). node scripts/ingest_fundeb_oficial_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ART = "https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/36/artifact";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nn = (v) => { const x = Number(String(v || "").trim()); return Number.isFinite(x) ? x : 0; };
const ENS = { infantil: /INFANTIL/, fundamental: /FUNDAMENTAL/, medio: /M[ÉE]DIO/, profissional: /PROFISSION/, eja: /EJA/ };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));

  console.log("baixando FUNDEB_Matriculas (FNDE)…");
  const gz = path.join(os.tmpdir(), "fundeb_mat.txt.gz");
  execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", gz, ART], { stdio: "ignore" });
  const txt = zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8");
  const linhas = txt.split(/\r?\n/);
  const head = linhas[0].split(";");
  const ci = (n) => head.indexOf(n);
  const iUF = ci("sg_uf"), iMun = ci("no_municipio_ge"), iEsf = ci("esfera_administrativa"), iEdu = ci("ds_tipo_educacao"), iEns = ci("ds_tipo_ensino"), iCarga = ci("ds_tipo_carga_horaria"), iLoc = ci("ds_tipo_localizacao"), iAno = ci("nu_ano_censo"), iQt = ci("qtd_matricula");

  const M = new Map(); // cod|ano -> agregados
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";"); if (c.length < head.length) continue;
    if (c[iUF] !== UF || !/MUNICIPAL/i.test(c[iEsf] || "")) continue;
    const cod = byName.get(norm(c[iMun])); if (!cod) continue;
    const ano = nn(c[iAno]); const qt = nn(c[iQt]); if (!ano) continue;
    const k = cod + "|" + ano;
    if (!M.has(k)) M.set(k, { cod, ano, total: 0, integral: 0, especial: 0, rural: 0, infantil: 0, fundamental: 0, medio: 0, profissional: 0, eja: 0 });
    const m = M.get(k); m.total += qt;
    if (/INTEGRAL/i.test(c[iCarga] || "")) m.integral += qt;
    if (/ESPECIAL/i.test(c[iEdu] || "")) m.especial += qt;
    if (/RURAL/i.test(c[iLoc] || "")) m.rural += qt;
    for (const [k2, re] of Object.entries(ENS)) if (re.test(c[iEns] || "")) { m[k2] += qt; break; }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS fundeb_oficial_sc (
    cod_ibge TEXT, ano INTEGER, total INTEGER, integral INTEGER, especial INTEGER, rural INTEGER,
    infantil INTEGER, fundamental INTEGER, medio INTEGER, profissional INTEGER, eja INTEGER, segmentos_ativos INTEGER,
    atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  const GRANDES = ["infantil", "fundamental", "medio", "profissional", "eja", "especial"];
  let n = 0;
  for (const m of M.values()) {
    const ativos = GRANDES.filter((k) => m[k] > 0).length;
    await db.query(`INSERT INTO fundeb_oficial_sc (cod_ibge,ano,total,integral,especial,rural,infantil,fundamental,medio,profissional,eja,segmentos_ativos,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET total=EXCLUDED.total,integral=EXCLUDED.integral,especial=EXCLUDED.especial,rural=EXCLUDED.rural,infantil=EXCLUDED.infantil,fundamental=EXCLUDED.fundamental,medio=EXCLUDED.medio,profissional=EXCLUDED.profissional,eja=EXCLUDED.eja,segmentos_ativos=EXCLUDED.segmentos_ativos,atualizado=now()`,
      [m.cod, m.ano, Math.round(m.total), Math.round(m.integral), Math.round(m.especial), Math.round(m.rural), Math.round(m.infantil), Math.round(m.fundamental), Math.round(m.medio), Math.round(m.profissional), Math.round(m.eja), ativos]);
    n++;
  }
  const chk = (await db.query(`SELECT ano, count(*) munis, sum(total) tot, round(100.0*sum(integral)/nullif(sum(total),0),1) pct_int FROM fundeb_oficial_sc GROUP BY ano ORDER BY ano`)).rows;
  console.log(`✔ fundeb_oficial_sc: ${n} linhas`); chk.forEach((r) => console.log(`   ${r.ano}: ${r.munis} munis · ${r.tot} matrículas FUNDEB · ${r.pct_int}% integral`));
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
