// ETL — SINAN agravos de notificação por município (residência), série. Fonte: DATASUS SINAN (DBC nacional, filtra SC). Usa _blast_dbc.mjs.
// Agravos: tuberculose, hanseníase, violência interpessoal/autoprovocada. node scripts/ingest_sinan_agravos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = (process.env.ANOS || "2021,2022,2023,2024").split(",").map(Number);
const AGRAVOS = [{ cod: "TUBE", nome: "Tuberculose" }, { cod: "HANS", nome: "Hanseníase" }, { cod: "VIOL", nome: "Violência interpessoal/autoprovocada" }];
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map("agravo|ano" -> casos)

  for (const ag of AGRAVOS) {
    for (const ano of ANOS) {
      const yy = String(ano).slice(2);
      const dp = path.join(dir, `${ag.cod}BR${yy}.dbc`);
      if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { try { execFileSync("curl", ["-s", "--max-time", "180", `ftp://ftp.datasus.gov.br/dissemin/publicos/SINAN/DADOS/FINAIS/${ag.cod}BR${yy}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
      if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { console.log(`  ⚠ ${ag.cod} ${ano}: sem arquivo`); continue; }
      let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ag.cod} ${ano}: ${e.message.slice(0, 25)}`); continue; }
      const fMun = d.campos.ID_MN_RESI ? "ID_MN_RESI" : (d.campos.ID_MUNICIP ? "ID_MUNICIP" : null); if (!fMun) { console.log(`  ⚠ ${ag.cod}: sem campo município`); continue; }
      let n = 0;
      for (let i = 0; i < d.nrec; i++) {
        const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
        const cod = by6.get(fld(d, rec, fMun).slice(0, 6)); if (!cod) continue;
        const k = ag.cod + "|" + ano; if (!M.has(cod)) M.set(cod, new Map()); const mm = M.get(cod); mm.set(k, (mm.get(k) || 0) + 1); n++;
      }
      console.log(`  ✓ ${ag.cod} ${ano}: ${n} casos SC (de ${d.nrec.toLocaleString("pt-BR")} nac.)`);
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sinan_agravos_sc (cod_ibge TEXT, agravo TEXT, ano INTEGER, casos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, agravo, ano))`);
  await db.query(`TRUNCATE sinan_agravos_sc`);
  let up = 0;
  for (const [cod, mm] of M) for (const [k, casos] of mm) { const [ag, ano] = k.split("|"); await db.query(`INSERT INTO sinan_agravos_sc (cod_ibge,agravo,ano,casos,atualizado) VALUES ($1,$2,$3,$4,now())`, [cod, ag, +ano, casos]); up++; }
  const chk = (await db.query(`SELECT agravo, sum(casos) c FROM sinan_agravos_sc WHERE ano=(SELECT max(ano) FROM sinan_agravos_sc) GROUP BY agravo`)).rows;
  console.log(`✔ sinan_agravos_sc: ${up} linhas · último ano SC: ${chk.map((r) => r.agravo + " " + r.c).join(", ")}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
