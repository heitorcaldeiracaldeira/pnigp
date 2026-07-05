// ETL — DATASUS SINASC (nascidos vivos) por município. Fonte: FTP DATASUS (DBC). Usa o descompressor _blast_dbc.mjs.
// Agrega por município/ano: nascimentos + baixo peso + prematuros + pré-natal adequado + mães adolescentes. node scripts/ingest_datasus_sinasc_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2019,2020,2021,2022,2023").split(",").map(Number);
const FTP = `ftp://ftp.datasus.gov.br/dissemin/publicos/SINASC/NOV/DNRES/DN${UF}`;
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map();
  for (const ano of ANOS) {
    const dp = path.join(dir, `DN${UF}${ano}.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "120", `${FTP}${ano}.DBC`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    let n = 0;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(fld(d, rec, "CODMUNRES")); if (!cod) continue;
      const peso = +fld(d, rec, "PESO") || 0; const gest = fld(d, rec, "GESTACAO"); const cons = fld(d, rec, "CONSULTAS"); const idmae = +fld(d, rec, "IDADEMAE") || 0;
      if (!M.has(cod)) M.set(cod, new Map());
      const mm = M.get(cod); const a = mm.get(ano) || { nasc: 0, baixopeso: 0, premat: 0, prenatal7: 0, adolesc: 0 }; a.nasc++;
      if (peso > 0 && peso < 2500) a.baixopeso++;
      if ("1234".includes(gest)) a.premat++;         // gestação < 37 semanas (códigos 1-4)
      if (cons === "4") a.prenatal7++;               // 7+ consultas de pré-natal
      if (idmae > 0 && idmae < 20) a.adolesc++;      // mãe adolescente
      mm.set(ano, a); n++;
    }
    console.log(`  ✓ ${ano}: ${n} nascimentos ${UF} (${d.nrec} registros)`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS sinasc_sc (cod_ibge TEXT, ano INTEGER, nascimentos INTEGER, baixo_peso INTEGER, prematuros INTEGER, prenatal_7mais INTEGER, mae_adolescente INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`TRUNCATE sinasc_sc`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, a] of anos) { await db.query(`INSERT INTO sinasc_sc (cod_ibge,ano,nascimentos,baixo_peso,prematuros,prenatal_7mais,mae_adolescente,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())`, [cod, ano, a.nasc, a.baixopeso, a.premat, a.prenatal7, a.adolesc]); up++; }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, sum(nascimentos) FILTER (WHERE ano=(SELECT max(ano) FROM sinasc_sc)) n FROM sinasc_sc`)).rows[0];
  console.log(`✔ sinasc_sc: ${chk.m} municípios · ${up} linhas · ${chk.ma}: ${Number(chk.n).toLocaleString("pt-BR")} nascimentos em ${UF}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
