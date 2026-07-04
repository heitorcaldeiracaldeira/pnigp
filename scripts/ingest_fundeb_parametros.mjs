// ETL — Parâmetros oficiais do FUNDEB 2026 (FNDE): fatores de ponderação + VAAT por ente + VAAR habilitados.
// Fonte: gov.br/fnde .../financiamento/fundeb/2026 (CSV latin1, formato Excel-BR). Base do MOTOR FUNDEB (conferência + potencial).
// fatores_fundeb (nacional) · vaat_fundeb_sc (por ente) · vaar_fundeb_sc (por ente). node scripts/ingest_fundeb_parametros.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANO = Number(process.env.ANO || 2026);
const B = "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/financiamento/fundeb";
const URLS = {
  fatores: `${B}/2026-1/Fatoresdeponderaodetalhadosporsegmentodeensino.csv`,
  vaat: `${B}/2026-1/publicacoes-2026/2-publicacao/3-vaat-vaat-min-e-complementacao-vaat-por-ente-federado.csv`,
  vaar: `${B}/2026-1/ListaentesbeneficiariosenaobeneficiariosacomplementacaoVAARdoFundeb2026.csv`,
};
const nBR = (s) => { s = String(s || "").replace(/[^\d,.-]/g, "").trim(); if (!s || s === "-") return 0; return Number(s.replace(/\./g, "").replace(",", ".")) || 0; };
const cel = (l) => l.split(";").map((x) => x.replace(/^"|"$/g, "").trim());
function baixar(k) { const p = path.join(os.tmpdir(), `fparam_${k}.csv`); execFileSync("curl", ["-s", "-L", "--max-time", "90", "-A", "Mozilla/5.0", "-o", p, URLS[k]], { stdio: "ignore" }); return fs.readFileSync(p, "latin1").split(/\r?\n/); }

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});

  // ===== FATORES DE PONDERAÇÃO (nacional) =====
  const fat = baixar("fatores");
  await db.query(`CREATE TABLE IF NOT EXISTS fatores_fundeb (ano INTEGER, segmento TEXT, fp_vaaf NUMERIC, fp_vaat NUMERIC, fp_final_vaaf NUMERIC, fp_final_vaat NUMERIC, PRIMARY KEY (ano, segmento))`);
  let nf = 0;
  for (let i = 2; i < fat.length; i++) {
    const c = cel(fat[i]); const seg = c[6]; if (!seg) continue; // col 6 = Segmento de Ensino
    const ffv = nBR(c[4]), fft = nBR(c[5]); if (!ffv && !fft) continue;
    await db.query(`INSERT INTO fatores_fundeb (ano,segmento,fp_vaaf,fp_vaat,fp_final_vaaf,fp_final_vaat) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ano,segmento) DO UPDATE SET fp_vaaf=EXCLUDED.fp_vaaf,fp_vaat=EXCLUDED.fp_vaat,fp_final_vaaf=EXCLUDED.fp_final_vaaf,fp_final_vaat=EXCLUDED.fp_final_vaat`,
      [ANO, seg, nBR(c[1]), nBR(c[2]), ffv, fft]);
    nf++;
  }

  // ===== VAAT por ente (SC) =====
  const vt = baixar("vaat"); const hvt = vt.findIndex((l) => /^UF;/.test(l));
  await db.query(`CREATE TABLE IF NOT EXISTS vaat_fundeb_sc (cod_ibge TEXT, ano INTEGER, vaat NUMERIC, vaat_min NUMERIC, compl_vaat NUMERIC, recebe_vaat BOOLEAN, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let nvt = 0;
  for (let i = hvt + 1; i < vt.length; i++) {
    const c = cel(vt[i]); if (c[0] !== UF) continue; const cod = String(c[2]).replace(/\D/g, ""); if (cod.length !== 7) continue;
    const vaat = nBR(c[3]), vmin = nBR(c[4]), compl = nBR(c[5]);
    await db.query(`INSERT INTO vaat_fundeb_sc (cod_ibge,ano,vaat,vaat_min,compl_vaat,recebe_vaat,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (cod_ibge,ano) DO UPDATE SET vaat=EXCLUDED.vaat,vaat_min=EXCLUDED.vaat_min,compl_vaat=EXCLUDED.compl_vaat,recebe_vaat=EXCLUDED.recebe_vaat,atualizado=now()`,
      [cod, ANO, vaat, vmin, compl, compl > 0]);
    nvt++;
  }

  // ===== VAAR habilitados (SC) =====
  const vr = baixar("vaar"); const hvr = vr.findIndex((l) => /^UF;/.test(l));
  const hb = cel(vr[hvr]).findIndex((h) => /Beneficiário\?/i.test(h)); const hh = cel(vr[hvr]).findIndex((h) => /Habilitados\?/i.test(h));
  await db.query(`CREATE TABLE IF NOT EXISTS vaar_fundeb_sc (cod_ibge TEXT, ano INTEGER, habilitado BOOLEAN, beneficiario BOOLEAN, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let nvr = 0;
  for (let i = hvr + 1; i < vr.length; i++) {
    const c = cel(vr[i]); if (c[0] !== UF) continue; const cod = String(c[1]).replace(/\D/g, ""); if (cod.length !== 7) continue;
    const benef = /^benefici/i.test((c[hb] || "").trim()), hab = /^habilit/i.test((c[hh] || "").trim()); // "Não Beneficiário"/"Não Habilitado" NÃO contam
    await db.query(`INSERT INTO vaar_fundeb_sc (cod_ibge,ano,habilitado,beneficiario,atualizado) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (cod_ibge,ano) DO UPDATE SET habilitado=EXCLUDED.habilitado,beneficiario=EXCLUDED.beneficiario,atualizado=now()`,
      [cod, ANO, hab, benef]);
    nvr++;
  }

  const cvt = (await db.query(`SELECT count(*) n, count(*) FILTER (WHERE recebe_vaat) rec FROM vaat_fundeb_sc WHERE ano=$1`, [ANO])).rows[0];
  const cvr = (await db.query(`SELECT count(*) FILTER (WHERE beneficiario) b, count(*) n FROM vaar_fundeb_sc WHERE ano=$1`, [ANO])).rows[0];
  console.log(`✔ fatores_fundeb: ${nf} segmentos`);
  console.log(`✔ vaat_fundeb_sc: ${cvt.n} municípios · ${cvt.rec} recebem VAAT`);
  console.log(`✔ vaar_fundeb_sc: ${cvr.n} municípios · ${cvr.b} beneficiários VAAR`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
