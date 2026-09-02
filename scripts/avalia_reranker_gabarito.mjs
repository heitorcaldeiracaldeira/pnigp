// O RERANKER-LLM ganha do trigrama? Medido contra `app.gabarito_item`, ANTES de gastar na cauda inteira.
//   node scripts/avalia_reranker_gabarito.mjs
//
// ═══ POR QUE MEDIR ANTES ═══
// Rodar o reranker na cauda toda são 36.763 chaves de material + 11.924 de serviço — dezenas de dólares.
// Em julho ele foi aplicado sem gabarito na língua de SC porque não havia um; agora há
// ([[pnigp-gabarito-item-no-banco]]), e a lei do projeto pede A/B contra o ponto de operação antes de
// entrar ([[feedback-catmat-motor-intocavel]]). 216 chaves custam centavos e respondem a pergunta.
//
// ═══ O ENVELOPE "NÃO-PIORA", QUE É O DESENHO VALIDADO EM JULHO ═══
// O trigrama é o padrão. O LLM só SOBRESCREVE quando escolhe outro candidato da lista; se ele responde
// "nenhum", fica o trigrama. Isso limita o dano de uma alucinação a trocar um candidato por outro da mesma
// lista — nunca a inventar um código. O que este script mede é justamente se essa troca ganha ou perde.
//
// ═══ DOIS MODELOS, DE PROPÓSITO ═══
// Haiku é o que roda em produção hoje (`rerank_llm.mjs`) e é o que multiplicaria por item. Opus 5 entra
// como TETO: se o ganho do modelo caro não for maior, não há por que pagá-lo na cauda. Medir só o barato
// responderia "vale a pena?" sem responder "vale a pena o quê?".
import fs from "fs"; import pg from "pg"; import { z } from "zod"; import { generateObject } from "ai";

for (const f of ["C:/Users/PC/pnigp/.env.ai", "C:/Users/PC/pnigp/.env.local"])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
const { anthropic } = await import("@ai-sdk/anthropic");
const MODELOS = (process.env.MODELOS || "claude-haiku-4-5,claude-opus-5").split(",");
const CONC = Number(process.env.CONC || 4);
const TOPK = Number(process.env.TOPK || 8);   // o mesmo k da produção
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 4, statement_timeout: 300000 });

const Schema = z.object({ escolha: z.number().int(), justificativa: z.string() });
function desembrulha(e) {
  const t = e?.text; if (typeof t !== "string") return null;
  try { let v = JSON.parse(t); if (v && typeof v === "object" && !("escolha" in v) && v.json) v = v.json; return Schema.parse(v); } catch { return null; }
}
const SYSTEM = `Você escolhe, entre candidatos de um catálogo oficial, qual corresponde a uma descrição de
compra pública municipal brasileira. Responda 0 se nenhum candidato servir — 0 é resposta legítima e
preferível a forçar um parecido. Não escolha por semelhança de palavra quando o objeto é outro
(ex.: "joelho pvc esgoto" NÃO é prótese de joelho).`;
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const MOTORES = [
  { tipo: "M", rotulo: "CATMAT", mapa: "item_catmat_map", tab: "catmat_pdm", cod: "codigo_pdm", nome: "nome_pdm" },
  { tipo: "S", rotulo: "CATSER", mapa: "item_catser_map", tab: "catser_catalogo", cod: "codigo_servico", nome: "nome_servico" },
];

for (const mo of MOTORES) {
  // gabarito + o que o trigrama previu hoje
  const itens = (await db.query(`
    SELECT g.chave, g.banda, g.rotulo_nome, g.rotulo_codigo, p.${mo.nome} AS trg_nome, p.sim, p.aceito
    FROM app.gabarito_item g JOIN ${mo.mapa} p ON p.chave = g.chave
    WHERE g.tipo = $1 AND g.rotulo_codigo IS NOT NULL
      ${process.env.SO_CAUDA === "1" ? "AND p.sim < 0.5" : ""}`, [mo.tipo])).rows;
  if (process.env.SO_CAUDA === "1") console.log(`
(SO_CAUDA=1 — só chaves com sim<0,5, que é onde o reranker deve agir)`);

  for (const modelo of MODELOS) {
    const MODEL = anthropic(modelo);
    let idx = 0; const out = [];
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (idx < itens.length) {
        const it = itens[idx++];
        const cands = (await db.query(`SELECT DISTINCT ON (lower(${mo.nome})) ${mo.cod} cod, ${mo.nome} nome
          FROM ${mo.tab} WHERE ${mo.nome} IS NOT NULL AND ${mo.nome} !~ '^[0-9]+$'
          ORDER BY lower(${mo.nome}), lower(${mo.nome}) <-> $1 LIMIT $2`, [it.chave, TOPK])).rows;
        let obj = null;
        for (let t = 0; t < 2 && !obj; t++) {
          try {
            ({ object: obj } = await generateObject({ model: MODEL, schema: Schema, system: SYSTEM,
              prompt: `DESCRIÇÃO: ${it.chave}\n\nCANDIDATOS:\n${cands.map((c, i) => `${i + 1}. ${c.nome}`).join("\n")}\n\nQual corresponde? 0 se nenhum.` }));
          } catch (e) { obj = desembrulha(e); }
        }
        // envelope não-piora: só sobrescreve se escolheu um candidato válido
        const esc = obj && obj.escolha >= 1 && obj.escolha <= cands.length ? cands[obj.escolha - 1].nome : null;
        out.push({ ...it, llm_nome: esc, sobrescreveu: !!esc });
      }
    }));

    const g = (x) => norm(x.rotulo_nome);
    const comAlvo = out.filter((x) => x.rotulo_codigo > 0);
    const trgOk = (x) => norm(x.trg_nome) === g(x);
    const finalNome = (x) => (x.llm_nome ? norm(x.llm_nome) : norm(x.trg_nome));
    const rrOk = (x) => finalNome(x) === g(x);
    const acertoTrg = comAlvo.filter(trgOk).length;
    const acertoRr = comAlvo.filter(rrOk).length;
    const regressoes = comAlvo.filter((x) => trgOk(x) && !rrOk(x));
    const consertos = comAlvo.filter((x) => !trgOk(x) && rrOk(x));
    // e nos que o gabarito diz "nenhum": o LLM soube se abster?
    const semAlvo = out.filter((x) => x.rotulo_codigo === 0);
    const absteve = semAlvo.filter((x) => !x.sobrescreveu).length;
    const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : "—");

    console.log(`\n═══ ${mo.rotulo} · ${modelo} (top-${TOPK}, envelope não-piora) ═══`);
    console.log(`  trigrama ....... ${pc(acertoTrg, comAlvo.length)}  (${acertoTrg}/${comAlvo.length})`);
    console.log(`  + reranker ..... ${pc(acertoRr, comAlvo.length)}  (${acertoRr}/${comAlvo.length})   delta ${acertoRr - acertoTrg >= 0 ? "+" : ""}${acertoRr - acertoTrg}`);
    console.log(`  consertou ${consertos.length} · REGREDIU ${regressoes.length}   ← regressão > 0 reprova pela lei do projeto`);
    console.log(`  sobrescreveu em ${out.filter((x) => x.sobrescreveu).length}/${out.length} · absteve em ${absteve}/${semAlvo.length} dos "nenhum" do gabarito`);
    if (regressoes.length) regressoes.slice(0, 4).forEach((r) =>
      console.log(`    ✗ "${r.chave.slice(0, 38)}" trg="${String(r.trg_nome).slice(0, 26)}" → llm="${String(r.llm_nome).slice(0, 26)}" (ouro="${String(r.rotulo_nome).slice(0, 26)}")`));
  }
}
await db.end();
