// Catálogo CATSER (SERVIÇOS) completo — a taxonomia federal de serviço, irmã do CATMAT.
// Fonte: dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico (7 páginas × 500). NACIONAL.
//   node scripts/ingest_catser_catalogo.mjs
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (01/set/2026) ═══
// O classificador de item só conhecia MATERIAL. Serviço não era "classificado errado": não havia catálogo
// nenhum contra o que classificar. Medido em SC: 519.296 linhas de item são serviço (22,3% da base), e as
// 12.291 chaves `rerank_abstain` de `item_catmat_map` — com ZERO aceitas — são justamente onde o
// reranker-LLM se absteve por ser serviço/genérico.
//
// ═══ O TAMANHO REAL DO CATÁLOGO, MEDIDO E NÃO SUPOSTO ═══
// `totalRegistros` sem filtro = 3.101, que é a soma de statusServico=true (3.018) + false (83). Ou seja o
// endpoint NÃO aplica filtro escondido, e a varredura sem parâmetro de status colhe tudo — inclusive o
// serviço DESATIVADO, que continua aparecendo em contratação antiga e por isso é rótulo válido para a base
// histórica. Guardamos `status_servico` para quem quiser recortar depois; descartar aqui seria perder dado
// que a fonte publica.
//
// ═══ 🚨 A PAGINAÇÃO CEGA PERDE 173 SERVIÇOS (5,6%) — POR ISSO SE VARRE POR SEÇÃO ═══
// Paginando só com `pagina`, o endpoint devolve 3.101 LINHAS mas apenas **2.928 códigos distintos**: 173
// vêm em DUPLICATA (linhas idênticas, sempre em páginas diferentes, nunca na mesma) e outros 173 **nunca
// aparecem**. É reprodutível — duas passadas independentes deram exatamente o mesmo conjunto de 2.928 —
// então não adianta repetir a varredura: o buraco é determinístico.
// Particionando por `codigoSecao` (0..9, a raiz da CPC), a soma dos `totalRegistros` por seção dá 3.101 e
// a colheita dá **3.101 distintos** — completa. As seções que existem hoje são 1, 5, 6, 7, 8 e 9.
// Foi o confronto com o denominador da fonte que revelou isso: a 1ª versão deste script gravou 2.928 e
// teria passado por concluída. Ver [[pnigp-subcoleta-defeito-de-fonte]] e [[pnigp-varredura-colher-tudo-nao-o-primeiro]].
//
// ⚠️ Escala: 3.101 serviços contra 343k materiais do CATMAT. O catálogo de serviço é MUITO menor e já vem
// no nível canônico — não existe aqui o passo de agregação que o material precisa (`catmat_pdm`, 20.332
// nomes de PDM destilados de 343k itens). `nome_servico` é o alvo direto do casamento.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import pg from "pg";
const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 });
db.on("error", () => {});

await db.query(`CREATE TABLE IF NOT EXISTS catser_catalogo (
  codigo_servico INTEGER PRIMARY KEY,
  nome_servico TEXT,
  codigo_secao INTEGER,     nome_secao TEXT,
  codigo_divisao INTEGER,   nome_divisao TEXT,
  codigo_grupo INTEGER,     nome_grupo TEXT,
  codigo_classe INTEGER,    nome_classe TEXT,
  codigo_subclasse INTEGER, nome_subclasse TEXT,
  codigo_cpc INTEGER,
  exclusivo_central_compras BOOLEAN,
  status_servico BOOLEAN,
  fonte_atualizado_em TIMESTAMPTZ,
  atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});

// tamanhoPagina < 10 devolve 400 ("Informe um número de paginação no intervalo de 10 a 500") — não é
// erro de rota; custou uma rodada de 404s achar que o endpoint não existia.
const BASE = "https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico";
const getPage = async (pag, secao) => {
  const url = `${BASE}?pagina=${pag}&tamanhoPagina=500${secao === undefined ? "" : `&codigoSecao=${secao}`}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 404) return { resultado: [], totalRegistros: 0 };   // seção inexistente
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
};

const COLS = ["codigo_servico", "nome_servico", "codigo_secao", "nome_secao", "codigo_divisao", "nome_divisao",
  "codigo_grupo", "nome_grupo", "codigo_classe", "nome_classe", "codigo_subclasse", "nome_subclasse",
  "codigo_cpc", "exclusivo_central_compras", "status_servico", "fonte_atualizado_em"];
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// denominador global, para conferir no fim contra a soma das seções
const capa = await getPage(1);
const esperado = capa?.totalRegistros ?? null;

let total = 0, somaSecoes = 0;
const vistos = new Set();
for (let secao = 0; secao <= 9; secao++) {
  const cab = await getPage(1, secao);
  const nSec = cab?.totalRegistros ?? 0;
  if (!nSec) continue;
  somaSecoes += nSec;
  const pgs = Math.ceil(nSec / 500);
  let daSecao = 0;
  for (let pag = 1; pag <= pgs; pag++) {
    const j = pag === 1 ? cab : await getPage(pag, secao);
    if (j === null) { console.log(`  seção ${secao} pág ${pag}: falha após 4 tentativas`); continue; }
    const arr = j.resultado || [];
    if (!arr.length) break;
    arr.forEach((x) => vistos.add(x.codigoServico));
    daSecao += arr.length;
    const vals = [], ph = [];
    arr.forEach((it, i) => {
      const b = i * COLS.length;
      ph.push(`(${COLS.map((_, ci) => `$${b + ci + 1}`).join(",")})`);
      vals.push(num(it.codigoServico), it.nomeServico || null, num(it.codigoSecao), it.nomeSecao || null,
        num(it.codigoDivisao), it.nomeDivisao || null, num(it.codigoGrupo), it.nomeGrupo || null,
        num(it.codigoClasse), it.nomeClasse || null, num(it.codigoSubclasse), it.nomeSubclasse || null,
        num(it.codigoCpc), it.exclusivoCentralCompras ?? null, it.statusServico ?? null,
        it.dataHoraAtualizacao || null);
    });
    const set = COLS.filter((c) => c !== "codigo_servico").map((c) => `${c}=EXCLUDED.${c}`).join(",");
    await db.query(`INSERT INTO catser_catalogo (${COLS.join(",")}) VALUES ${ph.join(",")}
      ON CONFLICT (codigo_servico) DO UPDATE SET ${set}, atualizado=now()`, vals);
    total += arr.length;
  }
  console.log(`  seção ${secao}: ${daSecao}/${nSec} linhas · ${vistos.size} distintos acumulados`);
  if (daSecao < nSec) console.log(`  ⚠ seção ${secao} veio INCOMPLETA — faltam ${nSec - daSecao}`);
}

// Índice trigram sobre o NOME do serviço — é o alvo do casamento, o análogo de catmat_pdm.nome_pdm.
await db.query(`CREATE INDEX IF NOT EXISTS ix_catser_trgm ON catser_catalogo USING gin (nome_servico gin_trgm_ops)`)
  .catch((e) => console.log("índice:", e.message.slice(0, 80)));

// ═══ CONFERE CONTRA O DENOMINADOR DA FONTE ═══
// "acabou a paginação" não prova que veio tudo — a fonte publica `totalRegistros`, então dá para comparar
// em vez de confiar. Ver a lei da subcoleta: silêncio da API não é conclusão.
const gravado = Number((await db.query(`SELECT count(*) n FROM catser_catalogo`)).rows[0].n);
const st = (await db.query(`SELECT status_servico, count(*)::int n FROM catser_catalogo GROUP BY 1 ORDER BY 2 DESC`)).rows;
console.log(`\n✔ catser_catalogo: ${gravado} serviços gravados`);
console.log(`  denominadores: global=${esperado} · soma das seções=${somaSecoes} · distintos colhidos=${vistos.size}`);
console.log("  por status: " + st.map((r) => `${r.status_servico}=${r.n}`).join(" · "));
// Três confrontos, porque cada um pega um defeito diferente:
if (esperado !== null && somaSecoes !== esperado)
  console.log(`⚠ as seções somam ${somaSecoes} mas o total global é ${esperado} — há seção fora do intervalo 0..9`);
if (vistos.size !== somaSecoes)
  console.log(`⚠ colhi ${vistos.size} distintos para ${somaSecoes} anunciados — a paginação POR SEÇÃO também escorrega`);
if (gravado < vistos.size)
  console.log(`⚠ SUBCOLETA na gravação: ${vistos.size - gravado} não entraram — NÃO tratar como concluído`);
if (esperado !== null && gravado === esperado) console.log("  ✔ completo: gravado == denominador da fonte");
await db.end();
