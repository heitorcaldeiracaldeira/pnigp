// PNIGP — Seed de Finanças Públicas (receitas e despesas) — municípios + estados.
// Inspirado no SICONFI/FINBRA. Valores em R$, correlacionados ao ICEB e à população.
// Uso: node scripts/seed_financas.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NEON_DB_URL) return process.env.NEON_DB_URL;
  const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  return env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;

const SCHEMA = `
DROP TABLE IF EXISTS financas CASCADE;
CREATE TABLE financas (
  ente_tipo          TEXT NOT NULL,        -- 'M' ou 'E'
  ente_id            INTEGER NOT NULL,
  ano                INTEGER NOT NULL,
  receita_total      NUMERIC(16,2),
  rec_tributaria     NUMERIC(16,2),        -- receita própria (tributos)
  rec_transferencias NUMERIC(16,2),
  rec_outras         NUMERIC(16,2),
  despesa_total      NUMERIC(16,2),
  desp_pessoal       NUMERIC(16,2),
  desp_custeio       NUMERIC(16,2),
  desp_investimento  NUMERIC(16,2),
  desp_divida        NUMERIC(16,2),
  func_saude         NUMERIC(16,2),
  func_educacao      NUMERIC(16,2),
  func_seguranca     NUMERIC(16,2),
  func_assistencia   NUMERIC(16,2),
  func_infraestrutura NUMERIC(16,2),
  func_administracao NUMERIC(16,2),
  func_outras        NUMERIC(16,2),
  PRIMARY KEY (ente_tipo, ente_id, ano)
);
`;

function gerar(tipo, id, pop, q, ano) {
  const r = rng(hash(`F:${tipo}:${id}:${ano}`));
  const qa = clamp(q + (ano - 2024) * 0.02, 0, 1);
  const noise = (k) => (rng(hash(`F:${tipo}:${id}:${ano}:${k}`))() - 0.5);

  // Receita total (per capita varia por porte/qualidade)
  const base = tipo === "E" ? 3500 : 2800;
  const rpc = base + qa * 2600 + noise("rpc") * 900;
  const receita_total = pop * rpc;

  // Origem da receita
  const tribShare = clamp(0.1 + 0.32 * qa + noise("trib") * 0.05, 0.06, 0.5);
  const outrasShare = clamp(0.06 + noise("ro") * 0.02, 0.03, 0.1);
  const transfShare = clamp(1 - tribShare - outrasShare, 0.2, 0.9);
  const rec_tributaria = receita_total * tribShare;
  const rec_outras = receita_total * outrasShare;
  const rec_transferencias = receita_total * transfShare;

  // Despesa total (melhor gestão → mais perto do equilíbrio/superávit)
  const fator = clamp(1.05 - 0.12 * qa + noise("df") * 0.03, 0.9, 1.12);
  const despesa_total = receita_total * fator;

  // Despesa por categoria econômica
  const pessoalShare = clamp(0.52 - 0.08 * qa + noise("pes") * 0.03, 0.38, 0.6);
  const investShare = clamp(0.05 + 0.14 * qa + noise("inv") * 0.02, 0.03, 0.22);
  const dividaShare = clamp(0.04 + noise("div") * 0.015, 0.01, 0.08);
  const custeioShare = clamp(1 - pessoalShare - investShare - dividaShare, 0.15, 0.55);
  const desp_pessoal = despesa_total * pessoalShare;
  const desp_investimento = despesa_total * investShare;
  const desp_divida = despesa_total * dividaShare;
  const desp_custeio = despesa_total * custeioShare;

  // Despesa por função (% da despesa total) — mínimos constitucionais saúde/educação
  const fSaude = clamp(0.15 + 0.05 * qa + noise("fs") * 0.02, 0.15, 0.24);
  const fEduc = clamp(0.25 + 0.04 * qa + noise("fe") * 0.02, 0.25, 0.32);
  const fSeg = clamp(0.03 + 0.05 * qa + noise("fg") * 0.02, 0.02, 0.1);
  const fAssist = clamp(0.05 + noise("fa") * 0.02, 0.03, 0.1);
  const fInfra = clamp(0.05 + 0.07 * qa + noise("fi") * 0.02, 0.03, 0.15);
  const fAdmin = clamp(0.1 - 0.03 * qa + noise("fad") * 0.02, 0.05, 0.14);
  const fOutras = clamp(1 - (fSaude + fEduc + fSeg + fAssist + fInfra + fAdmin), 0.02, 0.3);

  return {
    receita_total: r2(receita_total),
    rec_tributaria: r2(rec_tributaria),
    rec_transferencias: r2(rec_transferencias),
    rec_outras: r2(rec_outras),
    despesa_total: r2(despesa_total),
    desp_pessoal: r2(desp_pessoal),
    desp_custeio: r2(desp_custeio),
    desp_investimento: r2(desp_investimento),
    desp_divida: r2(desp_divida),
    func_saude: r2(despesa_total * fSaude),
    func_educacao: r2(despesa_total * fEduc),
    func_seguranca: r2(despesa_total * fSeg),
    func_assistencia: r2(despesa_total * fAssist),
    func_infraestrutura: r2(despesa_total * fInfra),
    func_administracao: r2(despesa_total * fAdmin),
    func_outras: r2(despesa_total * fOutras),
  };
}

async function main() {
  const client = new pg.Client({ connectionString: loadEnv(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Conectado. Criando tabela de finanças...");
  await client.query(SCHEMA);

  const muns = await client.query(
    `SELECT m.id, m.populacao, ip.iceb FROM municipios m
       JOIN indices_pnigp ip ON ip.municipio_id = m.id AND ip.ano = 2024`,
  );
  const ests = await client.query(
    `SELECT e.id, e.populacao, ip.iceb FROM estados e
       JOIN indices_pnigp_estados ip ON ip.estado_id = e.id AND ip.ano = 2024`,
  );

  const cols = [
    "receita_total", "rec_tributaria", "rec_transferencias", "rec_outras",
    "despesa_total", "desp_pessoal", "desp_custeio", "desp_investimento", "desp_divida",
    "func_saude", "func_educacao", "func_seguranca", "func_assistencia",
    "func_infraestrutura", "func_administracao", "func_outras",
  ];
  const placeholders = cols.map((_, i) => `$${i + 4}`).join(",");

  let n = 0;
  const inserir = async (tipo, rows) => {
    for (const row of rows) {
      const q = Number(row.iceb) / 100;
      for (const ano of [2023, 2024]) {
        const f = gerar(tipo, row.id, Number(row.populacao), q, ano);
        await client.query(
          `INSERT INTO financas (ente_tipo, ente_id, ano, ${cols.join(",")})
           VALUES ($1,$2,$3,${placeholders})`,
          [tipo, row.id, ano, ...cols.map((c) => f[c])],
        );
        n++;
      }
    }
  };

  console.log("Inserindo finanças (municípios)...");
  await inserir("M", muns.rows);
  console.log("Inserindo finanças (estados)...");
  await inserir("E", ests.rows);

  console.log(`Seed de finanças concluído: ${n} registros.`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
