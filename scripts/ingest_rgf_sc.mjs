// ETL — RGF (Relatório de Gestão Fiscal, SICONFI): número OFICIAL de pessoal por Poder (Executivo)
// e Dívida Consolidada Líquida. Anexo 01 = DTP % sobre RCL Ajustada (limites LRF); Anexo 02 = DCL %.
// É o indicador que o TCE usa. Idempotente/resumível. node scripts/ingest_rgf_sc.mjs [cod_ibge]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const B = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf";
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

async function getAnexo(ano, esfera, id, anexo, per, periodo) {
  const url = `${B}?an_exercicio=${ano}&in_periodicidade=${per}&nr_periodo=${periodo}&co_tipo_demonstrativo=RGF&no_anexo=${encodeURIComponent(anexo)}&co_poder=E&co_esfera=${esfera}&id_ente=${id}`;
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(45000) }); if (!r.ok) throw 0; return (await r.json()).items || []; }
    catch { await sleep(700 * (t + 1)); }
  }
  return null;
}
// tenta quadrimestral (Q/3) e cai p/ semestral (S/2) — municípios <50k podem optar pelo semestral
async function anexoComFallback(ano, esfera, id, anexo) {
  let it = await getAnexo(ano, esfera, id, anexo, "Q", 3);
  if (it && it.length) return it;
  it = await getAnexo(ano, esfera, id, anexo, "S", 2);
  return it || [];
}
const find = (rows, reConta, coluna) => { const r = rows.find((x) => reConta.test(x.conta || "") && x.coluna === coluna); return r ? num(r.valor) : null; };

async function extrair(ano, esfera, id) {
  const [a1, a2] = await Promise.all([anexoComFallback(ano, esfera, id, "RGF-Anexo 01"), anexoComFallback(ano, esfera, id, "RGF-Anexo 02")]);
  if ((!a1 || !a1.length) && (!a2 || !a2.length)) return null;
  const reDTP = /despesa total com pessoal - dtp/i, reLim = /limite m[áa]ximo/i, reRclAj = /receita corrente l[íi]quida ajustada/i;
  const reDCL = /d[íi]vida consolidada l[íi]quida \(dcl\)/i, rePctDcl = /% da dcl sobre a rcl/i;
  // a coluna de fechamento muda entre Q (3º Quadrimestre) e S (2º Semestre)
  const colDcl = [...new Set((a2 || []).map((x) => x.coluna))].find((c) => /3º Quadrimestre|2º Semestre/i.test(c)) || "Até o 3º Quadrimestre";
  return {
    pessoal_pct: find(a1, reDTP, "% sobre a RCL Ajustada"),
    pessoal_valor: find(a1, reDTP, "Valor"),
    limite_pct: find(a1, reLim, "% sobre a RCL Ajustada"),
    rcl_ajustada: find(a1, reRclAj, "Valor"),
    dcl_valor: find(a2, reDCL, colDcl),
    dcl_pct: find(a2, rePctDcl, colDcl),
  };
}

async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS rgf_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL,
    pessoal_pct NUMERIC, pessoal_valor NUMERIC, limite_pct NUMERIC, rcl_ajustada NUMERIC,
    dcl_valor NUMERIC, dcl_pct NUMERIC, PRIMARY KEY (cod_ibge, ano) );`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(900 * (t + 1)); } } throw new Error("db"); };

  const arg = process.argv[2];
  if (arg) {
    const e = (await db.query(`SELECT cod_ibge,nome,tipo FROM entes_sc WHERE cod_ibge=$1`, [arg])).rows[0];
    for (const ano of ANOS) console.log(`${e.nome} ${ano}:`, JSON.stringify(await extrair(ano, e.tipo === "E" ? "E" : "M", e.cod_ibge)));
    await db.end(); return;
  }
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY (tipo='E') DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM rgf_sc`)).rows.map((r) => r.k));
  let n = 0;
  await pool(entes, 4, async (e) => {
    const esf = e.tipo === "E" ? "E" : "M";
    for (const ano of ANOS) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const d = await extrair(ano, esf, e.cod_ibge);
      if (!d || (d.pessoal_pct == null && d.dcl_valor == null)) continue;
      await q(`INSERT INTO rgf_sc (cod_ibge,ano,pessoal_pct,pessoal_valor,limite_pct,rcl_ajustada,dcl_valor,dcl_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET pessoal_pct=EXCLUDED.pessoal_pct,pessoal_valor=EXCLUDED.pessoal_valor,limite_pct=EXCLUDED.limite_pct,rcl_ajustada=EXCLUDED.rcl_ajustada,dcl_valor=EXCLUDED.dcl_valor,dcl_pct=EXCLUDED.dcl_pct`,
        [e.cod_ibge, ano, d.pessoal_pct, d.pessoal_valor, d.limite_pct, d.rcl_ajustada, d.dcl_valor, d.dcl_pct]);
      n++;
    }
  });
  const c = await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) entes, count(pessoal_pct) c_pess, count(dcl_pct) c_dcl FROM rgf_sc`);
  console.log(`Concluído: ${n} novas | total ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
