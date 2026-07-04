// ETL — BNDES desembolsos por município (crédito produtivo). Fonte: dadosabertos.bndes.gov.br (CSV ~135MB, latin1).
// Agrega desembolsos_reais por (município, ano) + guarda os 3 maiores setores BNDES. State-agnostic (UF env).
// Streaming (readline). node scripts/ingest_bndes_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF_NOME || "SANTA CATARINA";
const CSV_URL = "https://dadosabertos.bndes.gov.br/dataset/102e89ec-836a-4ae0-acc7-74ac2a804c1c/resource/179950b8-b504-4cc7-b0db-9c9eed99e9ba/download/desembolsos-mensais.csv";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nBR = (s) => { const x = Number(String(s || "").replace(/"/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const cel = (l) => l.split(";").map((x) => x.replace(/^"|"$/g, ""));

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byCod = new Set(ents.map((e) => e.cod_ibge));
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));

  const csv = process.env.CSV || path.join(os.tmpdir(), "bndes_desemb.csv");
  if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e6) { console.log("baixando BNDES (~135MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "300", "-A", "Mozilla/5.0", "-o", csv, CSV_URL], { stdio: "ignore" }); }

  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map(); // cod|ano -> {v, setores:Map}
  for await (const line of rl) {
    if (!H) { H = cel(line).map((h) => h.trim()); const at = (n) => H.indexOf(n); ix = { ano: at("ano"), uf: at("uf"), mun: at("municipio"), cod: at("municipio_codigo"), setor: at("setor_bndes"), val: at("desembolsos_reais") }; continue; }
    const c = cel(line); if (c.length < H.length) continue;
    if ((c[ix.uf] || "").toUpperCase().trim() !== UF) continue;
    let cod = String(c[ix.cod] || "").trim();
    if (!byCod.has(cod)) cod = byName.get(norm(c[ix.mun])) || null; // fallback por nome
    if (!cod || cod.length !== 7) continue; // ignora "DIVERSOS"/9999998
    const ano = Number(c[ix.ano]); const v = nBR(c[ix.val]); if (!ano) continue;
    const k = cod + "|" + ano;
    if (!M.has(k)) M.set(k, { cod, ano, v: 0, setores: new Map() });
    const m = M.get(k); m.v += v;
    const s = (c[ix.setor] || "").trim(); if (s) m.setores.set(s, (m.setores.get(s) || 0) + v);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS bndes_sc (cod_ibge TEXT, ano INTEGER, desembolso NUMERIC, top_setores JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let n = 0;
  for (const m of M.values()) {
    const top = [...m.setores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([setor, v]) => ({ setor, valor: Math.round(v) }));
    await db.query(`INSERT INTO bndes_sc (cod_ibge,ano,desembolso,top_setores,atualizado) VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET desembolso=EXCLUDED.desembolso,top_setores=EXCLUDED.top_setores,atualizado=now()`,
      [m.cod, m.ano, Math.round(m.v), JSON.stringify(top)]);
    n++;
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) munis, count(distinct ano) anos, min(ano) mi, max(ano) ma, round(sum(desembolso)/1e9,1) bi FROM bndes_sc`)).rows[0];
  console.log(`✔ bndes_sc: ${chk.munis} municípios · ${chk.anos} anos (${chk.mi}-${chk.ma}) · R$ ${chk.bi} bi desembolsados`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
