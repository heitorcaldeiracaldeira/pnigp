// ETL — CNES profissionais de saúde por município + por estabelecimento. Fonte: DATASUS CNES (PF, DBC). Usa _blast_dbc.mjs.
// Profissionais DISTINTOS (por CPF) por categoria (médico/enfermeiro/dentista/téc.enfermagem/ACS). Série. node scripts/ingest_cnes_profissionais_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2020,2022,2024").split(",").map(Number);
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };
const cat = (cbo) => { if (/^2251|^2252|^2253/.test(cbo)) return "medico"; if (/^2235/.test(cbo)) return "enfermeiro"; if (/^2232/.test(cbo)) return "dentista"; if (/^3222/.test(cbo)) return "tec_enf"; if (/^5151/.test(cbo)) return "acs"; return null; };
const CATS = ["medico", "enfermeiro", "dentista", "tec_enf", "acs"];

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map();        // cod -> Map(ano -> {cat: Set(cpf)})
  const carregados = [];      // anos que REALMENTE vieram — ver carga_fatiada.mjs
  const porEstab = new Map();  // cnes -> Set(cpf) (último ano)
  const anoMax = Math.max(...ANOS);

  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    const dp = path.join(dir, `PF${UF}${yy}12.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "150", `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/PF/PF${UF}${yy}12.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(fld(d, rec, "CODUFMUN").slice(0, 6)); if (!cod) continue;
      const c = cat(fld(d, rec, "CBO")); if (!c) continue;
      const cpf = fld(d, rec, "CPF_PROF") || fld(d, rec, "CNS_PROF"); if (!cpf) continue;
      if (!M.has(cod)) M.set(cod, new Map()); const mm = M.get(cod);
      let a = mm.get(ano); if (!a) { a = {}; for (const k of CATS) a[k] = new Set(); mm.set(ano, a); } a[c].add(cpf);
      if (ano === anoMax) { const cnes = fld(d, rec, "CNES"); let s = porEstab.get(cnes); if (!s) { s = new Set(); porEstab.set(cnes, s); } s.add(cpf); }
    }
    carregados.push(ano);
    console.log(`  ✓ ${ano}: ${d.nrec.toLocaleString("pt-BR")} vínculos ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cnes_profissionais_sc (cod_ibge TEXT, ano INTEGER, medicos INTEGER, enfermeiros INTEGER, dentistas INTEGER, tec_enf INTEGER, acs INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_profissionais_estab (codigo_cnes TEXT PRIMARY KEY, profissionais INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  // ⚠️ Era TRUNCATE das duas + insert do que veio: um ano falho levava junto os anos já corretos.
  const { substituiFatias, relata } = await import("./carga_fatiada.mjs");
  const L = [];
  for (const [cod, anos] of M) for (const [ano, a] of anos) L.push([cod, ano, a.medico.size, a.enfermeiro.size, a.dentista.size, a.tec_enf.size, a.acs.size]);
  const up = await substituiFatias(db, { tabela: "cnes_profissionais_sc", fatiaCols: ["ano"],
    fatias: carregados.map((a) => [a]), colunas: ["cod_ibge", "ano", "medicos", "enfermeiros", "dentistas", "tec_enf", "acs"],
    tipos: ["text", "int", "int", "int", "int", "int", "int"], linhas: L });
  if (carregados.includes(anoMax) && porEstab.size) {
    await db.query("BEGIN");
    try {
      await db.query(`TRUNCATE cnes_profissionais_estab`);
      const E = [...porEstab.entries()].map(([c, s]) => [c, s.size]);
      await db.query(`INSERT INTO cnes_profissionais_estab (codigo_cnes,profissionais)
        SELECT c,p FROM unnest($1::text[],$2::int[]) AS z(c,p)`, [E.map((x) => x[0]), E.map((x) => x[1])]);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK"); throw e; }
  } else if (!carregados.includes(anoMax)) console.log(`  ⚠ ${anoMax} não carregou — cnes_profissionais_estab mantida`);
  relata("cnes_profissionais_sc", carregados, ANOS);
  const chk = (await db.query(`SELECT max(ano) ma, sum(medicos) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_profissionais_sc)) m, sum(enfermeiros) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_profissionais_sc)) e FROM cnes_profissionais_sc`)).rows[0];
  console.log(`✔ cnes_profissionais: ${up} linhas · ${chk.ma}: ${chk.m} médicos, ${chk.e} enfermeiros em ${UF} · ${porEstab.size} estabelecimentos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
