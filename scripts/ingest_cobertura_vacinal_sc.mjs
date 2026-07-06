// ETL — Cobertura vacinal por município e vacina (PNI). Fonte: DATASUS SI-PNI (CPNI{UF}{yy}.DBF, campo COBERT oficial).
// Mapa IMUNO→vacina extraído do tabnet oficial (bd_pni/cpnibr.def). Série até 2019 (2019+ = transição p/ novo SI-PNI). node scripts/ingest_cobertura_vacinal_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2013,2014,2015,2016,2017,2018").split(",").map(Number); // anos completos (2019 = transição, parcial)
// IMUNO → vacina (do tabnet oficial). Só as do calendário infantil de rotina (mais interpretáveis).
const IMUNO = { "072": "BCG", "099": "Hepatite B (≤30 dias)", "061": "Rotavírus", "053": "Meningocócica C", "080": "Penta", "012": "Pneumocócica 10", "074": "Poliomielite", "006": "Febre Amarela", "096": "Hepatite A", "021": "Tríplice Viral D1", "098": "Tríplice Viral D2", "097": "Tetra Viral", "075": "DTP" };
const pctBR = (s) => { const x = Number(String(s || "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? +x.toFixed(1) : null; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const rows = []; // {cod, ano, vacina, cobertura}

  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    const dp = path.join(dir, `CPNI${UF}${yy}.dbf`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "90", `ftp://ftp.datasus.gov.br/dissemin/publicos/PNI/DADOS/CPNI${UF}${yy}.DBF`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    const buf = fs.readFileSync(dp); const hlen = buf.readUInt16LE(8), nrec = buf.readUInt32LE(4), rlen = buf.readUInt16LE(10);
    const c = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; c[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; }
    const g = (i, n) => c[n] ? buf.subarray(hlen + i * rlen + c[n].off, hlen + i * rlen + c[n].off + c[n].len).toString("latin1").trim() : "";
    let n = 0;
    for (let i = 0; i < nrec; i++) {
      const im = g(i, "IMUNO"); const vac = IMUNO[im]; if (!vac) continue;
      const cod = by6.get(g(i, "MUNIC").slice(0, 6)); if (!cod) continue;
      const cob = pctBR(g(i, "COBERT")); if (cob == null) continue;
      rows.push([cod, ano, vac, Math.min(cob, 200)]); n++;
    }
    console.log(`  ✓ ${ano}: ${n} registros (município×vacina)`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cobertura_vacinal_sc (cod_ibge TEXT, ano INTEGER, vacina TEXT, cobertura NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, vacina))`);
  await db.query(`TRUNCATE cobertura_vacinal_sc`);
  for (let i = 0; i < rows.length; i += 500) { const chunk = rows.slice(i, i + 500); const vals = chunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4},now())`).join(","); await db.query(`INSERT INTO cobertura_vacinal_sc (cod_ibge,ano,vacina,cobertura,atualizado) VALUES ${vals} ON CONFLICT DO NOTHING`, chunk.flat()); }
  const chk = (await db.query(`SELECT max(ano) ma, count(distinct cod_ibge) m, round(avg(cobertura),1) a FROM cobertura_vacinal_sc WHERE ano=(SELECT max(ano) FROM cobertura_vacinal_sc)`)).rows[0];
  console.log(`✔ cobertura_vacinal_sc: ${rows.length} linhas · ${chk.m} municípios · cobertura média ${chk.a}% em ${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
