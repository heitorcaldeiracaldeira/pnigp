// GABARITO de classificação de item — a RÉGUA contra a qual CATMAT e CATSER são medidos.
//   node scripts/constroi_gabarito_item.mjs            # rotula o que ainda não tem rótulo
//   AMOSTRA=40 node scripts/constroi_gabarito_item.mjs # muda o tamanho por banda×tipo (padrão 20)
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (01/set/2026) ═══
// O gabarito anterior MORREU. `eval_operating_point.mjs` carrega os rótulos de um `sc_strat_ws.tsv` que
// vivia no scratchpad de uma sessão do Claude Code — pasta temporária, apagada. Os 90 rótulos ainda estão
// no código (o objeto GOLD), mas são indexados por POSIÇÃO na planilha; a base cresceu 84% desde julho,
// então regerar a planilha daria outras descrições nas mesmas posições e o gabarito ficaria silenciosamente
// ERRADO. Recuperar era mais perigoso que refazer.
//
// ⭐⭐ **A LIÇÃO, E A RAZÃO DE ESTE GABARITO VIVER NO BANCO:** um gabarito é infraestrutura de medição, não
// artefato de sessão. Guardado em `app.gabarito_item`, ele entra no backup do Neon, sobrevive a qualquer
// sessão e pode ser auditado por SELECT. Nunca mais em arquivo de scratchpad.
//
// ═══ POR QUE OPUS 5 E NÃO HAIKU ═══
// O `rerank_llm.mjs` usa Haiku, e está certo: lá o LLM é um COMPONENTE do produto, roda por item e o custo
// multiplica. Aqui é o contrário — o gabarito é a RÉGUA com que todo o resto será medido, roda uma vez,
// sobre algumas centenas de linhas. Régua barata contamina toda medição futura, e o erro fica invisível
// porque vira o próprio critério de verdade. Custo total estimado: poucos dólares.
// ⚠️ NÃO passar `temperature` aqui: parâmetros de amostragem foram REMOVIDOS no Opus 5 e devolvem 400.
// O `rerank_llm.mjs` passa `temperature: 0` e continua correto — ele roda em Haiku, que ainda os aceita.
//
// ═══ O LIMITE DECLARADO DESTE GABARITO ═══
// O rótulo é escolhido de uma LISTA DE CANDIDATOS, então o teto do gabarito é o recall dessa lista: se o
// alvo certo não estiver entre eles, o melhor rótulo possível é "nenhum". Para afrouxar esse teto sem
// torná-lo circular, os candidatos vêm de DUAS rotas (trigrama sobre a descrição inteira + trigrama sobre o
// substantivo-cabeça), e são 35 — bem mais que os 8 que a produção usa. A lista fica GRAVADA em
// `candidatos`, então dá para auditar depois quantos "nenhum" foram falta de candidato e não falta de
// resposta. Um gabarito com o teto escrito na testa é honesto; um sem, engana.
import fs from "fs"; import pg from "pg"; import { z } from "zod"; import { generateObject } from "ai";

for (const f of ["C:/Users/PC/pnigp/.env.ai", "C:/Users/PC/pnigp/.env.local"])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
if (!process.env.ANTHROPIC_API_KEY) { console.error("ERRO: ANTHROPIC_API_KEY não encontrada em .env.ai/.env.local"); process.exit(1); }
const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL_ID = process.env.GABARITO_MODEL || "claude-opus-5";
const MODEL = anthropic(MODEL_ID);
const AMOSTRA = Number(process.env.AMOSTRA || 20);   // por banda × tipo
const CONC = Number(process.env.CONC || 4);
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 4, statement_timeout: 600000 });
db.on("error", () => {});

// ⚠️ SEM `.max()` na justificativa, de propósito. A 1ª versão tinha `.max(200)` e **metade das chamadas
// falhou** com "response did not match schema": o modelo escrevia uma justificativa boa com 210 caracteres
// e o zod rejeitava a RESPOSTA INTEIRA, rótulo junto. Restrição cosmética não pode invalidar dado bom —
// se o tamanho importar, corte na gravação, não na validação.
const Schema = z.object({
  escolha: z.number().int().describe("número do candidato correto, ou 0 se NENHUM candidato serve"),
  confianca: z.enum(["alta", "media", "baixa"]),
  justificativa: z.string().describe("uma frase curta explicando a escolha"),
});

// ═══ 🚨 SALVAMENTO DO ENVELOPE `{"json": …}` ═══
// Medido em 01/set: **51 de 200 chamadas (25%) "falhavam"** com `No object generated: response did not
// match schema` — e as respostas estavam CERTAS. O modelo às vezes devolve
//     {"json":{"escolha":24,"confianca":"media","justificativa":"…"}}
// em vez do objeto no topo. O zod não acha `escolha`, rejeita tudo, e o rótulo bom vai para o lixo.
// A mensagem de erro diz "did not match schema", o que empurra para desconfiar do MODELO; o defeito era da
// casca. Por isso a diagnose foi olhar `e.text` (a resposta crua) em vez de teorizar mais uma vez.
// ⚠️ Não resolver isso com `z.union` no schema: a união vira o JSON Schema que o modelo recebe e o convida
// a usar o envelope. Schema estrito no pedido, desembrulho no recebimento.
function desembrulha(e) {
  const t = e?.text;
  if (typeof t !== "string") return null;
  try {
    let v = JSON.parse(t);
    if (v && typeof v === "object" && !("escolha" in v) && v.json && typeof v.json === "object") v = v.json;
    return Schema.parse(v);
  } catch { return null; }
}

const SYSTEM = `Você rotula descrições de compras públicas municipais brasileiras contra o catálogo federal.
Sua resposta é GABARITO: será usada para medir a acurácia de um classificador automático, então errar aqui
corrompe a medição de todo o sistema.

REGRAS:
- Escolha o candidato que descreve O MESMO produto ou serviço da descrição.
- Descrição municipal é curta, coloquial e às vezes com erro de grafia ("parafuso sextavado", "hora maquina").
- Se NENHUM candidato serve, responda 0. Prefira 0 a forçar um parecido: um rótulo errado é pior que um
  "nenhum", porque contamina a régua em silêncio.
- Não escolha por semelhança de palavra quando o objeto é outro (ex.: "joelho pvc esgoto" NÃO é prótese de
  joelho; "mesa" de escritório NÃO é mesa cirúrgica).
- confianca 'baixa' quando a descrição é ambígua demais para decidir com segurança.`;

await db.query(`CREATE SCHEMA IF NOT EXISTS app`);
await db.query(`CREATE TABLE IF NOT EXISTS app.gabarito_item (
  chave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,                 -- 'M' (material→CATMAT) ou 'S' (serviço→CATSER)
  banda TEXT NOT NULL,                -- faixa de frequência: onde o classificador degrada
  n_itens INT,
  candidatos JSONB,                   -- a lista oferecida: o TETO do gabarito, gravado para auditoria
  rotulo_codigo INT,                  -- NULL = ainda não rotulado · 0 = nenhum candidato serve
  rotulo_nome TEXT,
  rotulo_conf TEXT,
  justificativa TEXT,
  modelo TEXT,
  rotulado_em TIMESTAMPTZ)`);

// ═══ AMOSTRA ESTRATIFICADA POR FREQUÊNCIA ═══
// A curva de acurácia×frequência do CATMAT mostrou que o motor degrada na CAUDA (n≥200: 100% · 2-4: 65%).
// Amostra só do topo mediria o caso fácil e mentiria para cima — é o critério frouxo aplicado à própria régua.
const BANDAS = [["a_200+", 200, 1e9], ["b_50-199", 50, 200], ["c_20-49", 20, 50], ["d_5-19", 5, 20], ["e_2-4", 2, 5]];
const novos = [];
for (const [banda, lo, hi] of BANDAS) {
  for (const [tipo, mapa] of [["M", "item_catmat_map"], ["S", "item_catser_map"]]) {
    const r = await db.query(`
      SELECT chave, n_itens FROM ${mapa}
      WHERE n_itens >= $1 AND n_itens < $2
        AND NOT EXISTS (SELECT 1 FROM app.gabarito_item g WHERE g.chave = ${mapa}.chave)
      ORDER BY random() LIMIT $3`, [lo, hi, AMOSTRA]);
    r.rows.forEach((x) => novos.push({ ...x, tipo, banda }));
  }
}
for (const x of novos) {
  await db.query(`INSERT INTO app.gabarito_item (chave, tipo, banda, n_itens) VALUES ($1,$2,$3,$4)
    ON CONFLICT (chave) DO NOTHING`, [x.chave, x.tipo, x.banda, x.n_itens]);
}
console.log(`amostra: ${novos.length} novas chaves inseridas`);

const pend = (await db.query(`SELECT chave, tipo, banda, n_itens FROM app.gabarito_item
  WHERE rotulo_codigo IS NULL ORDER BY banda, tipo`)).rows;
console.log(`a rotular: ${pend.length} · modelo ${MODEL_ID} · conc ${CONC}`);
if (!pend.length) { await db.end(); process.exit(0); }

// 35 candidatos por DUAS rotas — ver "o limite declarado" no cabeçalho
async function candidatos(chave, tipo) {
  const cabeca = (chave.match(/^([a-záàâãéêíóôõúüç ]+)/)?.[1] || "").trim().split(" ").slice(0, 5).join(" ");
  const sql = tipo === "M"
    ? { tab: "catmat_pdm", cod: "codigo_pdm", nome: "nome_pdm" }
    : { tab: "catser_catalogo", cod: "codigo_servico", nome: "nome_servico" };
  const a = (await db.query(`SELECT ${sql.cod} cod, ${sql.nome} nome FROM ${sql.tab}
      WHERE ${sql.nome} IS NOT NULL ORDER BY lower(${sql.nome}) <-> $1 LIMIT 25`, [chave])).rows;
  const b = cabeca.length >= 4 ? (await db.query(`SELECT ${sql.cod} cod, ${sql.nome} nome FROM ${sql.tab}
      WHERE ${sql.nome} IS NOT NULL ORDER BY lower(${sql.nome}) <-> $1 LIMIT 10`, [cabeca])).rows : [];
  const vistos = new Set(), out = [];
  for (const x of [...a, ...b]) { const k = String(x.nome).toLowerCase(); if (vistos.has(k)) continue; vistos.add(k); out.push(x); }
  return out.slice(0, 35);
}

let feitos = 0, nenhum = 0, erros = 0, idx = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < pend.length) {
    const it = pend[idx++];
    try {
      const cands = await candidatos(it.chave, it.tipo);
      if (!cands.length) { erros++; continue; }
      const lista = cands.map((c, i) => `${i + 1}. ${c.nome}`).join("\n");
      // 2 tentativas: uma falha de schema é ruído da chamada, não veredito sobre a descrição — perder a
      // linha por isso encolheria o gabarito exatamente nos casos mais difíceis de responder.
      let object = null, ultimo = null;
      for (let t = 0; t < 2 && !object; t++) {
        try {
          ({ object } = await generateObject({
            model: MODEL, schema: Schema, system: SYSTEM,
            prompt: `DESCRIÇÃO MUNICIPAL (${it.tipo === "M" ? "material" : "serviço"}): ${it.chave}\n\nCANDIDATOS:\n${lista}\n\nQual candidato corresponde? Responda 0 se nenhum servir.`,
          }));
        } catch (e) { ultimo = e; object = desembrulha(e); }
      }
      if (!object) throw ultimo || new Error("sem objeto");
      const esc = object.escolha >= 1 && object.escolha <= cands.length ? cands[object.escolha - 1] : null;
      if (!esc) nenhum++;
      await db.query(`UPDATE app.gabarito_item SET candidatos=$2, rotulo_codigo=$3, rotulo_nome=$4,
        rotulo_conf=$5, justificativa=$6, modelo=$7, rotulado_em=now() WHERE chave=$1`,
        [it.chave, JSON.stringify(cands), esc ? esc.cod : 0, esc ? esc.nome : null,
         object.confianca, String(object.justificativa).slice(0,300), MODEL_ID]);
      feitos++;
      if (feitos % 20 === 0) console.log(`  ${feitos}/${pend.length} rotulados (${nenhum} "nenhum", ${erros} erros)`);
    } catch (e) { erros++; console.log(`  erro em "${it.chave.slice(0, 40)}": ${e.message.slice(0, 90)}`); }
  }
}));

console.log(`\n✔ ${feitos} rotulados · ${nenhum} sem candidato adequado · ${erros} erros`);
console.table((await db.query(`SELECT tipo, banda, count(*)::int n,
  count(*) FILTER (WHERE rotulo_codigo > 0)::int com_rotulo,
  count(*) FILTER (WHERE rotulo_codigo = 0)::int nenhum,
  count(*) FILTER (WHERE rotulo_conf='alta')::int conf_alta
  FROM app.gabarito_item WHERE rotulo_codigo IS NOT NULL GROUP BY 1,2 ORDER BY 1,2`)).rows);
console.log("\n⚠ TETO DECLARADO: o rótulo sai de uma lista de 35 candidatos. Um 'nenhum' pode ser ausência de");
console.log("  candidato, não ausência de resposta — a lista está gravada em app.gabarito_item.candidatos.");
await db.end();
