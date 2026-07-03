// ETL — Execução das emendas parlamentares ESTADUAIS por município (SEF-SC), extraída do painel Power BI
// (endpoint público querydata; tabela ExecucaoEmendasParlamentares). Parser do DSR (R/Ø + ValueDicts).
// Entrada: pbi_exec.txt (resposta bruta do querydata: município credor + parlamentar + val pago).
// node scripts/ingest_emendas_estaduais_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SRC = process.env.SRC || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/pbi_exec.txt";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// decodifica o DSR do Power BI: linhas com C (valores), R (bitmask repete anterior), Ø (bitmask nulo), + ValueDicts por coluna (DN)
function parseDSR(raw) {
  let o = JSON.parse(raw); if (typeof o === "string") o = JSON.parse(o); // arquivo pode ser string-encoded
  const data = o.results[0].result.data;
  const ds = data.dsr.DS[0];
  const dicts = ds.ValueDicts || {};
  const dm = ds.PH[0].DM0;
  const schema = dm[0].S; // [{N, T, DN?}]
  const nCol = schema.length;
  const rows = []; let prev = new Array(nCol).fill(null);
  for (const r of dm) {
    const R = r.R || 0, O = r["Ø"] || 0; const C = r.C || [];
    const full = new Array(nCol); let ci = 0;
    for (let i = 0; i < nCol; i++) {
      if (O & (1 << i)) full[i] = null;
      else if (R & (1 << i)) full[i] = prev[i];
      else { let v = C[ci++]; const dn = schema[i].DN; if (dn && typeof v === "number" && dicts[dn]) v = dicts[dn][v]; full[i] = v; }
    }
    prev = full; rows.push(full);
  }
  return { schema, rows };
}

async function main() {
  const { schema, rows } = parseDSR(fs.readFileSync(SRC, "utf8"));
  console.log("colunas:", schema.map((s) => s.N).join(", "), "· linhas:", rows.length);
  const iMun = 0, iPago = schema.length - 1; // [Mun, Pago]
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_estaduais_exec_sc (cod_ibge TEXT PRIMARY KEY, valor_pago NUMERIC, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const munToCod = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  const agg = new Map(); // cod -> pago
  let semMun = 0, foraSC = 0;
  for (const r of rows) {
    const mun = r[iMun]; const pago = Number(r[iPago]) || 0;
    if (mun == null) { semMun++; continue; } // linha total (Ø)
    const cod = munToCod.get(norm(mun)); if (!cod) { foraSC++; continue; } // credor fora de SC (fornecedor em outra UF)
    agg.set(cod, (agg.get(cod) || 0) + pago);
  }
  await q(`TRUNCATE emendas_estaduais_exec_sc`);
  let n = 0, tot = 0;
  for (const [cod, v] of agg) { if (v <= 0) continue; await q(`INSERT INTO emendas_estaduais_exec_sc (cod_ibge,valor_pago) VALUES ($1,$2) ON CONFLICT (cod_ibge) DO UPDATE SET valor_pago=EXCLUDED.valor_pago,atualizado=now()`, [cod, v]); n++; tot += v; }
  console.log(`Emendas estaduais (execução): ${n} municípios de SC · R$ ${Math.round(tot).toLocaleString("pt-BR")} pago · credor fora-SC: ${foraSC} linhas · total(Ø): ${semMun}`);
  const munis = (await db.query(`SELECT count(*) m, round(sum(valor_pago)) v FROM emendas_estaduais_exec_sc`)).rows[0];
  console.log(`  total no banco: ${munis.m} municípios · R$ ${Number(munis.v).toLocaleString("pt-BR")}`);
  const top = (await db.query(`SELECT e.nome, round(sum(x.valor_pago)) v FROM emendas_estaduais_exec_sc x JOIN entes_sc e ON e.cod_ibge=x.cod_ibge GROUP BY e.nome ORDER BY v DESC LIMIT 5`)).rows;
  top.forEach((r) => console.log(`   ${r.nome}: R$ ${Number(r.v).toLocaleString("pt-BR")}`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
