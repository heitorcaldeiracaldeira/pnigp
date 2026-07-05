// ETL — IBAMA Autos de Infração ambiental por município. Fonte: dados abertos IBAMA (zip de CSVs por ano, 1977+).
// Agrega por município: nº de autos + valor das multas + série anual. Casa por NOME (COD_MUNICIPIO do IBAMA não é IBGE).
// node scripts/ingest_ibama_autos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ZURL = "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const nBR = (s) => { const x = Number(String(s || "").replace(/"/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
// parser CSV simples com aspas (campos podem conter ;)
const parseLine = (l) => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (c === ";" && !q) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };

async function run() {
  const AdmZip = (await import("adm-zip")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const zp = path.join(dir, "ibama_autos.zip");
  if (!fs.existsSync(zp)) { console.log("baixando IBAMA autos (~120MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "300", "-A", "Mozilla/5.0", "-o", zp, ZURL], { stdio: "ignore" }); }
  const zip = new AdmZip(zp);
  const entries = zip.getEntries().filter((e) => /auto_infracao_\d{4}\.csv$/i.test(e.entryName));

  const M = new Map(); // cod -> Map(ano -> {n, val})
  let ixU = -1, ixM = -1, ixV = -1, ixD = -1;
  for (const ent of entries) {
    const lines = zip.readFile(ent).toString("latin1").split(/\r?\n/);
    if (!lines.length) continue;
    if (ixU < 0) { const H = parseLine(lines[0]).map((h) => h.replace(/"/g, "").trim()); ixU = H.indexOf("UF"); ixM = H.indexOf("MUNICIPIO"); ixV = H.indexOf("VAL_AUTO_INFRACAO"); ixD = H.indexOf("DAT_HORA_AUTO_INFRACAO"); }
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue; const c = parseLine(lines[i]);
      if ((c[ixU] || "").replace(/"/g, "").trim() !== UF) continue;
      const cod = byName.get(norm(c[ixM])); if (!cod) continue;
      const ano = +(String(c[ixD] || "").match(/(19|20)\d{2}/)?.[0] || 0); if (ano < 1990 || ano > 2026) continue;
      if (!M.has(cod)) M.set(cod, new Map());
      const mm = M.get(cod); const a = mm.get(ano) || { n: 0, val: 0 }; a.n++; a.val += nBR(c[ixV]); mm.set(ano, a);
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS ibama_autos_sc (cod_ibge TEXT PRIMARY KEY, n_autos INTEGER, valor_total NUMERIC, n_recentes INTEGER, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, mm] of M) {
    const anos = [...mm.entries()].sort((a, b) => a[0] - b[0]);
    const nTot = anos.reduce((s, [, a]) => s + a.n, 0), vTot = anos.reduce((s, [, a]) => s + a.val, 0);
    const nRec = anos.filter(([y]) => y >= 2016).reduce((s, [, a]) => s + a.n, 0);
    const serie = anos.map(([ano, a]) => ({ ano, valor: a.n }));
    await db.query(`INSERT INTO ibama_autos_sc (cod_ibge,n_autos,valor_total,n_recentes,serie,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET n_autos=EXCLUDED.n_autos,valor_total=EXCLUDED.valor_total,n_recentes=EXCLUDED.n_recentes,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, nTot, Math.round(vTot), nRec, JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_autos) n, round(sum(valor_total)/1e6,1) mi FROM ibama_autos_sc`)).rows[0];
  console.log(`✔ ibama_autos_sc: ${chk.m} municípios · ${Number(chk.n).toLocaleString("pt-BR")} autos · R$ ${chk.mi} mi em multas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
