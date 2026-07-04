// ETL — Novo CAGED: saldo de empregos formais por município. Fonte: FTP PDET/MTE (CAGEDMOV{AAAAMM}.7z, ~59MB/mês, 4,8M linhas).
// Agrega saldo (admissões − desligamentos) por (município, ano, mês). Download curl FTP + descompressão 7zip-min + stream.
// State-agnostic (UF_COD env). MESES=202601,202602,... node scripts/ingest_caged_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_COD = process.env.UF_COD || "42";
const MESES = (process.env.MESES || "202601,202602,202603,202604,202605").split(",");
const FTP = "ftp://ftp.mtps.gov.br/pdet/microdados/NOVO%20CAGED";

async function run() {
  const _7z = await import("7zip-min"); const unpack = _7z.default?.unpack || _7z.unpack;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();

  await db.query(`CREATE TABLE IF NOT EXISTS caged_sc (cod_ibge TEXT, ano INTEGER, mes INTEGER, saldo INTEGER, admissoes INTEGER, desligamentos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, mes))`);

  for (const ym of MESES) {
    const ano = +ym.slice(0, 4), mes = +ym.slice(4, 6);
    const z = path.join(dir, `caged_${ym}.7z`);
    if (!fs.existsSync(z) || fs.statSync(z).size < 1e5) { try { execFileSync("curl", ["-s", "--max-time", "300", "-o", z, `${FTP}/${ano}/${ym}/CAGEDMOV${ym}.7z`], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(z) || fs.statSync(z).size < 1e5) { console.log(`  ⚠ ${ym}: sem arquivo`); continue; }
    const out = path.join(dir, `caged_out_${ym}`);
    try { await new Promise((res, rej) => unpack(z, out, (e) => e ? rej(e) : res())); } catch (e) { console.log(`  ⚠ ${ym}: falha 7z`); continue; }
    const txt = fs.readdirSync(out).find((f) => /\.txt$/i.test(f)); if (!txt) { console.log(`  ⚠ ${ym}: sem txt`); continue; }

    const M = new Map(); let H = null, iuf, imun, isaldo;
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(out, txt), { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      const c = line.split(";");
      if (!H) { H = c.map((h) => h.trim().toLowerCase()); iuf = H.findIndex((h) => h.includes("uf")); imun = H.findIndex((h) => h.includes("munic")); isaldo = H.findIndex((h) => h.includes("saldo")); continue; }
      if ((c[iuf] || "") !== UF_COD) continue;
      const cod = by6.get((c[imun] || "").trim()); if (!cod) continue;
      const s = parseInt(c[isaldo], 10); if (s !== 1 && s !== -1) continue;
      if (!M.has(cod)) M.set(cod, { adm: 0, desl: 0 });
      const m = M.get(cod); if (s === 1) m.adm++; else m.desl++;
    }
    for (const [cod, m] of M) {
      await db.query(`INSERT INTO caged_sc (cod_ibge,ano,mes,saldo,admissoes,desligamentos,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now())
        ON CONFLICT (cod_ibge,ano,mes) DO UPDATE SET saldo=EXCLUDED.saldo,admissoes=EXCLUDED.admissoes,desligamentos=EXCLUDED.desligamentos,atualizado=now()`,
        [cod, ano, mes, m.adm - m.desl, m.adm, m.desl]);
    }
    try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
    console.log(`  ✓ ${ym}: ${M.size} municípios`);
  }
  const chk = (await db.query(`SELECT count(*) l, count(distinct cod_ibge) m, sum(saldo) saldo, min(ano*100+mes) mi, max(ano*100+mes) ma FROM caged_sc`)).rows[0];
  console.log(`✔ caged_sc: ${chk.l} linhas · ${chk.m} munis · saldo líquido ${chk.saldo} · ${chk.mi}-${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
