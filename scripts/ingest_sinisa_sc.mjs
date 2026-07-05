// ETL — SINISA (sucessor do SNIS) por município. Fonte: Ministério das Cidades (gov.br/cidades/.../sinisa/resultados-sinisa).
// Planilhas de indicadores por módulo (água/esgoto/resíduos), ref. 2024. Extrai o índice de ATENDIMENTO por município.
// ZIP → xlsx (cabeçalho na linha ~9). node scripts/ingest_sinisa_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const B = "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa/resultados-sinisa";
const MODS = [
  { key: "agua", zip: "SINISA_Resultados_Ref2024.zip", ent: /Indicadores_Base Municipal/i, ind: /atendimento da popula.*total com rede de abastecimento/i },
  { key: "esgoto", zip: "SINISA_ESGOTO_Planilhas_2024.zip", ent: /Indicadores_Base/i, ind: /atendimento da popula.*total com rede coletora/i },
  { key: "residuos", zip: "SINISA_RESIDUOS_planilhas_2024.zip", ent: /RESIDUOS_Indicadores/i, ind: /^IRS0001$/i }, // IRS0001 = 1º Indicador de Cobertura (coleta de RDO)
];
const pct = (v) => { let x; if (typeof v === "number") x = v; else { const s = String(v).trim(); x = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s); } if (!Number.isFinite(x)) return null; if (x > 0 && x <= 1) x *= 100; return x >= 0 && x <= 101 ? +Math.min(x, 100).toFixed(1) : null; };

async function run() {
  const AdmZip = (await import("adm-zip")).default; const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> {agua, esgoto, residuos}

  for (const mod of MODS) {
    const zp = path.join(dir, `sinisa_${mod.key}.zip`);
    if (!fs.existsSync(zp) || fs.statSync(zp).size < 1e5) { try { execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", zp, `${B}/${mod.zip}`], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(zp)) { console.log(`  ⚠ ${mod.key}: sem zip`); continue; }
    const zip = new AdmZip(zp);
    const ent = zip.getEntries().find((e) => mod.ent.test(e.entryName) && /\.xlsx$/i.test(e.entryName));
    if (!ent) { console.log(`  ⚠ ${mod.key}: xlsx não achado`); continue; }
    const wb = XLSX.read(zip.readFile(ent), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hr = rows.findIndex((r) => r.some((c) => /IBGE/i.test(String(c))));
    if (hr < 0) { console.log(`  ⚠ ${mod.key}: sem cabeçalho`); continue; }
    const head = rows[hr].map((h) => String(h));
    const ic = head.findIndex((h) => /IBGE/i.test(h)); const iu = head.findIndex((h) => /^UF$/i.test(h.trim()));
    const iv = head.findIndex((h) => mod.ind.test(h));
    if (iv < 0) { console.log(`  ⚠ ${mod.key}: indicador não achado`); continue; }
    let n = 0;
    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i]; if (iu >= 0 && String(r[iu]).trim().toUpperCase() !== UF) continue;
      const cod = String(r[ic] || "").trim(); if (!byCod.has(cod)) continue;
      const v = pct(r[iv]); if (v == null) continue;
      if (!M.has(cod)) M.set(cod, {});
      const m = M.get(cod); if (m[mod.key] == null || v > m[mod.key]) m[mod.key] = v; // max entre prestadores
      n++;
    }
    console.log(`  ✓ ${mod.key}: ${n} linhas ${UF} (col "${head[iv].slice(0, 40)}")`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sinisa_sc (cod_ibge TEXT PRIMARY KEY, ano INTEGER, agua_atend NUMERIC, esgoto_atend NUMERIC, residuos_atend NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, m] of M) {
    await db.query(`INSERT INTO sinisa_sc (cod_ibge,ano,agua_atend,esgoto_atend,residuos_atend,atualizado) VALUES ($1,2024,$2,$3,$4,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET ano=2024,agua_atend=EXCLUDED.agua_atend,esgoto_atend=EXCLUDED.esgoto_atend,residuos_atend=EXCLUDED.residuos_atend,atualizado=now()`,
      [cod, m.agua ?? null, m.esgoto ?? null, m.residuos ?? null]);
  }
  const chk = (await db.query(`SELECT count(*) m, round(avg(agua_atend),1) a, round(avg(esgoto_atend),1) e, round(avg(residuos_atend),1) r FROM sinisa_sc`)).rows[0];
  console.log(`✔ sinisa_sc: ${chk.m} municípios · atend. médio água ${chk.a}% · esgoto ${chk.e}% · resíduos ${chk.r}%`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
