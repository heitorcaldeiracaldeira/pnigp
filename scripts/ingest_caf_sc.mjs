// ETL — CAF (Cadastro Nacional da Agricultura Familiar, ex-DAP): agricultores familiares por município de SC.
// Fonte: MDA — Transparência da CAF (XLSX mensal, nacional). Aba GERAL: bloco Pessoa Física (Total) + bloco Jurídica (CAFs).
// node scripts/ingest_caf_sc.mjs   (CAF_URL=<xlsx> opcional p/ forçar competência)
import fs from "fs"; import pg from "pg"; import XLSX from "xlsx";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const BASE_PAG = "https://www.gov.br/mda/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/cadastro-nacional-da-agricultura-familiar";
const KNOWN = `${BASE_PAG}/20260601RelatrioMensal1.xlsx`;
const numf = (v) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// Descobre o XLSX mais recente na página do MDA (regex AAAAMMDD…RelatrioMensal*.xlsx); fallback p/ URL conhecida.
async function descobrirUrl() {
  if (process.env.CAF_URL) return process.env.CAF_URL;
  try {
    const r = await fetch(BASE_PAG, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) {
      const html = await r.text();
      const links = [...html.matchAll(/href="([^"]*?(\d{8})[^"]*?RelatrioMensal[^"]*?\.xlsx)"/gi)]
        .map((m) => ({ url: m[1].startsWith("http") ? m[1] : new URL(m[1], BASE_PAG + "/").href, dt: m[2] }))
        .sort((a, b) => b.dt.localeCompare(a.dt));
      if (links.length) return links[0].url;
    }
  } catch { /* fallback */ }
  return KNOWN;
}

async function main() {
  const url = await descobrirUrl();
  console.log(`CAF — baixando ${url}`);
  const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const a = XLSX.utils.sheet_to_json(wb.Sheets["GERAL"], { header: 1, defval: "" });
  const extr = String(a.find((row) => /Extra[ií]do em/i.test(String(row[0])))?.[0] || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const comp = extr ? `${extr[3]}-${extr[2]}-${extr[1]}` : null;

  // bloco física: col0=UF,1=IBGE,2=MUNICIPIO,5=Rural,6=Total ; bloco jurídica: col8=UF,9=IBGE,11=CAFs
  const fis = new Map(), jur = new Map();
  for (const row of a) {
    if (String(row[0]).trim() === UF && /^\d{7}$/.test(String(row[1]).trim()))
      fis.set(String(row[1]).trim(), { rural: numf(row[5]), total: numf(row[6]) });
    if (String(row[8]).trim() === UF && /^\d{7}$/.test(String(row[9]).trim()))
      jur.set(String(row[9]).trim(), numf(row[11]));
  }

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS caf_sc (cod_ibge TEXT PRIMARY KEY, competencia DATE, caf_fisica INT, caf_rural INT, caf_juridica INT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((x) => setTimeout(x, 800 * (t + 1))); } } throw new Error("db"); };
  const ent = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((x) => x.cod_ibge));
  const codes = new Set([...fis.keys(), ...jur.keys()]);
  let ok = 0;
  for (const cod of codes) {
    if (!ent.has(cod)) continue;
    const f = fis.get(cod) || { rural: 0, total: 0 };
    await q(`INSERT INTO caf_sc (cod_ibge,competencia,caf_fisica,caf_rural,caf_juridica) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (cod_ibge) DO UPDATE SET competencia=EXCLUDED.competencia,caf_fisica=EXCLUDED.caf_fisica,caf_rural=EXCLUDED.caf_rural,caf_juridica=EXCLUDED.caf_juridica,atualizado=now()`,
      [cod, comp, f.total, f.rural, jur.get(cod) || 0]);
    ok++;
  }
  const x = (await db.query(`SELECT count(*) m, sum(caf_fisica) f, sum(caf_juridica) j FROM caf_sc`)).rows[0];
  console.log(`Concluído: ${ok} municípios · comp ${comp} · ${Number(x.f).toLocaleString("pt-BR")} CAFs físicas (agricultores familiares) · ${Number(x.j).toLocaleString("pt-BR")} jurídicas`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
