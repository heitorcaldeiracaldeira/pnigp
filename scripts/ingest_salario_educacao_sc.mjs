// Salário-Educação (cota municipal) + total de transferências do FNDE, por município/ano. Fonte: SICONFI DCA Anexo I-C.
// Contas: 1.7.1.4.50.0.0 = Salário-Educação · 1.7.1.4.00.0.0 = total transferências do FNDE (corrente). State-agnostic.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC"; const UFC = { SC: "42", SP: "35" }[UF] || "42";
const ANOS = (process.env.ANOS || "2021,2022,2023").split(",");
const H = { "User-Agent": "Mozilla/5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const munis = (await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge")).rows.map((r) => r.cod_ibge);
await db.query(`CREATE TABLE IF NOT EXISTS salario_educacao_sc (cod_ibge TEXT, ano INTEGER, salario_educacao NUMERIC, fnde_total NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
await db.query("DELETE FROM salario_educacao_sc WHERE cod_ibge LIKE $1", [UFC + "%"]);
const val = (x) => +x.valor || +x.vl_saldo || +x.valor_conta || 0;
const getDca = async (cod, ano) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(`https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca?id_ente=${cod}&an_exercicio=${ano}&no_anexo=DCA-Anexo%20I-C`, { headers: H }); if (r.status === 429 || r.status >= 500) throw 0; const j = await r.json(); return j.items || []; } catch { await sleep(1500 * (t + 1)); } } return null; };
let n = 0, falhas = 0;
for (const cod of munis) {
  for (const ano of ANOS) {
    const its = await getDca(cod, ano); await sleep(120);
    if (its === null) { falhas++; continue; }
    const se = its.find((x) => String(x.cod_conta || "").includes("1.7.1.4.50"));
    const fn = its.find((x) => String(x.cod_conta || "").includes("1.7.1.4.00") && !String(x.cod_conta || "").includes("2.4"));
    if (!se && !fn) continue;
    await db.query("INSERT INTO salario_educacao_sc (cod_ibge,ano,salario_educacao,fnde_total) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge,ano) DO UPDATE SET salario_educacao=EXCLUDED.salario_educacao,fnde_total=EXCLUDED.fnde_total,atualizado=now()", [cod, +ano, se ? val(se) : null, fn ? val(fn) : null]);
    n++;
  }
  if (munis.indexOf(cod) % 50 === 0) console.log(`  ...${munis.indexOf(cod)}/${munis.length} munis`);
}
const c = (await db.query("SELECT count(*) linhas, count(DISTINCT cod_ibge) m, round(sum(salario_educacao)/1e6,1) v FROM salario_educacao_sc")).rows[0];
console.log(`✔ salario_educacao_sc: ${c.linhas} linhas · ${c.m} municípios · R$${c.v}mi Salário-Educação (${falhas} falhas de API)`);
await db.end();
