// ETL — Medicamentos de alto custo (CEAF) por município. Fonte: DATASUS SIA grupo 06 (DBC) + SIGTAP (nome do medicamento).
// Valor + quantidade dispensada + top medicamentos por município. node scripts/ingest_medicamentos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const MESES = (process.env.MESES || "2410,2411,2412").split(",");
const SIGTAP_URL = "ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/TabelaUnificada_202606_v2606091427.zip";
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }

async function run() {
  const AdmZip = (await import("adm-zip")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const sp = path.join(dir, "sigtap.zip");
  if (!fs.existsSync(sp) || fs.statSync(sp).size < 1e5) execFileSync("curl", ["-s", "--max-time", "120", SIGTAP_URL, "-o", sp], { stdio: "ignore" });
  const p2n = new Map();
  { const ent = new AdmZip(sp).getEntries().find((e) => /tb_procedimento\.txt$/i.test(e.entryName)); for (const l of ent.getData().toString("latin1").split(/\r?\n/)) { if (l.length < 261 || !l.startsWith("06")) continue; p2n.set(l.slice(0, 10), l.slice(10, 70).trim()); } }

  const M = new Map(); // cod -> {valor, qtd, meds:Map(nome->valor)}
  // agregado: mês faltando não deixa buraco, deixa NÚMERO ERRADO com cara de válido. Ver ingest_apac_sc.
  let obtidos = 0;
  for (const aamm of MESES) {
    const dp = path.join(dir, `PA${UF}${aamm}.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "180", `ftp://ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Dados/PA${UF}${aamm}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp)) { console.log(`  ⚠ ${aamm}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${aamm}: ${e.message.slice(0, 30)}`); continue; }
    const cm = d.campos.PA_MUNPCN, cp = d.campos.PA_PROC_ID, cq = d.campos.PA_QTDAPR, cv = d.campos.PA_VALAPR;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const proc = d.buf.subarray(rec + cp.off, rec + cp.off + cp.len).toString("latin1").trim(); if (!proc.startsWith("06")) continue;
      const cod = by6.get(d.buf.subarray(rec + cm.off, rec + cm.off + cm.len).toString("latin1").trim().slice(0, 6)); if (!cod) continue;
      const q = parseInt(d.buf.subarray(rec + cq.off, rec + cq.off + cq.len).toString("latin1"), 10) || 0;
      const v = parseFloat(d.buf.subarray(rec + cv.off, rec + cv.off + cv.len).toString("latin1")) || 0;
      if (!M.has(cod)) M.set(cod, { valor: 0, qtd: 0, meds: new Map() });
      const m = M.get(cod); m.valor += v; m.qtd += q; const nm = p2n.get(proc) || proc; m.meds.set(nm, (m.meds.get(nm) || 0) + v);
    }
    obtidos++;
    console.log(`  ✓ ${aamm}: processado`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS medicamentos_alto_custo_sc (cod_ibge TEXT PRIMARY KEY, periodo TEXT, valor NUMERIC, quantidade BIGINT, top_meds JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  const per = MESES[0] + "-" + MESES[MESES.length - 1];
  if (obtidos < MESES.length) {
    console.log(`⚠ medicamentos_alto_custo_sc: só ${obtidos}/${MESES.length} meses — total subestimado; tabela NÃO tocada.`);
    await db.end(); process.exit(1);
  }
  await db.query("BEGIN");
  try {
    await db.query(`DELETE FROM medicamentos_alto_custo_sc WHERE periodo = $1`, [per]);
    const L = [...M.entries()].map(([cod, m]) => {
      const top = [...m.meds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, v]) => ({ nome: nome.slice(0, 40), valor: Math.round(v) }));
      return [cod, per, Math.round(m.valor), m.qtd, JSON.stringify(top)];
    });
    if (L.length) await db.query(`INSERT INTO medicamentos_alto_custo_sc (cod_ibge,periodo,valor,quantidade,top_meds)
      SELECT c,p,v,q,t::jsonb FROM unnest($1::text[],$2::text[],$3::numeric[],$4::bigint[],$5::text[]) AS z(c,p,v,q,t)`,
      [L.map((x) => x[0]), L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3]), L.map((x) => x[4])]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }
  const chk = (await db.query(`SELECT count(*) m, round(sum(valor)/1e6) mi, sum(quantidade) q FROM medicamentos_alto_custo_sc`)).rows[0];
  console.log(`✔ medicamentos_alto_custo_sc: ${chk.m} municípios · R$ ${chk.mi} mi · ${Number(chk.q).toLocaleString("pt-BR")} unidades dispensadas (${per})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
