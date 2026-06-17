// PNIGP — Seed de Compras Públicas (municípios + estados).
// Métricas inspiradas no PNCP / Compras Gov, correlacionadas ao ICEB do ente.
// Uso: node scripts/seed_compras.mjs

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
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const SCHEMA = `
DROP TABLE IF EXISTS compras_publicas CASCADE;
CREATE TABLE compras_publicas (
  ente_tipo             TEXT NOT NULL,           -- 'M' (município) ou 'E' (estado)
  ente_id               INTEGER NOT NULL,
  ano                   INTEGER NOT NULL,
  valor_contratado_pc   NUMERIC(12,2),           -- R$ por habitante
  pct_pregao_eletronico NUMERIC(5,1),            -- % das compras via pregão eletrônico
  pct_dispensa          NUMERIC(5,1),            -- % por dispensa/inexigibilidade
  economia_pregao       NUMERIC(5,1),            -- % de economia média em pregões
  fornecedores_mil      NUMERIC(6,1),            -- fornecedores ativos por mil hab
  prazo_medio_dias      NUMERIC(6,0),            -- prazo médio de contratação (dias)
  pct_mpe               NUMERIC(5,1),            -- % contratado com micro e pequenas empresas
  transparencia_pncp    NUMERIC(5,1),            -- % de contratos publicados no PNCP
  PRIMARY KEY (ente_tipo, ente_id, ano)
);
`;

function metricas(tipo, id, q, ano) {
  const r = rng(hash(`C:${tipo}:${id}:${ano}`));
  const qa = clamp(q + (ano - 2024) * 0.03, 0, 1); // 2023 levemente pior
  const f = (lo, hi, dir, casas = 1) => {
    const noise = (r() - 0.5) * 0.12;
    const qf = clamp(qa + noise, 0, 1);
    return round(dir === "alta" ? lo + (hi - lo) * qf : hi - (hi - lo) * qf, casas);
  };
  return {
    valor_contratado_pc: f(450, 1300, "alta", 0),
    pct_pregao_eletronico: f(45, 96, "alta"),
    pct_dispensa: f(6, 34, "baixa"),
    economia_pregao: f(7, 26, "alta"),
    fornecedores_mil: f(2, 16, "alta"),
    prazo_medio_dias: f(28, 105, "baixa", 0),
    pct_mpe: f(22, 58, "alta"),
    transparencia_pncp: f(55, 100, "alta"),
  };
}

async function main() {
  const client = new pg.Client({ connectionString: loadEnv(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Conectado. Criando tabela de compras...");
  await client.query(SCHEMA);

  const muns = await client.query(
    `SELECT m.id, ip.iceb FROM municipios m
       JOIN indices_pnigp ip ON ip.municipio_id = m.id AND ip.ano = 2024`,
  );
  const ests = await client.query(
    `SELECT e.id, ip.iceb FROM estados e
       JOIN indices_pnigp_estados ip ON ip.estado_id = e.id AND ip.ano = 2024`,
  );

  const anos = [2023, 2024];
  let n = 0;
  const inserir = async (tipo, rows) => {
    for (const row of rows) {
      const q = Number(row.iceb) / 100;
      for (const ano of anos) {
        const m = metricas(tipo, row.id, q, ano);
        await client.query(
          `INSERT INTO compras_publicas
             (ente_tipo, ente_id, ano, valor_contratado_pc, pct_pregao_eletronico, pct_dispensa,
              economia_pregao, fornecedores_mil, prazo_medio_dias, pct_mpe, transparencia_pncp)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [tipo, row.id, ano, m.valor_contratado_pc, m.pct_pregao_eletronico, m.pct_dispensa,
           m.economia_pregao, m.fornecedores_mil, m.prazo_medio_dias, m.pct_mpe, m.transparencia_pncp],
        );
        n++;
      }
    }
  };

  console.log("Inserindo compras (municípios)...");
  await inserir("M", muns.rows);
  console.log("Inserindo compras (estados)...");
  await inserir("E", ests.rows);

  console.log(`Seed de compras concluído: ${n} registros.`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
