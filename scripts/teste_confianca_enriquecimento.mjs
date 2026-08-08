// ⚠️ ESTE TESTE DOCUMENTA UMA TENTATIVA REVERTIDA — ele NÃO trava o comportamento de produção.
//   node scripts/teste_confianca_enriquecimento.mjs
//
// Em 08/ago tentei usar o grau MEDIDO do recorte como TETO da confiança, sob a hipótese de que
// convergência entre documentos com o mesmo defeito não é evidência (edital, TR e ETP repetem a mesma
// tabela, e o mesmo recorte errado aparece nos três). A regra é conceitualmente defensável e os casos
// abaixo mostram que ela se comporta como desenhada.
// FOI REVERTIDA PORQUE PIOROU O NÚMERO, e porque a premissa que a motivou era falsa: eu media "descrição
// truncada" pelo percentual que começa com letra minúscula, e `norm()` faz toLowerCase — 100% começa
// minúsculo. Medindo do jeito certo, em 1.760.783 linhas:
//     antigo/alta 81,5% contêm o item   ·   com o teto: 77,7%
// O teto rebaixava linhas que estavam certas. Fica aqui para não ser reinventado sem medir.
//
// O QUE SEGUE EM ABERTO e este teste NÃO resolve: no carimbo atual, `media` acerta MAIS que `alta`
// (86,7% × 81,5%) — a escala está invertida. Isso pede tratamento próprio, com medição própria.
import { grauDaNota } from "./escolhe_recorte.mjs";

const RANK = { alta: 3, media: 2, baixa: 1 };
// regra da TENTATIVA (não é a de produção — produção usa consolida() sem o terceiro argumento)
const consolida = (n, base, grauRecorte = "alta") => {
  if (n === 0) return "ausente";
  const bruto = n >= 3 ? "alta" : (n >= 2 && RANK[base] >= 2) ? "alta" : base;
  return RANK[bruto] <= RANK[grauRecorte] ? bruto : grauRecorte;
};

const CASOS = [
  // [rótulo, nDocs, confCasamento, grauRecorte, esperado]
  ["3 docs convergem MAS o recorte é ruim → NÃO vira alta", 3, "alta", "baixa", "baixa"],
  ["3 docs convergem e recorte médio → limitado a média",   3, "alta", "media", "media"],
  ["3 docs convergem e recorte bom → alta",                 3, "alta", "alta",  "alta"],
  ["2 docs + casamento médio, recorte bom → alta",          2, "media", "alta", "alta"],
  ["2 docs + casamento médio, recorte ruim → baixa",        2, "media", "baixa","baixa"],
  ["1 doc, casamento alto, recorte bom → alta",             1, "alta", "alta",  "alta"],
  ["1 doc, casamento alto, recorte médio → média",          1, "alta", "media", "media"],
  ["nenhum documento → ausente",                            0, "alta", "alta",  "ausente"],
];

let falhas = 0;
for (const [nome, n, base, grau, esperado] of CASOS) {
  const obtido = consolida(n, base, grau);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${nome.padEnd(56)} → ${obtido}${ok ? "" : ` (esperado ${esperado})`}`);
}

// a escala da nota: cobertura*10 + começo*3 + concisão
const NOTAS = [
  ["cobertura total + começa no item → alta", 13, "alta"],
  ["metade do item + começa nele → alta",      8, "alta"],
  ["parte do item, começo errado → média",     5, "media"],
  ["quase nada do item → baixa",               2, "baixa"],
];
for (const [nome, nota, esperado] of NOTAS) {
  const obtido = grauDaNota(nota);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${nome.padEnd(56)} → ${obtido}${ok ? "" : ` (esperado ${esperado})`}`);
}

console.log(falhas ? `\n✖ ${falhas} falharam` : `\n✔ todos passaram`);
process.exit(falhas ? 1 : 0);
