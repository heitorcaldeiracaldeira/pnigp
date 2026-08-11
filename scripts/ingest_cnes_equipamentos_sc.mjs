// ETL — CNES equipamentos médicos por município + por estabelecimento. Fonte: DATASUS CNES (EQ, DBC). Usa _blast_dbc.mjs.
// Diagnóstico por imagem (tomógrafo/RM/mamógrafo/raio-x), manutenção da vida (respirador/UTI), total, disponível ao SUS. node scripts/ingest_cnes_equipamentos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2020,2022,2024").split(",").map(Number); // série a cada ~2 anos
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map();        // cod -> Map(ano -> {total,imagem,vida,sus})
  const carregados = [];      // anos que REALMENTE vieram — ver carga_fatiada.mjs
  const porEstab = new Map();  // cnes -> {total,imagem,vida,sus} (último ano)
  const anoMax = Math.max(...ANOS);

  for (const ano of ANOS) {
    const yy = String(ano).slice(2);
    const dp = path.join(dir, `EQ${UF}${yy}12.dbc`);
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { try { execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/EQ/EQ${UF}${yy}12.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ano}: ${e.message.slice(0, 30)}`); continue; }
    for (let i = 0; i < d.nrec; i++) {
      const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
      const cod = by6.get(fld(d, rec, "CODUFMUN").slice(0, 6)); if (!cod) continue;
      const tip = fld(d, rec, "TIPEQUIP"); const qt = parseInt(fld(d, rec, "QT_EXIST"), 10) || 0; const sus = /S|1/.test(fld(d, rec, "IND_SUS"));
      const add = (o) => { o.total += qt; if (tip === "1") o.imagem += qt; if (tip === "5") o.vida += qt; if (sus) o.sus += qt; };
      if (!M.has(cod)) M.set(cod, new Map()); const mm = M.get(cod); const a = mm.get(ano) || { total: 0, imagem: 0, vida: 0, sus: 0 }; add(a); mm.set(ano, a);
      if (ano === anoMax) { const cnes = fld(d, rec, "CNES"); const e = porEstab.get(cnes) || { total: 0, imagem: 0, vida: 0, sus: 0 }; add(e); porEstab.set(cnes, e); }
    }
    carregados.push(ano);
    console.log(`  ✓ ${ano}: ${d.nrec} registros ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cnes_equipamentos_sc (cod_ibge TEXT, ano INTEGER, total INTEGER, imagem INTEGER, vida INTEGER, sus INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS cnes_equipamentos_estab (codigo_cnes TEXT PRIMARY KEY, total INTEGER, imagem INTEGER, vida INTEGER, sus INTEGER, atualizado TIMESTAMPTZ DEFAULT now())`);
  // ⚠️ Era TRUNCATE das duas + insert do que veio: um ano falho levava junto os anos já corretos.
  const { substituiFatias, relata } = await import("./carga_fatiada.mjs");
  const L = [];
  for (const [cod, anos] of M) for (const [ano, a] of anos) L.push([cod, ano, a.total, a.imagem, a.vida, a.sus]);
  const up = await substituiFatias(db, { tabela: "cnes_equipamentos_sc", fatiaCols: ["ano"],
    fatias: carregados.map((a) => [a]), colunas: ["cod_ibge", "ano", "total", "imagem", "vida", "sus"],
    tipos: ["text", "int", "int", "int", "int", "int"], linhas: L });
  if (carregados.includes(anoMax) && porEstab.size) {
    await db.query("BEGIN");
    try {
      await db.query(`TRUNCATE cnes_equipamentos_estab`);
      const E = [...porEstab.entries()].map(([c, e]) => [c, e.total, e.imagem, e.vida, e.sus]);
      await db.query(`INSERT INTO cnes_equipamentos_estab (codigo_cnes,total,imagem,vida,sus)
        SELECT c,t,i,v,s FROM unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::int[]) AS z(c,t,i,v,s)`,
        [E.map((x) => x[0]), E.map((x) => x[1]), E.map((x) => x[2]), E.map((x) => x[3]), E.map((x) => x[4])]);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK"); throw e; }
  } else if (!carregados.includes(anoMax)) console.log(`  ⚠ ${anoMax} não carregou — cnes_equipamentos_estab mantida`);
  relata("cnes_equipamentos_sc", carregados, ANOS);
  const chk = (await db.query(`SELECT max(ano) ma, sum(total) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_equipamentos_sc)) t, sum(imagem) FILTER (WHERE ano=(SELECT max(ano) FROM cnes_equipamentos_sc)) img FROM cnes_equipamentos_sc`)).rows[0];
  console.log(`✔ cnes_equipamentos: ${up} linhas · ${chk.ma}: ${chk.t} equipamentos (${chk.img} de imagem) em ${UF} · ${porEstab.size} estabelecimentos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
