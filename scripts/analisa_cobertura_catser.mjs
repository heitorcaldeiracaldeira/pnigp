// O "nenhum" do gabarito de SERVIÇO é ausência de CANDIDATO ou ausência de CÓDIGO?
//   node scripts/analisa_cobertura_catser.mjs
//
// ═══ A PERGUNTA ═══
// O gabarito diz "nenhum candidato serve" em 33,6% dos serviços, contra 17,4% dos materiais
// ([[pnigp-gabarito-item-no-banco]]). Mas o rótulo saiu de uma lista de 35 candidatos — então "nenhum"
// pode significar duas coisas MUITO diferentes:
//   (a) o código existe no CATSER e a busca não o trouxe   → conserta-se o RETRIEVER
//   (b) o CATSER não tem código para isso                  → conserta-se o CATÁLOGO (ou não se conserta)
// Investir no reranker-LLM só faz sentido em (a): rerankear candidatos que não contêm a resposta não
// produz acerto nenhum.
//
// ═══ POR QUE DÁ PARA RESPONDER DEFINITIVAMENTE ═══
// O CATSER tem 3.101 entradas — pequeno o bastante para caber INTEIRO no prompt. Sem lista de candidatos
// não há teto de recall: se o modelo diz "nenhum" vendo o catálogo todo, é (b), ponto final.
// O catálogo vai no `system` com cache_control: ele é idêntico em todas as chamadas, então a 1ª paga a
// escrita e as demais leem a ~10% do custo. Por isso a 1ª chamada roda SOZINHA — chamadas paralelas antes
// de o cache existir pagariam o preço cheio cada uma.
import fs from "fs"; import pg from "pg"; import { z } from "zod"; import { generateObject } from "ai";

for (const f of ["C:/Users/PC/pnigp/.env.ai", "C:/Users/PC/pnigp/.env.local"])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic(process.env.GABARITO_MODEL || "claude-opus-5");
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });

const Schema = z.object({
  codigo: z.number().int().describe("codigoServico do catálogo que serve, ou 0 se NENHUM serve"),
  justificativa: z.string(),
});
// mesmo desembrulho do construtor do gabarito: o modelo às vezes devolve {"json": {...}}
function desembrulha(e) {
  const t = e?.text; if (typeof t !== "string") return null;
  try { let v = JSON.parse(t); if (v && typeof v === "object" && !("codigo" in v) && v.json) v = v.json; return Schema.parse(v); } catch { return null; }
}

const cat = (await db.query(`SELECT DISTINCT ON (lower(nome_servico)) codigo_servico, nome_servico, nome_classe
  FROM catser_catalogo WHERE nome_servico IS NOT NULL ORDER BY lower(nome_servico), codigo_servico`)).rows;
const CATALOGO = cat.map((c) => `${c.codigo_servico}\t${c.nome_servico}`).join("\n");
console.log(`catálogo inteiro no prompt: ${cat.length} serviços · ${CATALOGO.length.toLocaleString()} caracteres (~${Math.round(CATALOGO.length / 3.6 / 1000)}k tokens)`);

const SYSTEM = `Você decide se o catálogo federal de serviços (CATSER) tem ou não um código adequado para uma
descrição de compra pública municipal brasileira.

Abaixo está o CATSER INTEIRO, uma linha por serviço, no formato: codigo<TAB>nome.

REGRAS:
- Responda o código que descreve O MESMO serviço da descrição.
- Responda 0 se o catálogo NÃO tiver nada adequado. Isso é uma resposta legítima e esperada: o CATSER é
  pequeno e a realidade municipal é maior que ele.
- NÃO force um código genérico só para não responder 0. "OUTROS SERVIÇOS" quando o serviço específico não
  existe é resposta errada — a pergunta é se o catálogo COBRE o serviço, não se há onde encaixá-lo.
- Serviço claramente de OUTRA natureza não serve, por mais que as palavras se pareçam.

CATSER:
${CATALOGO}`;

const alvos = (await db.query(`SELECT chave, banda, n_itens FROM app.gabarito_item
  WHERE tipo='S' AND rotulo_codigo = 0 ORDER BY n_itens DESC`)).rows;
console.log(`a reexaminar: ${alvos.length} descrições que o gabarito marcou "nenhum"\n`);

async function pergunta(chave) {
  for (let t = 0; t < 3; t++) {
    try {
      const { object } = await generateObject({
        model: MODEL, schema: Schema,
        system: SYSTEM,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        prompt: `DESCRIÇÃO MUNICIPAL: ${chave}\n\nO CATSER tem código adequado? Responda o código, ou 0 se não tiver.`,
      });
      return object;
    } catch (e) { const s = desembrulha(e); if (s) return s; if (t === 2) throw e; }
  }
}

const nomePorCodigo = new Map(cat.map((c) => [c.codigo_servico, c.nome_servico]));
const res = [];
// a 1ª sozinha, para escrever o cache; o resto em paralelo lendo dele
for (let i = 0; i < alvos.length; i++) {
  if (i === 1) break;
  try { res.push({ ...alvos[i], r: await pergunta(alvos[i].chave) }); } catch (e) { res.push({ ...alvos[i], erro: e.message.slice(0, 60) }); }
}
const resto = alvos.slice(1); let idx = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (idx < resto.length) {
    const a = resto[idx++];
    try { res.push({ ...a, r: await pergunta(a.chave) }); } catch (e) { res.push({ ...a, erro: e.message.slice(0, 60) }); }
  }
}));

// ═══ PERSISTE NO GABARITO — a passada sem teto de recall é MELHOR VERDADE que a de 35 candidatos ═══
// O gabarito rotulou estes como "nenhum" escolhendo entre 35 candidatos. Aqui o modelo viu o CATSER
// INTEIRO, sem teto: quando ele acha um código, o "nenhum" original era limite da lista, não do catálogo.
// Deixar o rótulo velho tornaria a régua injusta com qualquer sistema que ACERTE esses casos — ele seria
// contado como falso aceite. Gabarito tem de carregar a melhor verdade disponível, não a primeira.
if (process.env.PERSISTE === "1") {
  let n = 0;
  for (const x of res) {
    if (!x.r || !(x.r.codigo > 0) || !nomePorCodigo.has(x.r.codigo)) continue;
    await db.query(`UPDATE app.gabarito_item SET rotulo_codigo=$2, rotulo_nome=$3, rotulo_conf='alta',
      justificativa=$4, modelo=$5, rotulado_em=now() WHERE chave=$1`,
      [x.chave, x.r.codigo, nomePorCodigo.get(x.r.codigo),
       "[catalogo integral] " + String(x.r.justificativa).slice(0, 260), (process.env.GABARITO_MODEL || "claude-opus-5") + "+catalogo-integral"]);
    n++;
  }
  console.log(`
PERSISTE=1 — ${n} rótulos do gabarito promovidos de "nenhum" para o código achado sem teto de recall`);
}

const achou = res.filter((x) => x.r && x.r.codigo > 0 && nomePorCodigo.has(x.r.codigo));
const naoTem = res.filter((x) => x.r && x.r.codigo === 0);
const erros = res.filter((x) => x.erro || (x.r && x.r.codigo > 0 && !nomePorCodigo.has(x.r.codigo)));

console.log(`\n═══ VEREDITO sobre os ${alvos.length} "nenhum" do gabarito de serviço ═══`);
console.log(`(a) o código EXISTE e a busca não trouxe ... ${achou.length}  → defeito de RETRIEVER`);
console.log(`(b) o CATSER não tem código adequado ...... ${naoTem.length}  → defeito de CATÁLOGO`);
console.log(`    inconclusivos (erro/código inválido) .. ${erros.length}`);
if (achou.length) {
  console.log(`\n  os que a busca PERDEU (o reranker teria o que rerankear):`);
  achou.slice(0, 12).forEach((x) => console.log(`    "${x.chave.slice(0, 46)}" → ${x.r.codigo} ${String(nomePorCodigo.get(x.r.codigo)).slice(0, 46)}`));
}
if (naoTem.length) {
  console.log(`\n  os que o CATSER realmente NÃO cobre:`);
  naoTem.slice(0, 12).forEach((x) => console.log(`    "${x.chave.slice(0, 60)}" (n=${x.n_itens})`));
}
await db.end();
