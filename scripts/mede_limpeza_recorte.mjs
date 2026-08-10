// MEDIÇÃO — a limpeza de ruído tabular melhora o recorte, ou só parece melhorar?
// Não roda o pipeline inteiro: pega o que JÁ foi gravado (o recorte vencedor de cada item) e compara a
// nota do texto como está com a nota do mesmo texto limpo, contra o gabarito (`descricao_api`).
// É a comparação honesta: mesma âncora, mesmo bloco, muda só a limpeza.
// node scripts/mede_limpeza_recorte.mjs [N]
import fs from "fs"; import pg from "pg";
import { limpaRuidoTabular } from "./recorte_bloco.mjs";

const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const N = Number(process.argv[2] || 4000);

const normP = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote".split(" "));
const sig = (s) => [...new Set(normP(s).split(" ").filter((w) => w.length >= 5 && !STOP.has(w)))];

// MESMA nota do roteador em produção, INCLUSIVE o termo de número — se a medição usar uma régua e a
// produção outra, o resultado medido não é o que vai acontecer. Foi assim que a primeira versão passou.
function nota(desc, toks, nums = []) {
  if (!desc || !toks.length) return -1;
  const d = normP(desc);
  const achou = toks.filter((t) => d.includes(t)).length;
  if (achou === 0) return 0;
  const cobertura = achou / toks.length;
  const pos = d.indexOf(toks.find((t) => d.includes(t)));
  const comeco = pos >= 0 && pos <= Math.max(20, d.length * 0.25) ? 1 : 0;
  const concisao = Math.max(0, 1 - d.length / 1200);
  const numero = nums.length ? nums.filter((x) => d.includes(x)).length / nums.length : 1;
  return Math.max(0.01, cobertura * 10 + comeco * 3 + concisao - (1 - numero) * 6);
}
const comecaCerto = (desc, toks) => {
  const d = normP(desc); const t = toks.find((x) => d.includes(x));
  if (!t) return false; const p = d.indexOf(t);
  return p >= 0 && p <= Math.max(20, d.length * 0.25);
};
const contemN = (desc, toks) => { const d = normP(desc); return toks.filter((t) => d.includes(t)).length; };

// ⚠️ MÉTRICA QUE FALTAVA — e sem ela a primeira versão do limpador passou aprovada apagando o modelo.
// `sig()` só guarda palavras com 5+ caracteres, então "6201" (o modelo do rolamento) não entra na nota:
// o limpador apagava a especificação e o placar registrava MELHORA. Aqui se mede o que a nota não vê —
// quantos dos números/códigos que o item DECLARA sobreviveram ao recorte.
const numsDoItem = (s) => [...new Set(String(s).toLowerCase().match(/\b\d{2,}[a-z]*\b/g) || [])];
const numsPreservados = (desc, nums) => {
  if (!nums.length) return null;
  const d = normP(desc);
  return nums.filter((x) => d.includes(x)).length / nums.length;
};

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });
const rows = (await db.query(`SELECT descricao_api, descricao_documento, metodo
  FROM app.item_enriquecimento
  WHERE descricao_documento IS NOT NULL AND descricao_api IS NOT NULL AND length(descricao_documento) >= 40
  ORDER BY md5(cnpj || seq::text) LIMIT $1`, [N])).rows;

let n = 0;
const A = { comeca: 0, contem2: 0, nada: 0, soma: 0, len: 0, num: 0, numN: 0 };
const B = { comeca: 0, contem2: 0, nada: 0, soma: 0, len: 0, num: 0, numN: 0 };
let melhorou = 0, piorou = 0, igual = 0, limpouNada = 0, perdeuNumero = 0;
const exemplos = [], danos = [];

for (const r of rows) {
  const toks = sig(r.descricao_api);
  if (!toks.length) continue;
  const antes = r.descricao_documento;
  const nums = numsDoItem(r.descricao_api);
  const depois = limpaRuidoTabular(antes, r.descricao_api);
  n++;
  { const pA = numsPreservados(antes, nums); if (pA != null) { A.num += pA; A.numN++; } }
  { const pB = numsPreservados(depois || antes, nums); if (pB != null) { B.num += pB; B.numN++; }
    const pA = numsPreservados(antes, nums);
    if (pA != null && pB != null && pB < pA) { perdeuNumero++;
      if (danos.length < 4) danos.push({ api: r.descricao_api, antes, depois }); } }
  const nA = nota(antes, toks, nums);
  A.comeca += comecaCerto(antes, toks) ? 1 : 0;
  A.contem2 += contemN(antes, toks) >= 2 ? 1 : 0;
  A.nada += contemN(antes, toks) === 0 ? 1 : 0;
  A.soma += nA; A.len += antes.length;
  if (!depois) { limpouNada++; B.nada += contemN(antes, toks) === 0 ? 1 : 0; B.soma += nA; B.len += antes.length;
    B.comeca += comecaCerto(antes, toks) ? 1 : 0; B.contem2 += contemN(antes, toks) >= 2 ? 1 : 0; continue; }
  const nB = nota(depois, toks, nums);
  // o roteador fica com o MAIOR: a limpeza só entra se ganhar
  const venc = nB > nA ? depois : antes;
  const nV = Math.max(nA, nB);
  B.comeca += comecaCerto(venc, toks) ? 1 : 0;
  B.contem2 += contemN(venc, toks) >= 2 ? 1 : 0;
  B.nada += contemN(venc, toks) === 0 ? 1 : 0;
  B.soma += nV; B.len += venc.length;
  if (nB > nA + 0.01) { melhorou++; if (exemplos.length < 5 && contemN(depois, toks) >= 2) exemplos.push({ api: r.descricao_api, antes, depois }); }
  else if (nB < nA - 0.01) piorou++; else igual++;
}

const pct = (x) => `${(100 * x / n).toFixed(1)}%`;
console.log(`\nAMOSTRA: ${n} itens com descrição vinda de documento\n`);
console.log(`                        SEM limpeza     COM limpeza (o roteador fica com o melhor)`);
console.log(`  começa no item certo     ${pct(A.comeca).padStart(6)}          ${pct(B.comeca).padStart(6)}`);
console.log(`  contém >=2 palavras      ${pct(A.contem2).padStart(6)}          ${pct(B.contem2).padStart(6)}`);
console.log(`  NÃO contém nada          ${pct(A.nada).padStart(6)}          ${pct(B.nada).padStart(6)}`);
console.log(`  nota média               ${(A.soma / n).toFixed(2).padStart(6)}          ${(B.soma / n).toFixed(2).padStart(6)}`);
console.log(`  tamanho médio (car.)     ${Math.round(A.len / n).toString().padStart(6)}          ${Math.round(B.len / n).toString().padStart(6)}`);
console.log(`  nº/código do item vivo   ${(100 * A.num / A.numN).toFixed(1).padStart(5)}%          ${(100 * B.num / B.numN).toFixed(1).padStart(5)}%   <- a métrica que faltava`);
console.log(`\n  a limpeza VENCEU em ${melhorou} (${pct(melhorou)}) · perdeu em ${piorou} (${pct(piorou)}) · empatou em ${igual}`);
console.log(`  não sobrou texto utilizável em ${limpouNada} (${pct(limpouNada)}) — nesses o sujo continua`);
console.log(`  APAGOU número/código que o item declara: ${perdeuNumero} (${pct(perdeuNumero)})`);
for (const d of danos) {
  console.log(`\n  [DANO] API   : ${d.api.slice(0, 80)}`);
  console.log(`         antes : ${d.antes.slice(0, 110)}`);
  console.log(`         depois: ${String(d.depois).slice(0, 110)}`);
}
for (const e of exemplos) {
  console.log(`\n  API   : ${e.api.slice(0, 80)}`);
  console.log(`  antes : ${e.antes.slice(0, 130)}`);
  console.log(`  depois: ${e.depois.slice(0, 130)}`);
}
await db.end();
