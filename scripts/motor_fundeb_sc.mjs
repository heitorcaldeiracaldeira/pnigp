// MOTOR FUNDEB — calcula matrículas PONDERADAS por município aplicando os fatores oficiais (fatores_fundeb) às
// matrículas FUNDEB (dataset FNDE), e o VAAF = receita ÷ ponderadas. Guarda o passo a passo (breakdown por etapa)
// para o "como chegamos" didático. CONFERÊNCIA: ponderadas × VAAF-estado ≈ receita. node scripts/motor_fundeb_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC"; const ANO = Number(process.env.ANO || 2026);
const ART = "https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/36/artifact";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const nn = (v) => { const x = Number(String(v || "").trim()); return Number.isFinite(x) ? x : 0; };

// DE-PARA DETERMINÍSTICO — constrói o rótulo EXATO do fator a partir das dimensões da matrícula FUNDEB.
// Educação especial (dupla matrícula AEE) = fator 1,40 (1,61 no campo). Regular = etapa × carga × rede × localização.
function segLabel(edu, turma, carga, loc, rede) {
  const t = (turma || "").toUpperCase(), campo = /RURAL|CAMPO/i.test(loc || "") ? " Campo" : "";
  const conv = /CONVEN|PRIVAD|FILANTROP/i.test(rede || "") ? "Conveniada" : "Pública";
  const integral = /INTEGRAL/i.test(carga || "");
  let grande;
  if (/ESPECIAL/i.test(edu || "")) { // dupla matrícula (AEE) — 1,40 / 1,61 campo
    grande = "AEE / Educação Especial";
    return { grande, label: "Educação Especial - Fundamental" + campo };
  }
  if (/CRECHE/.test(t)) { grande = "Creche"; return { grande, label: `Creche ${integral ? "Integral" : "Parcial"} ${conv}${campo}` }; }
  if (/PR[ÉE]-?ESCOLA/.test(t)) { grande = "Pré-Escola"; return { grande, label: `Pré-Escola ${integral ? "Integral" : "Parcial"} ${conv}${campo}` }; }
  if (/INICIAIS/.test(t)) { grande = "Anos Iniciais"; return { grande, label: "Anos Iniciais Fundamental" + campo }; }
  if (/FINAIS/.test(t)) { grande = "Anos Finais"; return { grande, label: "Anos Finais Fundamental" + campo }; }
  if (/ENSINO FUNDAMENTAL/.test(t)) { grande = "Fundamental Integral"; return { grande, label: "Ensino Fundamental Integral" + campo }; } // integral não-seriado
  if (/EJA/.test(t) || /EJA/.test((edu || "").toUpperCase())) { grande = "EJA"; return { grande, label: "EJA Fundamental" + campo }; }
  grande = "Outros (médio/téc/demais)"; return { grande, label: "EJA Fundamental" + campo }; // DEMAIS SEGMENTOS regular municipal ~ EJA
}

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome).replace(/ /g, ""), e.cod_ibge]));
  // fatores → lista {tokens, fator}
  // fatores do ano (usa o ano de fatores mais próximo se o histórico não tiver fatores próprios ingeridos)
  const fatAno = (await db.query(`SELECT ano FROM fatores_fundeb GROUP BY ano ORDER BY abs(ano-$1) LIMIT 1`, [ANO])).rows[0]?.ano || 2026;
  const fmap = new Map((await db.query(`SELECT segmento, fp_final_vaaf FROM fatores_fundeb WHERE ano=$1`, [fatAno])).rows.map((r) => [norm(r.segmento), Number(r.fp_final_vaaf)]));
  console.log(`fatores aplicados: ano ${fatAno} (${fmap.size} segmentos)`);

  // MODO histórico: total público (municipal+estadual), pois o dataset histórico (id 38) não tem esfera.
  const HIST = process.env.HIST === "1"; const TAB = HIST ? "fundeb_hist_sc" : "fundeb_motor_sc";
  // fonte da matrícula por ano: id 36 (2025/2026) · id 38 (histórico até 2024)
  const artId = ANO >= 2025 ? 36 : 38;
  const art = `https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/${artId}/artifact`;
  console.log(`baixando matrículas FUNDEB (produto ${artId})…`);
  const gz = path.join(os.tmpdir(), `fundeb_mat_${artId}.txt.gz`);
  if (!fs.existsSync(gz)) execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", gz, art], { stdio: "ignore" });
  const linhas = zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8").split(/\r?\n/);
  const head = linhas[0].split(";"); const ci = (n) => head.indexOf(n);
  const iUF = ci("sg_uf"), iMun = ci("no_municipio_ge"), iEsf = ci("esfera_administrativa"), iRede = ci("ds_tipo_rede_educacao"), iEdu = ci("ds_tipo_educacao"), iTurma = ci("ds_tipo_turma"), iCarga = ci("ds_tipo_carga_horaria"), iLoc = ci("ds_tipo_localizacao"), iAno = ci("nu_ano_censo"), iQt = ci("qtd_matricula");

  const M = new Map(); let matTot = 0, matMatch = 0; const semFator = new Map();
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";"); if (c.length < head.length) continue;
    if (c[iUF] !== UF || nn(c[iAno]) !== ANO) continue;
    if (!HIST && iEsf >= 0 && !/MUNICIPAL/i.test(c[iEsf] || "")) continue; // municipal só quando a esfera existe (id 36)
    const cod = byName.get(norm(c[iMun]).replace(/ /g, "")); if (!cod) continue;
    const qt = nn(c[iQt]); if (!qt) continue;
    const { grande, label } = segLabel(c[iEdu], c[iTurma], c[iCarga], c[iLoc], c[iRede]);
    let fator = fmap.get(norm(label)); matTot += qt;
    if (fator === undefined) { semFator.set(label, (semFator.get(label) || 0) + qt); fator = 1.0; } else matMatch += qt; // conta a matrícula sempre; loga o que não casou
    if (!M.has(cod)) M.set(cod, { mat: 0, pond: 0, et: new Map() });
    const m = M.get(cod); m.mat += qt; m.pond += qt * fator;
    if (!m.et.has(grande)) m.et.set(grande, { mat: 0, pond: 0 });
    const e = m.et.get(grande); e.mat += qt; e.pond += qt * fator;
  }
  const taxa = matTot ? (100 * matMatch / matTot).toFixed(1) : "0";
  console.log(`  casamento de fatores: ${taxa}% das matrículas (${matMatch}/${matTot})`);
  if (semFator.size) { console.log("  ⚠ rótulos SEM fator (ponderados a 1,0 — revisar de-para):"); [...semFator.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([l, q]) => console.log(`     ${q}  →  ${l}`)); }

  await db.query(`CREATE TABLE IF NOT EXISTS ${TAB} (
    cod_ibge TEXT, ano INTEGER, matriculas INTEGER, ponderadas NUMERIC, receita NUMERIC, vaaf_calc NUMERIC,
    breakdown JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let n = 0; const vaafs = [];
  for (const [cod, m] of M) {
    const rec = Number((await db.query(`SELECT sum(valor) v FROM transferencias_stn_sc WHERE cod_ibge=$1 AND item='FUNDEB' AND ano=$2`, [cod, ANO])).rows[0]?.v || 0);
    const vaaf = m.pond > 0 ? rec / m.pond : 0; if (vaaf > 0) vaafs.push(vaaf);
    const bd = [...m.et.entries()].map(([g, e]) => ({ etapa: g, matriculas: Math.round(e.mat), fator_medio: e.mat ? +(e.pond / e.mat).toFixed(3) : 0, ponderadas: Math.round(e.pond) })).sort((a, b) => b.ponderadas - a.ponderadas);
    await db.query(`INSERT INTO ${TAB} (cod_ibge,ano,matriculas,ponderadas,receita,vaaf_calc,breakdown,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET matriculas=EXCLUDED.matriculas,ponderadas=EXCLUDED.ponderadas,receita=EXCLUDED.receita,vaaf_calc=EXCLUDED.vaaf_calc,breakdown=EXCLUDED.breakdown,atualizado=now()`,
      [cod, ANO, Math.round(m.mat), Math.round(m.pond), Math.round(rec), Math.round(vaaf), JSON.stringify(bd)]);
    n++;
  }
  const med = vaafs.sort((a, b) => a - b)[Math.floor(vaafs.length / 2)] || 0;
  console.log(`✔ ${TAB} ${ANO}: ${n} municípios · VAAF calculado mediano R$ ${Math.round(med).toLocaleString("pt-BR")}/matrícula ponderada`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
