// ETL — SIA-SUS produção ambulatorial por município × complexidade. Fonte: DATASUS SIA (DBC) + SIGTAP (complexidade do procedimento).
// Complexidade: 1=Atenção Básica (equipes municipais), 2=Média, 3=Alta. Agrega quantidade + valor aprovado. node scripts/ingest_sia_producao_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const MESES = (process.env.MESES || "2410,2411,2412").split(","); // aamm
const SIGTAP_URL = "ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/TabelaUnificada_202606_v2606091427.zip";
const LABEL = { "1": "basica", "2": "media", "3": "alta" };
const GRUPO = { "01": "Promoção/prevenção", "02": "Diagnóstico", "03": "Clínico", "04": "Cirúrgico", "05": "Transplante", "07": "Órtese/prótese/material", "08": "Complementar" };
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }

async function run() {
  const AdmZip = (await import("adm-zip")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();

  // SIGTAP: proc(10) → complexidade
  const sp = path.join(dir, "sigtap.zip");
  if (!fs.existsSync(sp) || fs.statSync(sp).size < 1e5) execFileSync("curl", ["-s", "--max-time", "120", SIGTAP_URL, "-o", sp], { stdio: "ignore" });
  const proc2cpl = new Map();
  { const ent = new AdmZip(sp).getEntries().find((e) => /tb_procedimento\.txt$/i.test(e.entryName)); for (const l of ent.getData().toString("latin1").split(/\r?\n/)) { if (l.length < 261) continue; proc2cpl.set(l.slice(0, 10), l[260]); } }
  console.log(`SIGTAP: ${proc2cpl.size} procedimentos`);

  const M = new Map(); // cod -> {basica:{q,v}, media:{q,v}, alta:{q,v}}
  for (const aamm of MESES) {
    const dp = path.join(dir, `PA${UF}${aamm}.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "180", `ftp://ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Dados/PA${UF}${aamm}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${aamm}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${aamm}: ${e.message.slice(0, 30)}`); continue; }
    const cm = d.campos.PA_MUNPCN, cp = d.campos.PA_PROC_ID, cq = d.campos.PA_QTDAPR, cv = d.campos.PA_VALAPR;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(d.buf.subarray(rec + cm.off, rec + cm.off + cm.len).toString("latin1").trim().slice(0, 6)); if (!cod) continue;
      const proc = d.buf.subarray(rec + cp.off, rec + cp.off + cp.len).toString("latin1").trim();
      if (proc.startsWith("06")) continue; // exclui MEDICAMENTOS (grupo 06 — contado por comprimido, distorce a produção de procedimentos)
      const cpl = LABEL[proc2cpl.get(proc)]; if (!cpl) continue;
      const q = parseInt(d.buf.subarray(rec + cq.off, rec + cq.off + cq.len).toString("latin1"), 10) || 0;
      const v = parseFloat(d.buf.subarray(rec + cv.off, rec + cv.off + cv.len).toString("latin1")) || 0;
      if (!M.has(cod)) M.set(cod, { basica: { q: 0, v: 0 }, media: { q: 0, v: 0 }, alta: { q: 0, v: 0 }, grupos: new Map() });
      const rec2 = M.get(cod); const g = rec2[cpl]; g.q += q; g.v += v;
      if (cpl !== "basica") { const gr = proc.slice(0, 2); const gg = rec2.grupos.get(gr) || { q: 0, v: 0 }; gg.q += q; gg.v += v; rec2.grupos.set(gr, gg); } // MAC por grupo SIGTAP
    }
    console.log(`  ✓ ${aamm}: processado (${d.nrec.toLocaleString("pt-BR")} registros)`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sia_producao_sc (cod_ibge TEXT PRIMARY KEY, periodo TEXT, q_basica BIGINT, v_basica NUMERIC, q_media BIGINT, v_media NUMERIC, q_alta BIGINT, v_alta NUMERIC, mac_grupos JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`ALTER TABLE sia_producao_sc ADD COLUMN IF NOT EXISTS mac_grupos JSONB`).catch(() => {});
  await db.query(`TRUNCATE sia_producao_sc`);
  const per = MESES[0] + "-" + MESES[MESES.length - 1];
  for (const [cod, g] of M) {
    const grupos = [...g.grupos.entries()].map(([gr, x]) => ({ grupo: GRUPO[gr] || gr, quantidade: x.q, valor: Math.round(x.v) })).sort((a, b) => b.valor - a.valor);
    await db.query(`INSERT INTO sia_producao_sc (cod_ibge,periodo,q_basica,v_basica,q_media,v_media,q_alta,v_alta,mac_grupos,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`, [cod, per, g.basica.q, Math.round(g.basica.v), g.media.q, Math.round(g.media.v), g.alta.q, Math.round(g.alta.v), JSON.stringify(grupos)]);
  }
  const chk = (await db.query(`SELECT count(*) m, round(sum(v_media+v_alta)/1e6) mac, round(sum(v_basica)/1e6) ab FROM sia_producao_sc`)).rows[0];
  console.log(`✔ sia_producao_sc: ${chk.m} municípios · R$ ${chk.ab} mi atenção básica · R$ ${chk.mac} mi média+alta complexidade (${per})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
