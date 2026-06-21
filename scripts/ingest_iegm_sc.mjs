// ETL — IEGM (Índice de Efetividade da Gestão Municipal) do TCE-SC, por município, via IRB.
// Fonte: iegm.irbcontas.org.br/dados_abertos/{ano}/calculo/calculo_iegm_{ano}_TCESC_completo.zip
// CSV UTF-16, ';'; decimais com vírgula. 7 dimensões + IEGM final, com faixa (A..C) e rebaixamento.
// node scripts/ingest_iegm_sc.mjs   (ANOS opcional) · multi-UF: troca TCESC pelo tribunal da UF
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
import { SG_UF } from "./_uf.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const TRIB = process.env.TRIBUNAL || `TC${SG_UF === "SC" ? "ESC" : "E" + SG_UF}`; // TCESC, TCEPR…
const ANO = new Date().getFullYear();
const ANOS = (process.env.ANOS || `${ANO - 4},${ANO - 3},${ANO - 2},${ANO - 1}`).split(",").map(Number);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// extrai o 1º arquivo de um ZIP (DEFLATE) em memória — sem dependências
function unzipPrimeiro(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("não é zip");
  const metodo = buf.readUInt16LE(8);
  let compSize = buf.readUInt32LE(18);
  const fnLen = buf.readUInt16LE(26), exLen = buf.readUInt16LE(28);
  const ini = 30 + fnLen + exLen;
  if (!compSize) { const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); compSize = cd > ini ? cd - ini : buf.length - ini; }
  const dados = buf.subarray(ini, ini + compSize);
  return metodo === 0 ? dados : zlib.inflateRawSync(dados);
}

async function baixa(ano) {
  const url = `https://iegm.irbcontas.org.br/dados_abertos/${ano}/calculo/calculo_iegm_${ano}_${TRIB}_completo.zip`;
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (r.status === 404) return null; if (!r.ok) throw 0; return Buffer.from(await r.arrayBuffer()); }
    catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS iegm_sc (cod_ibge TEXT, ano INTEGER, indicador TEXT, pct NUMERIC, faixa TEXT, PRIMARY KEY (cod_ibge, ano, indicador))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  let grav = 0;
  for (const ano of ANOS) {
    const zip = await baixa(ano);
    if (!zip) { console.log(`${ano}: sem arquivo`); continue; }
    let csv;
    try { csv = unzipPrimeiro(zip).toString("utf16le").replace(/^﻿/, ""); } catch (e) { console.log(`${ano}: falha unzip (${e.message})`); continue; }
    const linhas = csv.split(/\r?\n/).filter((l) => l.trim());
    const head = linhas[0].split(";").map((h) => h.trim());
    const iCod = head.indexOf("codigo_ibge"), iInd = head.indexOf("indicador");
    const iPct = head.indexOf("pct_indice_apos_analise_rebaixamento"), iFx = head.indexOf("faixa_apos_analise_rebaixamento");
    let n = 0;
    for (const l of linhas.slice(1)) {
      const c = l.split(";");
      const cod = (c[iCod] || "").trim(); const ind = (c[iInd] || "").trim();
      if (!/^\d{7}$/.test(cod) || !ind) continue;
      const pct = parseFloat((c[iPct] || "").replace(",", ".")) || null;
      const faixa = (c[iFx] || "").trim() || null;
      await q(`INSERT INTO iegm_sc (cod_ibge,ano,indicador,pct,faixa) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (cod_ibge,ano,indicador) DO UPDATE SET pct=EXCLUDED.pct, faixa=EXCLUDED.faixa`, [cod, ano, ind, pct, faixa]);
      n++; grav++;
    }
    console.log(`Ano ${ano}: ${n} linhas (${TRIB})`);
  }
  const cc = await db.query(`SELECT count(distinct cod_ibge) e, count(distinct ano) anos, count(*) n FROM iegm_sc`);
  console.log(`IEGM concluído: ${grav} nesta rodada · ${JSON.stringify(cc.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
