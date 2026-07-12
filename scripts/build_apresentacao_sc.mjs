// APRESENTAÇÃO — Camada 1 (rótulo): parseia o rótulo `unidade` de cada item-bem em UNIDADE BÁSICA + FATOR de
// desempacotamento, gravando o dicionário `item_apresentacao_sc` (chave = rótulo normalizado). É o Passe 2 do mapa
// de preços (docs/metodologia-mapa-precos.md §3): preco_unidade_basica = unit_homologado / fator. O fator combina
// CONTAGEM embutida ("caixa 100,00 un" → 100) com CONVERSÃO DIMENSIONAL ("kg" → 1000 g, "galão 5 l" → 5000 ml).
// Distingue unidade dimensional (m2/m3 = expoente, NÃO quantidade) de desempacotamento. Container sem número
// (frasco/caixa/pacote) fica em nível próprio, baixa-confiança, pendente da Camada 2 (extrair qtd da descrição).
// node scripts/build_apresentacao_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// U[token] = [base, mult] — mult converte 1 <token> em nº de <base> canônica (volume→ml · massa→g · comprimento→m · contagem→unidade)
const U = {
  ml: ["ml", 1], mililitro: ["ml", 1], mililitros: ["ml", 1],
  l: ["ml", 1000], lt: ["ml", 1000], litro: ["ml", 1000], litros: ["ml", 1000],
  g: ["g", 1], gr: ["g", 1], grs: ["g", 1], grama: ["g", 1], gramas: ["g", 1],
  kg: ["g", 1000], quilo: ["g", 1000], quilos: ["g", 1000], quilograma: ["g", 1000], quilogramas: ["g", 1000], kilo: ["g", 1000], kilograma: ["g", 1000], kilogramas: ["g", 1000],
  mg: ["g", 0.001], mcg: ["g", 0.000001], t: ["g", 1e6], ton: ["g", 1e6], tonelada: ["g", 1e6], toneladas: ["g", 1e6],
  m: ["m", 1], mt: ["m", 1], mtr: ["m", 1], metro: ["m", 1], metros: ["m", 1], cm: ["m", 0.01], mm: ["m", 0.001],
  un: ["unidade", 1], und: ["unidade", 1], unid: ["unidade", 1], uni: ["unidade", 1], unidade: ["unidade", 1], unidades: ["unidade", 1], u: ["unidade", 1],
  pc: ["unidade", 1], pca: ["unidade", 1], pcs: ["unidade", 1], peca: ["unidade", 1], pecas: ["unidade", 1], pç: ["unidade", 1],
  comprimido: ["comprimido", 1], comprimidos: ["comprimido", 1], comp: ["comprimido", 1], cp: ["comprimido", 1], cpr: ["comprimido", 1], drageas: ["comprimido", 1],
  ampola: ["ampola", 1], ampolas: ["ampola", 1], amp: ["ampola", 1],
  capsula: ["capsula", 1], capsulas: ["capsula", 1], caps: ["capsula", 1],
  folha: ["folha", 1], folhas: ["folha", 1], fl: ["folha", 1], dose: ["dose", 1], doses: ["dose", 1],
  par: ["par", 1], pares: ["par", 1], duzia: ["unidade", 12], duzias: ["unidade", 12], dz: ["unidade", 12],
};
// containers SEM número: base própria, fator 1 (baixa conf), qtd fica p/ Camada 2 (descrição)
const CONT = new Set(["pacote", "pacotes", "pct", "pac", "pcte", "frasco", "frascos", "fco", "fr", "caixa", "caixas", "cx", "cxa",
  "lata", "latas", "pote", "potes", "pt", "galao", "galoes", "gl", "balde", "baldes", "saco", "sacos", "sc", "fardo", "fardos", "fd",
  "rolo", "rolos", "rl", "tubo", "tubos", "bisnaga", "bisnagas", "bloco", "blocos", "barra", "barras", "kit", "kits", "conjunto",
  "jogo", "jg", "envelope", "envelopes", "resma", "resmas", "cartela", "cartelas", "bobina", "bobinas", "frasco-ampola", "frasco/ampola", "vidro"]);
// palavras de SERVIÇO (não-bem) que escapam do FILTRO — excluídas do fallback discreto da Camada 3
const SERVICO = new Set(["vaga", "vagas", "aula", "aulas", "sessao", "sessoes", "atendimento", "atendimentos", "exame", "exames",
  "consulta", "consultas", "visita", "visitas", "parecer", "laudo", "laudos", "mensalidade", "assinatura", "licenca", "licencas",
  "hospedagem", "diaria", "diarias", "pernoite", "evento", "eventos", "inscricao", "inscricoes", "matricula", "vistoria", "outorga"]);
const clean = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ").trim().replace(/(\d),(\d)/g, "$1.$2").replace(/\.$/, "");

function parse(label) {
  const s = clean(label);
  if (/(^|[^0-9a-z])(m2|m²|metro quadrado|metros quadrados)([^0-9a-z]|$)/.test(s)) return { base: "m2", fator: 1, forma: "avulso", dim: "area", metodo: "rotulo_dim", conf: 0.95 };
  if (/(^|[^0-9a-z])(m3|m³|metro cubico|metros cubicos)([^0-9a-z]|$)/.test(s)) return { base: "m3", fator: 1, forma: "avulso", dim: "vol3", metodo: "rotulo_dim", conf: 0.95 };
  const m = s.match(/(?:([a-zç]+)\s+)?(\d+(?:\.\d+)?)\s*([a-zç]+)\s*(?:\(.*\))?$/);
  if (m && U[m[3]]) {
    const emb = m[1] || null, num = parseFloat(m[2]), [base, mult] = U[m[3]], fator = num * mult;
    if (fator > 0) return { base, fator, forma: (base === "unidade" && num > 1) ? "escala" : "avulso", emb, dim: null, metodo: "rotulo_qtd", conf: emb ? 0.9 : 0.8 };
  }
  const tok = s.replace(/\s*\(.*\)\s*$/, "").trim();
  if (U[tok]) { const [base, mult] = U[tok]; return { base, fator: mult, forma: "avulso", dim: null, metodo: "rotulo_simples", conf: 0.85 }; }
  if (CONT.has(tok)) return { base: tok.replace(/s$/, ""), fator: 1, forma: "avulso", dim: "container", metodo: "rotulo_container", conf: 0.5 };
  // Camada 3 — fallback discreto: rótulo desconhecido de 1 palavra alfabética = provável unidade discreta própria
  // (teste, disco, molho, frasco-ampola), fator 1. EXCLUI palavras de serviço (vaga, aula, sessão…) que não são bem.
  if (/^[a-zç/-]{2,20}$/.test(tok) && !SERVICO.has(tok))
    return { base: tok.replace(/s$/, ""), fator: 1, forma: "avulso", dim: "discreta", metodo: "rotulo_fallback", conf: 0.6 };
  return null;
}

const FILTRO = `unit_homologado BETWEEN 0.5 AND 100000 AND quantidade>0 AND descricao IS NOT NULL
  AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
  AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });
  db.on("error", () => {});
  const q = (s, p) => db.query(s, p);
  const rows = (await q(`SELECT lower(btrim(unidade)) u, count(*) n FROM itens_sc WHERE ${FILTRO} GROUP BY 1`)).rows;
  const totItens = rows.reduce((a, b) => a + Number(b.n), 0);

  await q(`CREATE TABLE IF NOT EXISTS item_apresentacao_sc (
    unidade TEXT PRIMARY KEY, unidade_basica TEXT, fator NUMERIC, forma TEXT, dimensao TEXT,
    conf NUMERIC, metodo TEXT, n_itens INT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await q(`TRUNCATE item_apresentacao_sc`);

  const A = { u: [], b: [], f: [], fo: [], d: [], c: [], me: [], n: [] };
  let cov = 0; const naoParse = [];
  for (const r of rows) {
    const p = parse(r.u), n = Number(r.n);
    if (!p) { naoParse.push([r.u, n]); continue; }
    cov += n;
    A.u.push(r.u); A.b.push(p.base); A.f.push(p.fator); A.fo.push(p.forma); A.d.push(p.dim || null); A.c.push(p.conf); A.me.push(p.metodo); A.n.push(n);
  }
  // insere em bloco
  await q(`INSERT INTO item_apresentacao_sc (unidade, unidade_basica, fator, forma, dimensao, conf, metodo, n_itens)
    SELECT * FROM unnest($1::text[],$2::text[],$3::numeric[],$4::text[],$5::text[],$6::numeric[],$7::text[],$8::int[])`,
    [A.u, A.b, A.f, A.fo, A.d, A.c, A.me, A.n]);

  const s = (await q(`SELECT metodo, count(*) rotulos, sum(n_itens) itens FROM item_apresentacao_sc GROUP BY 1 ORDER BY 3 DESC`)).rows;
  console.log(`\n✔ item_apresentacao_sc · ${rows.length.toLocaleString()} rótulos · cobertura ${cov.toLocaleString()}/${totItens.toLocaleString()} itens (${(100 * cov / totItens).toFixed(1)}%)`);
  console.log("por método (rótulos · itens):");
  for (const r of s) console.log("  " + String(r.metodo).padEnd(18) + String(r.rotulos).padStart(5) + "  " + Number(r.itens).toLocaleString());
  const alta = (await q(`SELECT sum(n_itens) n FROM item_apresentacao_sc WHERE conf>=0.8`)).rows[0].n;
  console.log(`itens com apresentação de ALTA confiança (>=0.8): ${Number(alta).toLocaleString()} (${(100 * alta / totItens).toFixed(1)}%)`);
  console.log(`não parseado: ${naoParse.reduce((a, b) => a + b[1], 0).toLocaleString()} itens em ${naoParse.length} rótulos (p/ Camada 2/3)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
