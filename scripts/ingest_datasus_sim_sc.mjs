// ETL — DATASUS SIM (óbitos) por município. Fonte: FTP DATASUS (DBC), descompactado pelo _blast_dbc.mjs.
// Agrega por município/ano: total óbitos + causas externas + circulatório + neoplasias + mortalidade infantil. node scripts/ingest_datasus_sim_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2019,2020,2021,2022,2023,2024").split(",").map(Number);
const FTP = `ftp://ftp.datasus.gov.br/dissemin/publicos/SIM/CID10/DORES/DO${UF}`;

// lê um DBF (Buffer) e retorna {campos:{nome:{off,len}}, hlen, rlen, nrec, buf}
function parseDbf(buf) {
  const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10);
  const campos = {}; let off = 1; // 1º byte do registro = flag de deleção
  for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; const len = buf[o + 16]; campos[nm] = { off, len }; off += len; }
  return { campos, hlen, rlen, nrec, buf };
}
const fld = (d, rec, nome) => { const c = d.campos[nome]; if (!c) return ""; return d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim(); };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map(ano -> {obitos, ext, circ, neo, inf})

  for (const ano of ANOS) {
    const dp = path.join(dir, `DO${UF}${ano}.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "120", `${FTP}${ano}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    let n = 0;
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue; // deletado
      const cod = by6.get(fld(d, rec, "CODMUNRES")); if (!cod) continue;
      const cid = fld(d, rec, "CAUSABAS").toUpperCase(); const idade = fld(d, rec, "IDADE");
      if (!M.has(cod)) M.set(cod, new Map());
      const mm = M.get(cod); const a = mm.get(ano) || { obitos: 0, ext: 0, circ: 0, neo: 0, inf: 0 }; a.obitos++;
      const c0 = cid[0];
      if (/[VWXY]/.test(c0)) a.ext++;                              // causas externas V01-Y98
      else if (c0 === "I") a.circ++;                               // ap. circulatório
      else if (c0 === "C" || (c0 === "D" && +cid[1] <= 4)) a.neo++; // neoplasias C00-D48
      const u = idade[0]; if ("123".includes(u) || (u === "4" && idade.slice(1) === "00")) a.inf++; // <1 ano: unid 1=hora/2=dia/3=mês, ou 4=anos com valor 00
      mm.set(ano, a); n++;
    }
    console.log(`  ✓ ${ano}: ${n} óbitos ${UF} (${d.nrec} registros)`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sim_sc (cod_ibge TEXT, ano INTEGER, obitos INTEGER, causas_externas INTEGER, circulatorio INTEGER, neoplasias INTEGER, infantil INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`TRUNCATE sim_sc`);
  let up = 0;
  for (const [cod, anos] of M) for (const [ano, a] of anos) {
    await db.query(`INSERT INTO sim_sc (cod_ibge,ano,obitos,causas_externas,circulatorio,neoplasias,infantil,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
      [cod, ano, a.obitos, a.ext, a.circ, a.neo, a.inf]); up++;
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, sum(obitos) FILTER (WHERE ano=(SELECT max(ano) FROM sim_sc)) o, sum(causas_externas) FILTER (WHERE ano=(SELECT max(ano) FROM sim_sc)) e FROM sim_sc`)).rows[0];
  console.log(`✔ sim_sc: ${chk.m} municípios · ${up} linhas · ${chk.ma}: ${Number(chk.o).toLocaleString("pt-BR")} óbitos (${chk.e} por causas externas) em ${UF}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
