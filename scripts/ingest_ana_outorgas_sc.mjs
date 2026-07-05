// ETL — ANA Outorgas de direito de uso de recursos hídricos por município. Fonte: ANA (portal ArcGIS Hub, dados abertos).
// 3 bases: federal superficial + estadual superficial + estadual subterrânea. Agrega por município: nº outorgas + vazão + volume.
// node scripts/ingest_ana_outorgas_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const B = "https://dadosabertos.ana.gov.br/api/download/v1/items";
const BASES = [
  { key: "fed_sup", id: "5158df5a5e4946e5a9ad970fc39f2631" },
  { key: "est_sup", id: "ebafef2426b5449fa723a7104f8a98b6" },
  { key: "est_sub", id: "dffa39df465a4e7dbebd4589c351b907" },
];
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const numf = (v) => { const n = Number(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const P = (l) => { const o = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> {n, vaz, vol, super, fin:Map, anos:Map}

  for (const base of BASES) {
    const cp = path.join(dir, `ana_out_${base.key}.csv`);
    if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e5) { console.log(`  baixando ${base.key}…`); try { execFileSync("curl", ["-s", "-L", "--max-time", "240", "-A", "Mozilla/5.0", "-o", cp, `${B}/${base.id}/csv?layers=0`], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(cp)) { console.log(`  ⚠ ${base.key}: sem arquivo`); continue; }
    const isSuper = /_sup$/.test(base.key);
    const rl = readline.createInterface({ input: fs.createReadStream(cp, { encoding: "utf8" }), crlfDelay: Infinity });
    let H = null, ix = {}, n = 0;
    for await (const line of rl) {
      if (!H) { H = P(line.replace(/^﻿/, "")); ix = { mun: H.indexOf("ing_nm_municipio"), ufm: H.indexOf("ing_sg_ufmunicipio"), vaz: H.indexOf("int_qt_vazaomedia"), vol: H.indexOf("int_qt_volumeanual"), fin: H.indexOf("tfn_ds"), dt: H.indexOf("out_dt_outorgainicial") }; continue; }
      const c = P(line); if ((c[ix.ufm] || "").trim().toUpperCase() !== UF) continue;
      const cod = byName.get(norm(c[ix.mun])); if (!cod) continue;
      if (!M.has(cod)) M.set(cod, { n: 0, vaz: 0, vol: 0, sup: 0, sub: 0, fin: new Map(), anos: new Map() });
      const m = M.get(cod); m.n++; m.vaz += numf(c[ix.vaz]); m.vol += numf(c[ix.vol]);
      if (isSuper) m.sup++; else m.sub++;
      const f = (c[ix.fin] || "").trim(); if (f) m.fin.set(f, (m.fin.get(f) || 0) + 1);
      const ano = +(String(c[ix.dt] || "").match(/(19|20)\d{2}/)?.[0] || 0); if (ano >= 1990 && ano <= 2026) m.anos.set(ano, (m.anos.get(ano) || 0) + 1);
      n++;
    }
    console.log(`  ✓ ${base.key}: ${n} outorgas ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS ana_outorgas_sc (cod_ibge TEXT PRIMARY KEY, n_outorgas INTEGER, vazao_total NUMERIC, volume_total NUMERIC, n_superficial INTEGER, n_subterranea INTEGER, por_finalidade JSONB, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`ALTER TABLE ana_outorgas_sc ADD COLUMN IF NOT EXISTS n_superficial INTEGER, ADD COLUMN IF NOT EXISTS n_subterranea INTEGER, ADD COLUMN IF NOT EXISTS por_finalidade JSONB, ADD COLUMN IF NOT EXISTS serie JSONB`);
  await db.query(`TRUNCATE ana_outorgas_sc`);
  for (const [cod, m] of M) {
    const fin = [...m.fin.entries()].sort((a, b) => b[1] - a[1]).map(([finalidade, n]) => ({ finalidade, n }));
    const anos = [...m.anos.entries()].sort((a, b) => a[0] - b[0]); let acc = 0;
    const serie = anos.map(([ano, n]) => { acc += n; return { ano, valor: acc }; }); // cumulativa de outorgas
    await db.query(`INSERT INTO ana_outorgas_sc (cod_ibge,n_outorgas,vazao_total,volume_total,n_superficial,n_subterranea,por_finalidade,serie,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [cod, m.n, Math.round(m.vaz), Math.round(m.vol), m.sup, m.sub, JSON.stringify(fin), JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_outorgas) n, sum(n_subterranea) sub FROM ana_outorgas_sc`)).rows[0];
  console.log(`✔ ana_outorgas_sc: ${chk.m} municípios · ${Number(chk.n).toLocaleString("pt-BR")} outorgas (${chk.sub} subterrâneas) · finalidade+série incluídas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
