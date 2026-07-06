// ETL — CNES equipes de saúde (ESF/APS) por município + por estabelecimento. Fonte: DATASUS CNES (DBC). Usa _blast_dbc.mjs.
// Série histórica (dez de cada ano). Total de equipes + ESF (Saúde da Família) + por estabelecimento (CNES). node scripts/ingest_cnes_equipes_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2019,2020,2021,2022,2023,2024").split(",").map(Number);
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map();       // cod -> Map(ano -> {total, esf})
  const porEstab = new Map(); // codigo_cnes -> {total, esf} (último ano)
  const anoMax = Math.max(...ANOS);

  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    const dp = path.join(dir, `EP${UF}${yy}12.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/EP/EP${UF}${yy}12.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    let n = 0;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const dd = fld(d, rec, "DT_DESAT"); if (dd && dd !== "900001") continue; // ativa: DT_DESAT vazio ou "900001" (sentinela)
      const cod = by6.get(fld(d, rec, "CODUFMUN").slice(0, 6)); if (!cod) continue;
      const nome = (fld(d, rec, "NOME_EQP") || "").toUpperCase(); const tipo = fld(d, rec, "TIPO_EQP");
      const isEsf = tipo === "70" || /SAUDE DA FAMILIA|SAUDE FAMILIA/.test(nome);
      if (!M.has(cod)) M.set(cod, new Map());
      const mm = M.get(cod); const a = mm.get(ano) || { total: 0, esf: 0 }; a.total++; if (isEsf) a.esf++; mm.set(ano, a);
      if (ano === anoMax) { const cnes = fld(d, rec, "CNES"); const e = porEstab.get(cnes) || { total: 0, esf: 0 }; e.total++; if (isEsf) e.esf++; porEstab.set(cnes, e); }
      n++;
    }
    console.log(`  ✓ ${ano}: ${n} equipes ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cnes_equipes_sc (cod_ibge TEXT, ano INTEGER, n_equipes INTEGER, n_esf INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_equipes_estab (codigo_cnes TEXT PRIMARY KEY, n_equipes INTEGER, n_esf INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE cnes_equipes_sc`); await db.query(`TRUNCATE cnes_equipes_estab`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, a] of anos) { await db.query(`INSERT INTO cnes_equipes_sc (cod_ibge,ano,n_equipes,n_esf,atualizado) VALUES ($1,$2,$3,$4,now())`, [cod, ano, a.total, a.esf]); up++; }
  for (const [cnes, e] of porEstab) await db.query(`INSERT INTO cnes_equipes_estab (codigo_cnes,n_equipes,n_esf,atualizado) VALUES ($1,$2,$3,now())`, [cnes, e.total, e.esf]);
  const chk = (await db.query(`SELECT max(ano) ma, sum(n_equipes) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_equipes_sc)) t, sum(n_esf) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_equipes_sc)) e FROM cnes_equipes_sc`)).rows[0];
  console.log(`✔ cnes_equipes_sc: ${up} linhas · ${chk.ma}: ${chk.t} equipes (${chk.e} ESF) em ${UF} · ${porEstab.size} estabelecimentos com equipe`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
