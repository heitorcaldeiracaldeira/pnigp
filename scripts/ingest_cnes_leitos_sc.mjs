// ETL — CNES leitos hospitalares por município + por estabelecimento. Fonte: DATASUS CNES (LT, DBC). Usa _blast_dbc.mjs.
// Total de leitos + leitos SUS + leitos de UTI (complementar). node scripts/ingest_cnes_leitos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2020,2022,2024").split(",").map(Number);
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); const porEstab = new Map(); const anoMax = Math.max(...ANOS);

  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    const dp = path.join(dir, `LT${UF}${yy}12.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { try { execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/LT/LT${UF}${yy}12.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(fld(d, rec, "CODUFMUN").slice(0, 6)); if (!cod) continue;
      const tp = fld(d, rec, "TP_LEITO"); const ex = parseInt(fld(d, rec, "QT_EXIST"), 10) || 0; const sus = parseInt(fld(d, rec, "QT_SUS"), 10) || 0;
      const add = (o) => { o.total += ex; o.sus += sus; if (tp === "3") o.uti += ex; };
      if (!M.has(cod)) M.set(cod, new Map()); const mm = M.get(cod); const a = mm.get(ano) || { total: 0, sus: 0, uti: 0 }; add(a); mm.set(ano, a);
      if (ano === anoMax) { const cnes = fld(d, rec, "CNES"); const e = porEstab.get(cnes) || { total: 0, sus: 0, uti: 0 }; add(e); porEstab.set(cnes, e); }
    }
    console.log(`  ✓ ${ano}: ${d.nrec} registros ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cnes_leitos_sc (cod_ibge TEXT, ano INTEGER, total INTEGER, sus INTEGER, uti INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_leitos_estab (codigo_cnes TEXT PRIMARY KEY, total INTEGER, sus INTEGER, uti INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE cnes_leitos_sc`); await db.query(`TRUNCATE cnes_leitos_estab`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, a] of anos) { await db.query(`INSERT INTO cnes_leitos_sc (cod_ibge,ano,total,sus,uti,atualizado) VALUES ($1,$2,$3,$4,$5,now())`, [cod, ano, a.total, a.sus, a.uti]); up++; }
  for (const [cnes, e] of porEstab) await db.query(`INSERT INTO cnes_leitos_estab (codigo_cnes,total,sus,uti,atualizado) VALUES ($1,$2,$3,$4,now())`, [cnes, e.total, e.sus, e.uti]);
  const chk = (await db.query(`SELECT max(ano) ma, sum(total) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_leitos_sc)) t, sum(sus) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_leitos_sc)) s, sum(uti) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_leitos_sc)) u FROM cnes_leitos_sc`)).rows[0];
  console.log(`✔ cnes_leitos: ${up} linhas · ${chk.ma}: ${chk.t} leitos (${chk.s} SUS, ${chk.u} UTI) em ${UF} · ${porEstab.size} estabelecimentos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
