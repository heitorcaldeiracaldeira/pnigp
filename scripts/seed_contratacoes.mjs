// PNIGP — Seed de Contratações Públicas (estilo PNCP) — municípios + estados.
// Gera licitações/contratos individuais por ente. Uso: node scripts/seed_contratacoes.mjs

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
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

const SCHEMA = `
DROP TABLE IF EXISTS contratacoes CASCADE;
CREATE TABLE contratacoes (
  id              SERIAL PRIMARY KEY,
  ente_tipo       TEXT NOT NULL,
  ente_id         INTEGER NOT NULL,
  numero          TEXT NOT NULL,
  objeto          TEXT NOT NULL,
  orgao           TEXT NOT NULL,
  modalidade      TEXT NOT NULL,
  valor_estimado  NUMERIC(14,2) NOT NULL,
  valor_contratado NUMERIC(14,2) NOT NULL,
  economia_pct    NUMERIC(5,1) NOT NULL,
  fornecedor      TEXT NOT NULL,
  data            DATE NOT NULL,
  situacao        TEXT NOT NULL
);
CREATE INDEX idx_contratacoes_ente ON contratacoes (ente_tipo, ente_id);
`;

// objeto, órgão, faixa-base (R$)
const OBJETOS = [
  ["Aquisição de medicamentos", "Sec. de Saúde", 200000, 2500000],
  ["Material médico-hospitalar", "Sec. de Saúde", 150000, 1800000],
  ["Aquisição de ambulâncias", "Sec. de Saúde", 300000, 1200000],
  ["Merenda escolar", "Sec. de Educação", 250000, 3000000],
  ["Material escolar e didático", "Sec. de Educação", 100000, 1200000],
  ["Reforma de unidade escolar", "Sec. de Educação", 400000, 4000000],
  ["Transporte escolar", "Sec. de Educação", 300000, 2500000],
  ["Obras de pavimentação", "Sec. de Infraestrutura e Obras", 800000, 9000000],
  ["Iluminação pública (LED)", "Sec. de Infraestrutura e Obras", 500000, 6000000],
  ["Coleta de resíduos sólidos", "Sec. de Infraestrutura e Obras", 600000, 7000000],
  ["Material de construção", "Sec. de Infraestrutura e Obras", 120000, 1500000],
  ["Combustível para a frota", "Sec. de Fazenda e Administração", 300000, 4000000],
  ["Equipamentos de informática", "Sec. de Fazenda e Administração", 150000, 1500000],
  ["Software de gestão pública", "Sec. de Fazenda e Administração", 200000, 2500000],
  ["Material de escritório", "Sec. de Fazenda e Administração", 50000, 600000],
  ["Serviços de vigilância", "Sec. de Segurança e Ordem Pública", 400000, 3500000],
  ["Videomonitoramento urbano", "Sec. de Segurança e Ordem Pública", 300000, 4000000],
  ["Cestas básicas", "Sec. de Assistência Social", 150000, 1800000],
  ["Locação de veículos", "Gabinete do Chefe do Executivo", 200000, 2000000],
  ["Serviços de publicidade", "Gabinete do Chefe do Executivo", 120000, 1500000],
];

// A modalidade depende do valor (regra geral da Lei de Licitações)
function modalidadePorValor(v, r) {
  const x = r();
  if (v >= 2_000_000) return x < 0.7 ? ["Concorrência", "CC"] : ["Pregão Eletrônico", "PE"];
  if (v >= 200_000) return x < 0.8 ? ["Pregão Eletrônico", "PE"] : x < 0.92 ? ["Concorrência", "CC"] : ["Pregão Presencial", "PP"];
  return x < 0.6 ? ["Dispensa", "DL"] : x < 0.85 ? ["Pregão Eletrônico", "PE"] : ["Inexigibilidade", "IN"];
}

const FORNECEDORES = [
  "Alfa Comércio Ltda", "Beta Serviços S.A.", "Construtora Gama Ltda", "Delta Distribuidora",
  "Épsilon Tecnologia", "Zeta Engenharia", "Theta Saúde Ltda", "Ômega Soluções",
  "Sigma Comercial", "Lambda Construções", "Pharma Brasil Ltda", "Nova Frota Locações",
  "Mais Limpeza Serviços", "TechGov Sistemas", "Verde Ambiental S.A.",
];
const SITUACOES = [["Homologado", 0.86], ["Em andamento", 0.08], ["Deserto", 0.03], ["Cancelado", 0.03]];
function escolherSituacao(r) {
  let x = r();
  for (const s of SITUACOES) { if ((x -= s[1]) <= 0) return s[0]; }
  return "Homologado";
}

async function main() {
  const client = new pg.Client({ connectionString: loadEnv(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Conectado. Criando tabela de contratações...");
  await client.query(SCHEMA);

  const muns = await client.query(`SELECT id, populacao FROM municipios`);
  const ests = await client.query(`SELECT id, populacao FROM estados`);

  let n = 0;
  const inserir = async (tipo, rows) => {
    for (const row of rows) {
      const pop = Number(row.populacao);
      const fator = clamp(pop / 150000, 0.4, 8);
      const r = rng(hash(`K:${tipo}:${row.id}`));
      const qtd = 16 + Math.floor(r() * 8); // 16–23 contratos
      for (let i = 0; i < qtd; i++) {
        const ri = rng(hash(`K:${tipo}:${row.id}:${i}`));
        const [objeto, orgao, lo, hi] = OBJETOS[Math.floor(ri() * OBJETOS.length)];
        const estimado = r2((lo + (hi - lo) * ri()) * fator * (0.6 + ri() * 0.8));
        const [modalidade, prefixo] = modalidadePorValor(estimado, ri);
        const competitivo = modalidade === "Pregão Eletrônico" || modalidade === "Concorrência" || modalidade === "Pregão Presencial";
        const economia = competitivo ? r2(4 + ri() * 24) : r2(ri() * 3);
        const contratado = r2(estimado * (1 - economia / 100));
        const fornecedor = FORNECEDORES[Math.floor(ri() * FORNECEDORES.length)];
        const mes = String(1 + Math.floor(ri() * 12)).padStart(2, "0");
        const dia = String(1 + Math.floor(ri() * 28)).padStart(2, "0");
        const situacao = escolherSituacao(ri);
        const numero = `${prefixo} ${String(i + 1).padStart(3, "0")}/2024`;
        await client.query(
          `INSERT INTO contratacoes (ente_tipo, ente_id, numero, objeto, orgao, modalidade, valor_estimado, valor_contratado, economia_pct, fornecedor, data, situacao)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [tipo, row.id, numero, objeto, orgao, modalidade, estimado, contratado, economia, fornecedor, `2024-${mes}-${dia}`, situacao],
        );
        n++;
      }
    }
  };

  console.log("Inserindo contratações (municípios)...");
  await inserir("M", muns.rows);
  console.log("Inserindo contratações (estados)...");
  await inserir("E", ests.rows);

  console.log(`Seed de contratações concluído: ${n} registros.`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
