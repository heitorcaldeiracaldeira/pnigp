// ETL — RREO constitucional (SICONFI): Educação MDE (Anexo 14, % aplicado real), RCL (Anexo 03,
// TOTAL últimos 12 meses → base legal do limite de pessoal da LRF) e tentativa de Saúde ASPS (Anexo 12).
// Base LEGAL correta (não proxy). Idempotente/resumível. node scripts/ingest_rreo_constitucional_sc.mjs [cod_ibge]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

async function getAnexo(ano, esfera, id, anexo) {
  const url = `${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=${encodeURIComponent(anexo)}&co_esfera=${esfera}&id_ente=${id}`;
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(45000) }); if (!r.ok) throw 0; return (await r.json()).items || []; }
    catch { await sleep(700 * (t + 1)); }
  }
  return null;
}
const find = (rows, reConta, coluna) => { const r = rows.find((x) => reConta.test(x.conta || "") && x.coluna === coluna); return r ? num(r.valor) : null; };

async function extrair(ano, esfera, id) {
  const [a14, a03, a12] = await Promise.all([
    getAnexo(ano, esfera, id, "RREO-Anexo 14"),
    getAnexo(ano, esfera, id, "RREO-Anexo 03"),
    getAnexo(ano, esfera, id, "RREO-Anexo 12"),
  ]);
  if (a14 === null && a03 === null) return null; // falha de rede total
  const reEduc = /m[ií]nimo anual de <18/i, reFundeb = /m[ií]nimo anual de 70% do fundeb/i, reRcl = /receita corrente l[ií]quida \(iii\)/i;
  const reSaude = /m[ií]nimo anual de.*(a..es e servi|asps|sa.de)/i;
  return {
    educacao_pct: find(a14 || [], reEduc, "% Aplicado Até o Bimestre"),
    educacao_min: find(a14 || [], reEduc, "% Mínimo a Aplicar no Exercício"),
    educacao_valor: find(a14 || [], reEduc, "Valor Apurado Até o Bimestre"),
    fundeb_pct: find(a14 || [], reFundeb, "% Aplicado Até o Bimestre"),
    rcl: find(a03 || [], reRcl, "TOTAL (ÚLTIMOS 12 MESES)"),
    saude_pct: find(a12 || [], reSaude, "% Aplicado Até o Bimestre"),
    saude_valor: find(a12 || [], reSaude, "Valor Apurado Até o Bimestre"),
    _a12n: (a12 || []).length,
  };
}

async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS rreo_const_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL,
    educacao_pct NUMERIC, educacao_min NUMERIC, educacao_valor NUMERIC, fundeb_pct NUMERIC,
    rcl NUMERIC, saude_pct NUMERIC, saude_valor NUMERIC,
    PRIMARY KEY (cod_ibge, ano) );`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };

  const arg = process.argv[2];
  if (arg) { // modo validação: 1 ente, imprime
    const e = (await db.query(`SELECT cod_ibge,nome,tipo FROM entes_sc WHERE cod_ibge=$1`, [arg])).rows[0];
    const esf = e.tipo === "E" ? "E" : "M";
    for (const ano of ANOS) { const d = await extrair(ano, esf, e.cod_ibge); console.log(`${e.nome} ${ano}:`, JSON.stringify(d)); }
    await db.end(); return;
  }

  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY (tipo='E') DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM rreo_const_sc`)).rows.map((r) => r.k));
  let comDados = 0, comSaude = 0;
  await pool(entes, 4, async (e) => {
    const esf = e.tipo === "E" ? "E" : "M";
    for (const ano of ANOS) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const d = await extrair(ano, esf, e.cod_ibge);
      if (!d) continue;
      if (d.educacao_pct == null && d.rcl == null && d.saude_pct == null) continue; // ano sem dado
      await q(`INSERT INTO rreo_const_sc (cod_ibge,ano,educacao_pct,educacao_min,educacao_valor,fundeb_pct,rcl,saude_pct,saude_valor)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET educacao_pct=EXCLUDED.educacao_pct,educacao_min=EXCLUDED.educacao_min,educacao_valor=EXCLUDED.educacao_valor,fundeb_pct=EXCLUDED.fundeb_pct,rcl=EXCLUDED.rcl,saude_pct=EXCLUDED.saude_pct,saude_valor=EXCLUDED.saude_valor`,
        [e.cod_ibge, ano, d.educacao_pct, d.educacao_min, d.educacao_valor, d.fundeb_pct, d.rcl, d.saude_pct, d.saude_valor]);
      comDados++;
      if (d.saude_pct != null) comSaude++;
    }
  });
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) entes, count(educacao_pct) c_educ, count(rcl) c_rcl, count(saude_pct) c_saude FROM rreo_const_sc`);
  console.log(`Concluído: ${comDados} novas linhas | total ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
