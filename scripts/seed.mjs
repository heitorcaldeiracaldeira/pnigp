// PNIGP — Seed de dados simulados realistas (Painel do Prefeito)
// Gera municípios, indicadores setoriais, série histórica, índices e metas.
// Uso: node scripts/seed.mjs   (lê DATABASE_URL de .env.local ou NEON_DB_URL)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- carrega DATABASE_URL ----------------------------------------------------
function loadEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NEON_DB_URL) return process.env.NEON_DB_URL;
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("DATABASE_URL não encontrada (.env.local ou NEON_DB_URL).");
}

// --- PRNG determinístico (mulberry32) ---------------------------------------
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
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// --- Municípios (q = qualidade latente da gestão, 0..1) ----------------------
const MUNICIPIOS = [
  ["3550308", "São Paulo", "SP", "Sudeste", 11451245, "metropole", "0.72"],
  ["3304557", "Rio de Janeiro", "RJ", "Sudeste", 6211223, "metropole", "0.61"],
  ["3106200", "Belo Horizonte", "MG", "Sudeste", 2315560, "metropole", "0.69"],
  ["2927408", "Salvador", "BA", "Nordeste", 2418005, "metropole", "0.55"],
  ["2304400", "Fortaleza", "CE", "Nordeste", 2428678, "metropole", "0.57"],
  ["1302603", "Manaus", "AM", "Norte", 2063547, "grande", "0.48"],
  ["4106902", "Curitiba", "PR", "Sul", 1773733, "grande", "0.80"],
  ["2611606", "Recife", "PE", "Nordeste", 1488920, "grande", "0.58"],
  ["5208707", "Goiânia", "GO", "Centro-Oeste", 1437366, "grande", "0.66"],
  ["1501402", "Belém", "PA", "Norte", 1303403, "grande", "0.46"],
  ["4314902", "Porto Alegre", "RS", "Sul", 1332570, "grande", "0.70"],
  ["3509502", "Campinas", "SP", "Sudeste", 1138309, "grande", "0.74"],
  ["5002704", "Campo Grande", "MS", "Centro-Oeste", 906092, "grande", "0.63"],
  ["3170206", "Uberlândia", "MG", "Sudeste", 706597, "grande", "0.71"],
  ["3552205", "Sorocaba", "SP", "Sudeste", 687357, "grande", "0.73"],
  ["2910800", "Feira de Santana", "BA", "Nordeste", 619609, "medio", "0.49"],
  ["4209102", "Joinville", "SC", "Sul", 597658, "medio", "0.79"],
  ["3136702", "Juiz de Fora", "MG", "Sudeste", 573285, "medio", "0.64"],
  ["4113700", "Londrina", "PR", "Sul", 580870, "medio", "0.75"],
  ["4305108", "Caxias do Sul", "RS", "Sul", 517451, "medio", "0.77"],
  ["3303302", "Niterói", "RJ", "Sudeste", 515317, "medio", "0.84"],
  ["2611101", "Petrolina", "PE", "Nordeste", 387749, "medio", "0.52"],
  ["3205309", "Vitória", "ES", "Sudeste", 369534, "medio", "0.82"],
  ["2312908", "Sobral", "CE", "Nordeste", 211389, "medio", "0.68"],
  ["3302700", "Maricá", "RJ", "Sudeste", 197277, "pequeno", "0.60"],
  ["2207702", "Parnaíba", "PI", "Nordeste", 156057, "pequeno", "0.44"],
];

// --- Indicadores -------------------------------------------------------------
// lo/hi são os limites realistas; "alta" => valor cresce com q; "baixa" => decresce com q.
const INDICADORES = [
  ["mortalidade_infantil", "Mortalidade infantil", "saude", "óbitos/mil nasc.", "DATASUS", "baixa", 8, 30],
  ["cobertura_aps", "Cobertura da Atenção Primária", "saude", "%", "SISAB/DATASUS", "alta", 45, 98],
  ["leitos_sus_mil", "Leitos SUS por mil hab.", "saude", "leitos/mil", "CNES/DATASUS", "alta", 0.8, 3.5],
  ["ideb_iniciais", "IDEB — anos iniciais", "educacao", "índice", "INEP", "alta", 3.5, 7.2],
  ["taxa_alfabetizacao", "Taxa de alfabetização", "educacao", "%", "IBGE/INEP", "alta", 78, 99],
  ["abandono_fundamental", "Abandono escolar (fundamental)", "educacao", "%", "INEP", "baixa", 0.6, 9],
  ["homicidios_100mil", "Homicídios por 100 mil hab.", "seguranca", "/100 mil", "SINESP", "baixa", 5, 55],
  ["roubos_100mil", "Roubos por 100 mil hab.", "seguranca", "/100 mil", "SINESP", "baixa", 80, 900],
  ["receita_propria_pct", "Receita própria / receita total", "fiscal", "%", "SICONFI/FINBRA", "alta", 8, 46],
  ["investimento_per_capita", "Investimento per capita", "fiscal", "R$/hab.", "SICONFI", "alta", 120, 1250],
  ["gasto_pessoal_rcl", "Gasto com pessoal / RCL", "fiscal", "% RCL", "SICONFI", "baixa", 41, 58],
  ["liquidez_corrente", "Liquidez corrente", "fiscal", "índice", "SICONFI", "alta", 0.6, 3.0],
  ["cobertura_cadunico", "Cobertura do CadÚnico", "social", "%", "CadÚnico/SUAS", "alta", 55, 98],
  ["extrema_pobreza_pct", "População em extrema pobreza", "social", "%", "CadÚnico", "baixa", 1.5, 22],
  ["empregos_formais_mil", "Empregos formais por mil hab.", "economia", "/mil", "RAIS", "alta", 80, 430],
  ["saldo_caged_mil", "Saldo de empregos (CAGED) por mil hab.", "economia", "/mil", "CAGED", "alta", -5, 18],
];

const ANOS = [2020, 2021, 2022, 2023, 2024];

function valorIndicador(codMun, ind, q, ano) {
  const [codigo, , , , , dir, lo, hi] = ind;
  const r = rng(hash(`${codMun}:${codigo}:${ano}`));
  // melhora gradual ~ +3% de q por ano a partir de 2020
  const qa = clamp(q + (ano - 2020) * 0.03, 0, 1);
  const noise = (r() - 0.5) * 0.12; // ±6%
  const f = clamp(qa + noise, 0, 1);
  const base = dir === "alta" ? lo + (hi - lo) * f : hi - (hi - lo) * f;
  const dec = ["ideb_iniciais", "leitos_sus_mil", "liquidez_corrente"].includes(codigo) ? 2 : 1;
  return round(base, codigo === "investimento_per_capita" || codigo === "roubos_100mil" || codigo === "empregos_formais_mil" ? 0 : dec);
}

function indices(codMun, q, ano) {
  const r = rng(hash(`${codMun}:idx:${ano}`));
  const qa = clamp(q + (ano - 2020) * 0.025, 0, 1);
  const sub = (key) => clamp(42 + 54 * qa + (rng(hash(`${codMun}:${key}:${ano}`))() - 0.5) * 14, 0, 100);
  const planej = sub("planej");
  const fiscal = sub("fiscal");
  const gestao = sub("gestao");
  const transp = sub("transp");
  const iceb = (planej + fiscal + gestao + transp) / 4;
  const invp = clamp(38 + 58 * qa + (r() - 0.5) * 12, 0, 100);
  const igp360 = 0.5 * iceb + 0.5 * invp;
  return {
    iceb: round(iceb, 1),
    invp: round(invp, 1),
    igp360: round(igp360, 1),
    cap_planejamento: round(planej, 1),
    cap_fiscal: round(fiscal, 1),
    cap_gestao: round(gestao, 1),
    cap_transparencia: round(transp, 1),
  };
}

function pibPerCapita(codMun, q) {
  const r = rng(hash(`${codMun}:pib`));
  return round(14000 + q * 46000 + (r() - 0.5) * 8000, 2);
}

const PREFEITOS = [
  "Ana Ribeiro", "Carlos Menezes", "Marina Alves", "Roberto Tavares", "Júlia Costa",
  "Fernando Lima", "Patrícia Souza", "Eduardo Barros", "Letícia Moran", "Marcos Pereira",
];

async function main() {
  const client = new pg.Client({
    connectionString: loadEnv(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Conectado. Aplicando schema...");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.query(schema);

  console.log("Inserindo municípios...");
  const munId = {};
  for (let i = 0; i < MUNICIPIOS.length; i++) {
    const [cod, nome, uf, regiao, pop, porte, qStr] = MUNICIPIOS[i];
    const q = parseFloat(qStr);
    const prefeito = PREFEITOS[hash(cod) % PREFEITOS.length];
    const res = await client.query(
      `INSERT INTO municipios (codigo_ibge, nome, uf, regiao, populacao, porte, prefeito, pib_per_capita)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [cod, nome, uf, regiao, pop, porte, prefeito, pibPerCapita(cod, q)],
    );
    munId[cod] = { id: res.rows[0].id, q };
  }

  console.log("Inserindo indicadores...");
  const indId = {};
  for (const ind of INDICADORES) {
    const [codigo, nome, area, unidade, fonte, dir] = ind;
    const res = await client.query(
      `INSERT INTO indicadores (codigo, nome, area, unidade, fonte, direcao_melhor)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [codigo, nome, area, unidade, fonte, dir],
    );
    indId[codigo] = res.rows[0].id;
  }

  console.log("Inserindo valores e índices...");
  let nVal = 0;
  for (const [cod, { id: mid, q }] of Object.entries(munId)) {
    for (const ano of ANOS) {
      for (const ind of INDICADORES) {
        const v = valorIndicador(cod, ind, q, ano);
        await client.query(
          `INSERT INTO indicador_valores (municipio_id, indicador_id, ano, valor) VALUES ($1,$2,$3,$4)`,
          [mid, indId[ind[0]], ano, v],
        );
        nVal++;
      }
      const ix = indices(cod, q, ano);
      await client.query(
        `INSERT INTO indices_pnigp
           (municipio_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao, cap_transparencia)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [mid, ano, ix.iceb, ix.invp, ix.igp360, ix.cap_planejamento, ix.cap_fiscal, ix.cap_gestao, ix.cap_transparencia],
      );
    }
  }

  console.log("Inserindo metas (2025)...");
  const metasCfg = [
    ["ideb_iniciais", 1.05, "Elevar o IDEB dos anos iniciais"],
    ["mortalidade_infantil", 0.9, "Reduzir a mortalidade infantil"],
    ["cobertura_aps", 1.06, "Ampliar a cobertura da Atenção Primária"],
    ["homicidios_100mil", 0.85, "Reduzir homicídios"],
    ["investimento_per_capita", 1.15, "Ampliar o investimento per capita"],
  ];
  for (const [cod, { id: mid }] of Object.entries(munId)) {
    for (const [codigo, fator, desc] of metasCfg) {
      const last = await client.query(
        `SELECT valor FROM indicador_valores WHERE municipio_id=$1 AND indicador_id=$2 AND ano=2024`,
        [mid, indId[codigo]],
      );
      const base = Number(last.rows[0].valor);
      await client.query(
        `INSERT INTO metas (municipio_id, indicador_id, ano_alvo, valor_alvo, descricao) VALUES ($1,$2,2025,$3,$4)`,
        [mid, indId[codigo], round(base * fator, 2), desc],
      );
    }
  }

  const counts = await client.query(
    `SELECT (SELECT count(*) FROM municipios) m, (SELECT count(*) FROM indicadores) i,
            (SELECT count(*) FROM indicador_valores) v, (SELECT count(*) FROM metas) t`,
  );
  console.log("Seed concluído:", counts.rows[0], `(${nVal} valores)`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
