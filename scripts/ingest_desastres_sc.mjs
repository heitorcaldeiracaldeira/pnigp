// ETL — Desastres (S2ID) por município. Fonte: Atlas Digital de Desastres (atlasdigital.mdr.gov.br) — base completa 1991-2025
// (CSV 51MB, latin1, ;). Download DIRETO em /arquivos/ (estático, passa o WAF F5 que bloqueia o portal S2ID interativo).
// Agrega por município: nº desastres, recentes, danos humanos (mortos/afetados/desalojados), tipos, último ano. node scripts/ingest_desastres_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CSV_URL = "https://atlasdigital.mdr.gov.br/arquivos/BD_Atlas_1991_2025_v1.0_2026.04.23_Consolidado.csv";
const ANO_REC = new Date().getFullYear() - 10;
const intN = (s) => { const x = parseInt(String(s || "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(x) ? x : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));

  const csv = process.env.CSV || path.join(os.tmpdir(), "atlas_desastres.csv");
  if (!fs.existsSync(csv) || fs.statSync(csv).size < 1e6) { console.log("baixando Atlas Desastres (~51MB)…"); execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", csv, CSV_URL], { stdio: "ignore" }); }

  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map();
  for await (const line of rl) {
    const c = line.split(";");
    if (!H) { H = c.map((h) => h.trim()); const at = (n) => H.findIndex((h) => h.replace(/\s+/g, " ").toLowerCase() === n.toLowerCase());
      ix = { uf: at("Sigla_UF"), cod: at("Cod_IBGE_Mun"), data: at("Data_Evento"), tipo: at("descricao_tipologia"), grupo: at("grupo_de_desastre"),
        mortos: at("DH_MORTOS"), afet: at("DH_total_danos_humanos_diretos"), desab: at("DH_DESABRIGADOS"), desal: at("DH_DESALOJADOS") }; continue; }
    if ((c[ix.uf] || "").trim().toUpperCase() !== UF) continue;
    const cod = String(c[ix.cod] || "").trim(); if (!byCod.has(cod)) continue;
    const ano = intN((c[ix.data] || "").slice(-4));
    if (!M.has(cod)) M.set(cod, { n: 0, rec: 0, mortos: 0, afet: 0, desal: 0, tipos: new Map(), anos: new Map(), anoUlt: 0 });
    const m = M.get(cod); m.n++; if (ano >= ANO_REC) m.rec++;
    if (ano >= 1991 && ano <= 2025) m.anos.set(ano, (m.anos.get(ano) || 0) + 1); // série histórica (anuário)
    const cap = (v) => Math.min(Math.max(0, intN(v)), 2_000_000); // sanidade: nenhum evento em SC afeta >2M pessoas
    m.mortos += Math.min(Math.max(0, intN(c[ix.mortos])), 150); m.afet += cap(c[ix.afet]); m.desal += cap(c[ix.desab]) + cap(c[ix.desal]); // mortos/evento capado em 150 (S2ID autodeclarado tem garbage; pior evento SC 2008 ~135 no total)
    if (ano > m.anoUlt) m.anoUlt = ano;
    const t = (c[ix.tipo] || "").trim(); if (t) m.tipos.set(t, (m.tipos.get(t) || 0) + 1);
  }

  await db.query(`DROP TABLE IF EXISTS desastres_sc`);
  await db.query(`CREATE TABLE desastres_sc (cod_ibge TEXT PRIMARY KEY, n_desastres INTEGER, n_recentes INTEGER, mortos INTEGER, afetados BIGINT, desalojados BIGINT, ano_ultimo INTEGER, top_tipos JSONB, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, m] of M) {
    const top = [...m.tipos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tipo, n]) => ({ tipo, n }));
    const serie = [...m.anos.entries()].sort((a, b) => a[0] - b[0]).map(([ano, n]) => ({ ano, n }));
    await db.query(`INSERT INTO desastres_sc (cod_ibge,n_desastres,n_recentes,mortos,afetados,desalojados,ano_ultimo,top_tipos,serie,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET n_desastres=EXCLUDED.n_desastres,n_recentes=EXCLUDED.n_recentes,mortos=EXCLUDED.mortos,afetados=EXCLUDED.afetados,desalojados=EXCLUDED.desalojados,ano_ultimo=EXCLUDED.ano_ultimo,top_tipos=EXCLUDED.top_tipos,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, m.n, m.rec, m.mortos, m.afet, m.desal, m.anoUlt || null, JSON.stringify(top), JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_desastres) n, sum(mortos) mo, sum(afetados) af FROM desastres_sc`)).rows[0];
  console.log(`✔ desastres_sc: ${chk.m} municípios · ${chk.n} desastres · ${chk.mo} mortos · ${Number(chk.af).toLocaleString("pt-BR")} afetados`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
