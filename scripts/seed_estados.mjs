// PNIGP — Seed de dados estaduais simulados (Painel do Governador)
// Reutiliza as definições da tabela `indicadores`. Uso: node scripts/seed_estados.mjs

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
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// uf, nome, regiao, populacao, capital, q
const ESTADOS = [
  ["SP", "São Paulo", "Sudeste", 44411238, "São Paulo", 0.74],
  ["MG", "Minas Gerais", "Sudeste", 20539989, "Belo Horizonte", 0.66],
  ["RJ", "Rio de Janeiro", "Sudeste", 16055174, "Rio de Janeiro", 0.62],
  ["BA", "Bahia", "Nordeste", 14141626, "Salvador", 0.52],
  ["PR", "Paraná", "Sul", 11444380, "Curitiba", 0.75],
  ["RS", "Rio Grande do Sul", "Sul", 10882965, "Porto Alegre", 0.7],
  ["PE", "Pernambuco", "Nordeste", 9058931, "Recife", 0.55],
  ["CE", "Ceará", "Nordeste", 8794957, "Fortaleza", 0.6],
  ["PA", "Pará", "Norte", 8121025, "Belém", 0.45],
  ["SC", "Santa Catarina", "Sul", 7610361, "Florianópolis", 0.81],
  ["GO", "Goiás", "Centro-Oeste", 7056495, "Goiânia", 0.66],
  ["MA", "Maranhão", "Nordeste", 6776699, "São Luís", 0.42],
  ["PB", "Paraíba", "Nordeste", 3974687, "João Pessoa", 0.54],
  ["AM", "Amazonas", "Norte", 3941613, "Manaus", 0.46],
  ["ES", "Espírito Santo", "Sudeste", 3833712, "Vitória", 0.73],
  ["MT", "Mato Grosso", "Centro-Oeste", 3658649, "Cuiabá", 0.64],
  ["RN", "Rio Grande do Norte", "Nordeste", 3302729, "Natal", 0.55],
  ["PI", "Piauí", "Nordeste", 3271199, "Teresina", 0.49],
  ["AL", "Alagoas", "Nordeste", 3127683, "Maceió", 0.48],
  ["DF", "Distrito Federal", "Centro-Oeste", 2923369, "Brasília", 0.78],
  ["MS", "Mato Grosso do Sul", "Centro-Oeste", 2833742, "Campo Grande", 0.67],
  ["SE", "Sergipe", "Nordeste", 2210004, "Aracaju", 0.53],
  ["RO", "Rondônia", "Norte", 1581196, "Porto Velho", 0.5],
  ["TO", "Tocantins", "Norte", 1511460, "Palmas", 0.52],
  ["AC", "Acre", "Norte", 830018, "Rio Branco", 0.47],
  ["AP", "Amapá", "Norte", 733759, "Macapá", 0.44],
  ["RR", "Roraima", "Norte", 636707, "Boa Vista", 0.5],
];

const GOVERNADORES = [
  "Antônio Vasconcelos", "Beatriz Furtado", "Cláudio Rezende", "Daniela Prado",
  "Eduardo Sampaio", "Fernanda Bittencourt", "Gustavo Andrade", "Helena Macedo",
  "Igor Cavalcante", "Joana Teixeira", "Lucas Monteiro", "Mariana Queiroz",
];

const ANOS = [2020, 2021, 2022, 2023, 2024];

function valorIndicador(uf, ind, q, ano) {
  const { codigo, direcao_melhor: dir, lo, hi } = ind;
  const r = rng(hash(`E:${uf}:${codigo}:${ano}`));
  const qa = clamp(q + (ano - 2020) * 0.03, 0, 1);
  const noise = (r() - 0.5) * 0.12;
  const f = clamp(qa + noise, 0, 1);
  const base = dir === "alta" ? lo + (hi - lo) * f : hi - (hi - lo) * f;
  const dec = ["ideb_iniciais", "leitos_sus_mil", "liquidez_corrente"].includes(codigo) ? 2 : 1;
  const casas =
    codigo === "investimento_per_capita" || codigo === "roubos_100mil" || codigo === "empregos_formais_mil"
      ? 0
      : dec;
  return round(base, casas);
}

function indices(uf, q, ano) {
  const r = rng(hash(`E:${uf}:idx:${ano}`));
  const qa = clamp(q + (ano - 2020) * 0.025, 0, 1);
  const sub = (key) => clamp(42 + 54 * qa + (rng(hash(`E:${uf}:${key}:${ano}`))() - 0.5) * 14, 0, 100);
  const planej = sub("planej"), fiscal = sub("fiscal"), gestao = sub("gestao"), transp = sub("transp");
  const iceb = (planej + fiscal + gestao + transp) / 4;
  const invp = clamp(38 + 58 * qa + (r() - 0.5) * 12, 0, 100);
  return {
    iceb: round(iceb, 1), invp: round(invp, 1), igp360: round(0.5 * iceb + 0.5 * invp, 1),
    cap_planejamento: round(planej, 1), cap_fiscal: round(fiscal, 1),
    cap_gestao: round(gestao, 1), cap_transparencia: round(transp, 1),
  };
}

const pibPerCapita = (uf, q) =>
  round(16000 + q * 52000 + (rng(hash(`E:${uf}:pib`))() - 0.5) * 9000, 2);

// Limites realistas por indicador (mesma escala do seed municipal)
const LIMITES = {
  mortalidade_infantil: [8, 30], cobertura_aps: [45, 98], leitos_sus_mil: [0.8, 3.5],
  ideb_iniciais: [3.5, 7.2], taxa_alfabetizacao: [78, 99], abandono_fundamental: [0.6, 9],
  homicidios_100mil: [5, 55], roubos_100mil: [80, 900], receita_propria_pct: [8, 46],
  investimento_per_capita: [120, 1250], gasto_pessoal_rcl: [41, 58], liquidez_corrente: [0.6, 3.0],
  cobertura_cadunico: [55, 98], extrema_pobreza_pct: [1.5, 22], empregos_formais_mil: [80, 430],
  saldo_caged_mil: [-5, 18],
};

async function main() {
  const client = new pg.Client({ connectionString: loadEnv(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Conectado. Aplicando schema de estados...");
  await client.query(fs.readFileSync(path.join(__dirname, "schema_estados.sql"), "utf8"));

  const indRows = await client.query(`SELECT id, codigo, direcao_melhor FROM indicadores`);
  const indicadores = indRows.rows.map((r) => ({
    id: r.id, codigo: r.codigo, direcao_melhor: r.direcao_melhor,
    lo: LIMITES[r.codigo][0], hi: LIMITES[r.codigo][1],
  }));

  console.log("Inserindo estados...");
  const estId = {};
  for (const [uf, nome, regiao, pop, capital, q] of ESTADOS) {
    const gov = GOVERNADORES[hash(uf) % GOVERNADORES.length];
    const res = await client.query(
      `INSERT INTO estados (uf, nome, regiao, populacao, capital, governador, pib_per_capita)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [uf, nome, regiao, pop, capital, gov, pibPerCapita(uf, q)],
    );
    estId[uf] = { id: res.rows[0].id, q };
  }

  console.log("Inserindo valores e índices...");
  for (const [uf, , , , , q] of ESTADOS) {
    const { id } = estId[uf];
    for (const ano of ANOS) {
      for (const ind of indicadores) {
        await client.query(
          `INSERT INTO estado_indicador_valores (estado_id, indicador_id, ano, valor) VALUES ($1,$2,$3,$4)`,
          [id, ind.id, ano, valorIndicador(uf, ind, q, ano)],
        );
      }
      const ix = indices(uf, q, ano);
      await client.query(
        `INSERT INTO indices_pnigp_estados
           (estado_id, ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao, cap_transparencia)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, ano, ix.iceb, ix.invp, ix.igp360, ix.cap_planejamento, ix.cap_fiscal, ix.cap_gestao, ix.cap_transparencia],
      );
    }
  }

  console.log("Inserindo metas (2025)...");
  const indByCod = Object.fromEntries(indicadores.map((i) => [i.codigo, i.id]));
  const metasCfg = [
    ["ideb_iniciais", 1.05, "Elevar o IDEB dos anos iniciais"],
    ["mortalidade_infantil", 0.9, "Reduzir a mortalidade infantil"],
    ["homicidios_100mil", 0.85, "Reduzir homicídios"],
    ["receita_propria_pct", 1.1, "Ampliar a arrecadação própria"],
    ["investimento_per_capita", 1.15, "Ampliar o investimento per capita"],
  ];
  for (const [uf] of ESTADOS) {
    const { id } = estId[uf];
    for (const [codigo, fator, desc] of metasCfg) {
      const last = await client.query(
        `SELECT valor FROM estado_indicador_valores WHERE estado_id=$1 AND indicador_id=$2 AND ano=2024`,
        [id, indByCod[codigo]],
      );
      await client.query(
        `INSERT INTO metas_estados (estado_id, indicador_id, ano_alvo, valor_alvo, descricao) VALUES ($1,$2,2025,$3,$4)`,
        [id, indByCod[codigo], round(Number(last.rows[0].valor) * fator, 2), desc],
      );
    }
  }

  const c = await client.query(
    `SELECT (SELECT count(*) FROM estados) e, (SELECT count(*) FROM estado_indicador_valores) v,
            (SELECT count(*) FROM indices_pnigp_estados) x, (SELECT count(*) FROM metas_estados) t`,
  );
  console.log("Seed de estados concluído:", c.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
