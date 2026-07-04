// ETL — INPE queimadas (focos de calor) por município. Fonte: dataserver-coids.inpe.br (CSVs mensais Brasil).
// Download via CURL (timeout confiável — o fetch do Node pendura na conexão lenta do dataserver). Agrega nº de focos
// + risco médio + bioma predominante por (município, ano, mês). State-agnostic (prefixo IBGE por UF). node scripts/ingest_queimadas_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/";
const curl = (u, tmp, t = 60) => { try { execFileSync("curl", ["-s", "-L", "--max-time", String(t), "-A", "Mozilla/5.0", "-o", tmp, u], { stdio: "ignore" }); return fs.existsSync(tmp) && fs.statSync(tmp).size > 0 ? fs.readFileSync(tmp, "utf8") : null; } catch (e) { return null; } };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const tmp = path.join(os.tmpdir(), "inpe_focos.csv");

  const dir = curl(BASE, path.join(os.tmpdir(), "inpe_dir.html"), 30);
  const files = [...(dir || "").matchAll(/href="(focos_mensal_br_\d{6}\.csv)"/gi)].map((m) => m[1]);
  if (!files.length) { console.error("sem lista de arquivos (dataserver fora?)"); process.exit(1); }
  console.log(`${files.length} arquivos mensais a processar…`);

  const M = new Map(); let ix = null, ok = 0;
  for (const f of files) {
    const csv = curl(BASE + f, tmp, 90); if (!csv) { console.log(`  ⚠ falhou ${f}`); continue; }
    const lines = csv.split(/\r?\n/);
    if (!ix) { const h = lines[0].split(","); ix = { cod: h.indexOf("municipio_id"), dt: h.indexOf("data_hora_gmt"), risco: h.indexOf("risco_fogo"), bioma: h.indexOf("bioma") }; }
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(","); if (c.length < 12) continue;
      const cod = (c[ix.cod] || "").trim(); if (!byCod.has(cod)) continue;
      const dt = c[ix.dt] || ""; const ano = +dt.slice(0, 4), mes = +dt.slice(5, 7); if (!ano || !mes) continue;
      const k = cod + "|" + ano + "|" + mes;
      if (!M.has(k)) M.set(k, { cod, ano, mes, focos: 0, risco: 0, nr: 0, biomas: new Map() });
      const m = M.get(k); m.focos++;
      const rf = parseFloat(c[ix.risco]); if (Number.isFinite(rf) && rf >= 0) { m.risco += rf; m.nr++; }
      const b = (c[ix.bioma] || "").trim(); if (b) m.biomas.set(b, (m.biomas.get(b) || 0) + 1);
    }
    ok++; console.log(`  ✓ ${f} (${ok}/${files.length}) · acum ${M.size} muni-mês`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS queimadas_sc (cod_ibge TEXT, ano INTEGER, mes INTEGER, focos INTEGER, risco_medio NUMERIC, bioma TEXT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, mes))`);
  for (const m of M.values()) {
    const bioma = [...m.biomas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    await db.query(`INSERT INTO queimadas_sc (cod_ibge,ano,mes,focos,risco_medio,bioma,atualizado) VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (cod_ibge,ano,mes) DO UPDATE SET focos=EXCLUDED.focos,risco_medio=EXCLUDED.risco_medio,bioma=EXCLUDED.bioma,atualizado=now()`,
      [m.cod, m.ano, m.mes, m.focos, m.nr ? +(m.risco / m.nr).toFixed(2) : null, bioma]);
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) munis, sum(focos) focos, min(ano) mi, max(ano) ma FROM queimadas_sc`)).rows[0];
  console.log(`✔ queimadas_sc: ${chk.munis} municípios com focos · ${chk.focos} focos totais · ${chk.mi}-${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
