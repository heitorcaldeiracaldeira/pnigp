// A/B do CATMAT: casar sobre a descrição CRUA da API × sobre a descrição ENRIQUECIDA dos documentos.
//
// POR QUE ESTE SCRIPT EXISTE: o motor (match_item_catmat.mjs) casa sobre itens_sc.descricao e nunca viu
// app.item_enriquecimento.descricao_documento. A lei do projeto proíbe mexer no motor sem A/B contra o
// operating point atual — este é o A/B. NÃO escreve em item_catmat_map, não toca no motor. Só lê e mede.
//
// GABARITO — por que NAO e o dado do municipio: `itens_sc.catmat` traz '1'/'2' (o TIPO de catalogo), nao o
// codigo; no `raw` o proprio PNCP publica '1'/'2' em catalogoCodigoItem. Sobram 121 itens com codigo de
// verdade em 2,3M — pequeno demais. Entao o gabarito e o painel_gold (Painel de Precos), onde o GOVERNO
// declara o codigo_pdm.
//
// CIRCULARIDADE CONTORNADA: 99,6% dos painel_gold.descricao_item contem literalmente o nome do PDM — casar
// sobre eles acertaria por tautologia. Por isso o teste usa SO `descricao_detalhada`, e SO as linhas em que
// o detalhe NAO contem o nome do PDM (6.446). Nenhum braco enxerga a resposta.
//
// O QUE ISTO MEDE: se dar MAIS TEXTO DE ESPECIFICACAO ao trigrama ajuda ou atrapalha. O braco "truncado"
// reproduz o corte de ~148 chars que a API do PNCP aplica; o braco "inteiro" e o texto completo.
// ⚠️ LIMITE DECLARADO: o detalhe do painel_gold tem 165 chars em media, contra ate 2.500 da nossa descricao
// enriquecida. Isto mede a DIRECAO do efeito, nao a magnitude no nosso caso.
// node scripts/ab_catmat_enriquecido.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = (process.env.DATABASE_URL ||
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1]).trim();
const LO = Number(process.env.LO_FALLBACK || 0.55);
const MIN_SIM = Number(process.env.MIN_SIM || 0.5);

const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });
db.on("error", () => {});
const q = async (s, p) => (await db.query(s, p)).rows;
const canon = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// gabarito limpo do painel_gold (o detalhe nao contem o nome do PDM)
const base = await q([
  "SELECT descricao_detalhada, codigo_pdm gold_pdm, nome_pdm gold_nome",
  "FROM public.painel_gold",
  "WHERE nome_pdm IS NOT NULL AND descricao_detalhada IS NOT NULL",
  "  AND length(descricao_detalhada) > 40",
  "  AND position(lower(nome_pdm) in lower(descricao_detalhada)) = 0",
  "ORDER BY md5(id_compra_item) LIMIT " + Number(process.env.N || 1200),
].join("\n"));
console.log("gabarito limpo do painel_gold: " + base.length.toLocaleString());
if (!base.length) { await db.end(); process.exit(0); }

const norm = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const cabeca = (s) => { const m = norm(s).match(/^([a-zà-ÿ ]+)/); return m ? m[1].trim().split(" ").slice(0, 5).join(" ") : null; };

async function classifica(chave) {
  if (!chave || chave.length < 4) return null;
  const r = (await q("SELECT codigo_pdm, nome_pdm, round(similarity(lower(nome_pdm), $1)::numeric,3) sim FROM catmat_pdm ORDER BY lower(nome_pdm) <-> $1 LIMIT 1", [chave]))[0];
  if (!r) return null;
  let best = r;
  if (Number(r.sim) < LO) {                       // fallback do substantivo-cabeça, só adota se casar MELHOR
    const h = cabeca(chave);
    if (h && h.length >= 4 && h !== chave) {
      const hr = (await q("SELECT codigo_pdm, nome_pdm, round(similarity(lower(nome_pdm), $1)::numeric,3) sim FROM catmat_pdm ORDER BY lower(nome_pdm) <-> $1 LIMIT 1", [h]))[0];
      if (hr && Number(hr.sim) > Number(r.sim)) best = hr;
    }
  }
  return best;
}

const BRACOS = [
  ["A  truncado [148] (API)", (r) => norm(r.descricao_detalhada).slice(0, 148)],
  ["B  spec inteira        ", (r) => norm(r.descricao_detalhada)],
  ["C  spec [90] (janela)  ", (r) => norm(r.descricao_detalhada).slice(0, 90)],
];

console.log("braço                    aceitos   acerto(aceitos)   acerto(todos)   sim médio   tam. médio");
for (const [nome, chaveDe] of BRACOS) {
  let aceitos = 0, okAceitos = 0, okTodos = 0, somaSim = 0, somaTam = 0, n = 0;
  for (const r of base) {
    const ch = chaveDe(r); if (!ch) continue;
    n++; somaTam += ch.length;
    const pred = await classifica(ch);
    if (!pred) continue;
    somaSim += Number(pred.sim);
    const acertou = canon(pred.nome_pdm) === canon(r.gold_nome);
    if (acertou) okTodos++;
    if (Number(pred.sim) >= MIN_SIM) { aceitos++; if (acertou) okAceitos++; }
  }
  const pc = (x, d) => (d ? ((x / d) * 100).toFixed(1) + "%" : "-");
  console.log(nome + String(aceitos).padStart(8) + pc(okAceitos, aceitos).padStart(18)
    + pc(okTodos, n).padStart(16) + (somaSim / n).toFixed(3).padStart(12) + String(Math.round(somaTam / n)).padStart(12));
}
console.log("\n(acerto = PDM canonico previsto igual ao codigo_pdm que o governo declarou no Painel de Precos)");
await db.end();
