// ETL — APAC alta complexidade por município: oncologia (quimio+radio) e diálise. Fonte: DATASUS SIA APAC (DBC). Usa _blast_dbc.mjs.
// Nº de APAC (autorizações ≈ paciente-mês) + valor, por município de residência. node scripts/ingest_apac_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const MESES = (process.env.MESES || "2410,2411,2412").split(",");
const GRUPOS = [{ g: "onco", tipos: ["AQ", "AR"] }, { g: "dialise", tipos: ["ATD"] }]; // AQ=quimio, AR=radio, ATD=tratamento dialítico
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> {onco:{n,v}, dialise:{n,v}}
  // ⚠️ AGREGADO É DIFERENTE DE SÉRIE: aqui todas as competências viram UM total por município.
  // Se um mês falha, o número não fica FALTANDO — fica ERRADO, e com cara de válido. R$ 210 mi com um mês
  // ausente engana mais que tabela vazia, porque ninguém desconfia de um número plausível.
  // Por isso o critério aqui é mais duro que nas séries: agregado só substitui o anterior se estiver
  // COMPLETO. Incompleto, o dado antigo (que estava completo) fica, e a rodada falha.
  let esperados = 0, obtidos = 0;

  for (const grp of GRUPOS) {
    for (const tp of grp.tipos) {
      for (const aamm of MESES) {
        esperados++;
        const dp = path.join(dir, `${tp}${UF}${aamm}.dbc`);
        if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { try { execFileSync("curl", ["-s", "--max-time", "150", `ftp://ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Dados/${tp}${UF}${aamm}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
        if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { console.log(`  ⚠ ${tp} ${aamm}: sem arquivo`); continue; }
        let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${tp} ${aamm}: ${e.message.slice(0, 25)}`); continue; }
        const cm = d.campos.AP_MUNPCN, cv = d.campos.AP_VL_AP;
        for (let i = 0; i < d.nrec; i++) {
          const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
          const cod = by6.get(d.buf.subarray(rec + cm.off, rec + cm.off + cm.len).toString("latin1").trim().slice(0, 6)); if (!cod) continue;
          const v = parseFloat(d.buf.subarray(rec + cv.off, rec + cv.off + cv.len).toString("latin1")) || 0;
          if (!M.has(cod)) M.set(cod, { onco: { n: 0, v: 0 }, dialise: { n: 0, v: 0 } });
          const o = M.get(cod)[grp.g]; o.n++; o.v += v;
        }
        obtidos++;
        console.log(`  ✓ ${tp} ${aamm}: ${d.nrec} APAC`);
      }
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS apac_sc (cod_ibge TEXT PRIMARY KEY, periodo TEXT, onco_apac INTEGER, onco_valor NUMERIC, dialise_apac INTEGER, dialise_valor NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
  const per = MESES[0] + "-" + MESES[MESES.length - 1];
  if (obtidos < esperados) {
    console.log(`⚠ apac_sc: só ${obtidos}/${esperados} arquivos vieram — o total ficaria SUBESTIMADO.`);
    console.log(`  A tabela NÃO foi tocada: o dado anterior, completo, vale mais que um agregado furado.`);
    await db.end(); process.exit(1);
  }
  // substitui só este período, em transação — TRUNCATE apagaria também qualquer outro período guardado
  await db.query("BEGIN");
  try {
    await db.query(`DELETE FROM apac_sc WHERE periodo = $1`, [per]);
    const L = [...M.entries()].map(([cod, m]) => [cod, per, m.onco.n, Math.round(m.onco.v), m.dialise.n, Math.round(m.dialise.v)]);
    if (L.length) await db.query(`INSERT INTO apac_sc (cod_ibge,periodo,onco_apac,onco_valor,dialise_apac,dialise_valor)
      SELECT c,p,oa,ov,da,dv FROM unnest($1::text[],$2::text[],$3::int[],$4::numeric[],$5::int[],$6::numeric[]) AS z(c,p,oa,ov,da,dv)`,
      [L.map((x) => x[0]), L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3]), L.map((x) => x[4]), L.map((x) => x[5])]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }
  const chk = (await db.query(`SELECT count(*) m, round(sum(onco_valor)/1e6) o, round(sum(dialise_valor)/1e6) d FROM apac_sc`)).rows[0];
  console.log(`✔ apac_sc: ${chk.m} municípios · R$ ${chk.o} mi oncologia · R$ ${chk.d} mi diálise (${per})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
