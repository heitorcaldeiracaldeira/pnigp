// ETL — CFEM (royalty de mineração) distribuído por município. Fonte: dadosabertos.anm.gov.br/CFEM/CFEM_Distribuicao.csv
// (~128MB, latin1, campos entre aspas). Agrega Valor por (município, ano) + top substâncias. State-agnostic (UF env).
// node scripts/ingest_cfem_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CSV_URL = "https://dadosabertos.anm.gov.br/CFEM/CFEM_Distribuicao.csv";
const nBR = (s) => { const x = Number(String(s || "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const cel = (l) => { const m = l.match(/"([^"]*)"/g); return m ? m.map((x) => x.slice(1, -1)) : []; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));

  const csv = process.env.CSV || path.join(os.tmpdir(), "cfem_distrib.csv");
  if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e6) { console.log("baixando CFEM (~128MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "300", "-A", "Mozilla/5.0", "-o", csv, CSV_URL], { stdio: "ignore" }); }

  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map();
  for await (const line of rl) {
    const c = cel(line); if (c.length < 11) continue;
    if (!H) { H = c.map((h) => h.trim()); const at = (n) => H.findIndex((h) => h.replace(/[^A-Za-z]/g, "").toLowerCase() === n); ix = { ano: at("ano"), uf: at("siglaestado"), ente: at("ente"), cod: at("codigoente"), subst: at("substncia"), val: at("valor") }; continue; }
    if ((c[ix.uf] || "").toUpperCase() !== UF) continue;
    if (!/munic/i.test(c[ix.ente] || "")) continue; // só municípios (não Estado/DF/União)
    const cod = String(c[ix.cod] || "").trim(); if (!byCod.has(cod)) continue;
    const ano = Number(c[ix.ano]); const v = nBR(c[ix.val]); if (!ano) continue;
    const k = cod + "|" + ano;
    if (!M.has(k)) M.set(k, { cod, ano, v: 0, subs: new Map() });
    const m = M.get(k); m.v += v;
    const s = (c[ix.subst] || "").trim(); if (s && s !== "-") m.subs.set(s, (m.subs.get(s) || 0) + v);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS cfem_sc (cod_ibge TEXT, ano INTEGER, valor NUMERIC, top_substancias JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  for (const m of M.values()) {
    const top = [...m.subs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([substancia, v]) => ({ substancia, valor: Math.round(v) }));
    await db.query(`INSERT INTO cfem_sc (cod_ibge,ano,valor,top_substancias,atualizado) VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET valor=EXCLUDED.valor,top_substancias=EXCLUDED.top_substancias,atualizado=now()`,
      [m.cod, m.ano, Math.round(m.v), JSON.stringify(top)]);
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) munis, count(distinct ano) anos, min(ano) mi, max(ano) ma, round(sum(valor)/1e6,1) mi_total FROM cfem_sc`)).rows[0];
  console.log(`✔ cfem_sc: ${chk.munis} municípios · ${chk.anos} anos (${chk.mi}-${chk.ma}) · R$ ${chk.mi_total} mi de royalties`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
