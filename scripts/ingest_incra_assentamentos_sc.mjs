// ETL — INCRA Assentamentos da Reforma Agrária por município. Fonte: INCRA/MDA (SIPRA), CSV "assentamentosgeral".
// Casa por NOME (sem IBGE); UF vem do PREFIXO do código do projeto (SC0001000 → SC). Série por ano de criação.
// node scripts/ingest_incra_assentamentos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CSVURL = "https://www.gov.br/incra/pt-br/assuntos/reforma-agraria/assentamentosgeral.csv/@@download/file";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const nBR = (s) => { const x = Number(String(s || "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const cp = path.join(dir, "incra.csv");
  if (!fs.existsSync(cp) || fs.statSync(cp).size < 1e5) { console.log("baixando INCRA…"); execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", cp, CSVURL], { stdio: "ignore" }); }
  const lines = fs.readFileSync(cp, "latin1").split(/\r?\n/);

  const M = new Map(); let semMatch = 0;
  for (const line of lines) {
    const c = line.split(";");
    if (!new RegExp(`^${UF}\\d{6,}`).test((c[0] || "").trim())) continue; // linha de projeto da UF
    const cod = byName.get(norm(c[2])); if (!cod) { semMatch++; continue; }
    const area = nBR(c[3]), fam = parseInt(c[4], 10) || 0;
    const ano = +(String(c[9] || "").match(/(19|20)\d{2}/)?.[0] || 0);
    if (!M.has(cod)) M.set(cod, { n: 0, fam: 0, area: 0, anos: new Map() });
    const m = M.get(cod); m.n++; m.fam += fam; m.area += area;
    if (ano >= 1970 && ano <= 2026) m.anos.set(ano, (m.anos.get(ano) || 0) + 1);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS incra_assentamentos_sc (cod_ibge TEXT PRIMARY KEY, n_assentamentos INTEGER, familias INTEGER, area_ha NUMERIC, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, m] of M) {
    // série CUMULATIVA de assentamentos por ano de criação
    const anos = [...m.anos.entries()].sort((a, b) => a[0] - b[0]); let acc = 0;
    const serie = anos.map(([ano, n]) => { acc += n; return { ano, valor: acc }; });
    await db.query(`INSERT INTO incra_assentamentos_sc (cod_ibge,n_assentamentos,familias,area_ha,serie,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET n_assentamentos=EXCLUDED.n_assentamentos,familias=EXCLUDED.familias,area_ha=EXCLUDED.area_ha,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, m.n, m.fam, Math.round(m.area), JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_assentamentos) n, sum(familias) f, round(sum(area_ha)) ha FROM incra_assentamentos_sc`)).rows[0];
  console.log(`✔ incra_assentamentos_sc: ${chk.m} municípios · ${chk.n} assentamentos · ${Number(chk.f).toLocaleString("pt-BR")} famílias · ${Number(chk.ha).toLocaleString("pt-BR")} ha${semMatch ? ` (${semMatch} sem match)` : ""}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
