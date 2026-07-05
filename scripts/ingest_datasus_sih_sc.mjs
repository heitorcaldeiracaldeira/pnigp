// ETL — DATASUS SIH (internações hospitalares SUS) por município. Fonte: FTP DATASUS (DBC mensal). Usa _blast_dbc.mjs.
// Agrega por município/ano: internações + valor total pago + óbitos hospitalares. node scripts/ingest_datasus_sih_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2023,2024").split(",").map(Number);
const FTP = "ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS/200801_/Dados/RD";
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map();
  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    for (let mes = 1; mes <= 12; mes++) {
      const mm2 = String(mes).padStart(2, "0");
      const dp = path.join(dir, `RD${UF}${yy}${mm2}.dbc`);
      if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { try { execFileSync("curl", ["-s", "--max-time", "90", `${FTP}${UF}${yy}${mm2}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
      if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) continue;
      let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { continue; }
      for (let i = 0; i < d.nrec; i++) {
        const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
        const cod = by6.get(fld(d, rec, "MUNIC_RES")); if (!cod) continue;
        const val = parseFloat(fld(d, rec, "VAL_TOT")) || 0; const morte = fld(d, rec, "MORTE") === "1";
        if (!M.has(cod)) M.set(cod, new Map());
        const cm = M.get(cod); const a = cm.get(ano) || { intern: 0, valor: 0, obitos: 0 }; a.intern++; a.valor += val; if (morte) a.obitos++; cm.set(ano, a);
      }
    }
    const tot = [...M.values()].reduce((s, cm) => s + (cm.get(ano)?.intern || 0), 0);
    console.log(`  ✓ ${ano}: ${tot} internações ${UF}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS sih_sc (cod_ibge TEXT, ano INTEGER, internacoes INTEGER, valor_total NUMERIC, obitos_hosp INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`TRUNCATE sih_sc`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, a] of anos) { await db.query(`INSERT INTO sih_sc (cod_ibge,ano,internacoes,valor_total,obitos_hosp,atualizado) VALUES ($1,$2,$3,$4,$5,now())`, [cod, ano, a.intern, Math.round(a.valor), a.obitos]); up++; }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, sum(internacoes) FILTER (WHERE ano=(SELECT max(ano) FROM sih_sc)) i, round(sum(valor_total) FILTER (WHERE ano=(SELECT max(ano) FROM sih_sc))/1e6) mi FROM sih_sc`)).rows[0];
  console.log(`✔ sih_sc: ${chk.m} municípios · ${up} linhas · ${chk.ma}: ${Number(chk.i).toLocaleString("pt-BR")} internações · R$ ${chk.mi} mi`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
