// ETL — Saúde mental (RAAS Psicossocial / CAPS) por município. Fonte: DATASUS SIA RAAS-PS (DBC). Usa _blast_dbc.mjs.
// Atendimentos + registros psicossociais por município de residência. node scripts/ingest_raas_saude_mental_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const MESES = (process.env.MESES || "2410,2411,2412").split(",");
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> {atend, reg}

  // agregado: mês faltando não deixa buraco, deixa NÚMERO ERRADO com cara de válido. Ver ingest_apac_sc.
  let obtidos = 0;
  for (const aamm of MESES) {
    const dp = path.join(dir, `PS${UF}${aamm}.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { try { execFileSync("curl", ["-s", "--max-time", "150", `ftp://ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Dados/PS${UF}${aamm}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { console.log(`  ⚠ ${aamm}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${aamm}: ${e.message.slice(0, 25)}`); continue; }
    const cm = d.campos.MUNPAC, ca = d.campos.QTDATE;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(d.buf.subarray(rec + cm.off, rec + cm.off + cm.len).toString("latin1").trim().slice(0, 6)); if (!cod) continue;
      const at = ca ? (parseInt(d.buf.subarray(rec + ca.off, rec + ca.off + ca.len).toString("latin1"), 10) || 0) : 0;
      if (!M.has(cod)) M.set(cod, { atend: 0, reg: 0 }); const o = M.get(cod); o.atend += at; o.reg++;
    }
    obtidos++;
    console.log(`  ✓ ${aamm}: ${d.nrec} registros RAAS-PS`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS raas_saude_mental_sc (cod_ibge TEXT PRIMARY KEY, periodo TEXT, atendimentos INTEGER, registros INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  const per = MESES[0] + "-" + MESES[MESES.length - 1];
  if (obtidos < MESES.length) {
    console.log(`⚠ raas_saude_mental_sc: só ${obtidos}/${MESES.length} meses — total subestimado; tabela NÃO tocada.`);
    await db.end(); process.exit(1);
  }
  await db.query("BEGIN");
  try {
    await db.query(`DELETE FROM raas_saude_mental_sc WHERE periodo = $1`, [per]);
    const L = [...M.entries()].map(([cod, o]) => [cod, per, o.atend, o.reg]);
    if (L.length) await db.query(`INSERT INTO raas_saude_mental_sc (cod_ibge,periodo,atendimentos,registros)
      SELECT c,p,a,r FROM unnest($1::text[],$2::text[],$3::int[],$4::int[]) AS z(c,p,a,r)`,
      [L.map((x) => x[0]), L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3])]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }
  const chk = (await db.query(`SELECT count(*) m, sum(atendimentos) a, sum(registros) r FROM raas_saude_mental_sc`)).rows[0];
  console.log(`✔ raas_saude_mental_sc: ${chk.m} municípios · ${Number(chk.a).toLocaleString("pt-BR")} atendimentos psicossociais · ${Number(chk.r).toLocaleString("pt-BR")} registros (${per})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
