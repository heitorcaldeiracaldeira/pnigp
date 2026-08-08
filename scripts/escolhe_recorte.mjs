// ROTEADOR DE RECORTE — todos os métodos concorrem, vence o que MEDE melhor naquele documento.
//
// ═══ POR QUE NÃO EXISTE UM MÉTODO ÚNICO ═══
// Ordem do Heitor, 08/ago: "casa todos os métodos até achar o melhor para cada tipo de edital, não precisa
// ter apenas um". É a mesma lei do roteamento da extração (local × modalidade × gerador) aplicada aqui: o
// documento é que decide, não uma escolha global.
// E a medição já dizia isso. Sobre os mesmos 500 editais, nenhum método vence em tudo:
//                              começa certo   contém >=2   não contém nada
//   janela (proximidade)          34,7%         60,5%          20,5%
//   linha (pdf_layout, por Y)     41,0%         57,4%          24,6%
//   célula confirmada (nº item)   58,0%*        61,1%*         17,9%*     (* isolado em EDITAL)
// A janela erra por EXCESSO — arrasta o vizinho junto, então quase sempre contém algo do item, sujo.
// A célula erra por PRECISÃO — quando a âncora erra, o recorte não tem nada a ver. A linha fica no meio.
// Aplicar a célula a TODOS os documentos derrubou o conjunto (60,5% → 46,4%), porque em DFD, ETP e minuta
// "linha que começa com número" é cláusula, anexo, cronograma — não item.
//
// ═══ O GABARITO QUE PERMITE ESCOLHER ═══
// Não precisamos adivinhar qual método serve a qual edital: `itens_sc.descricao` (o que a API declara) é
// gabarito. Cada método propõe um recorte, e a pontuação é contra o item — quantas palavras significativas
// ele contém e quão cedo a primeira aparece. Vence o de maior nota; empate fica com o mais específico.
// O método vencedor é GRAVADO, então o padrão por tipo de documento deixa de ser suposição e vira dado.
import { recortaBloco, recortaPorLinha, recortaPorCelula, BLOCO_CAP_PADRAO, RECUO_PADRAO } from "./recorte_bloco.mjs";

const normP = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote".split(" "));
const sig = (s) => [...new Set(normP(s).split(" ").filter((w) => w.length >= 5 && !STOP.has(w)))];

// NOTA de um candidato contra o item. Não é "parece bom": é quanto do item está ali e onde começa.
//  · cobertura — fração das palavras significativas do item presentes no recorte (peso maior)
//  · começo    — a primeira palavra do item aparece nos primeiros 25% do recorte
//  · concisão  — desempate suave: entre dois que cobrem igual, o mais curto tem menos lixo em volta
function nota(desc, toks) {
  if (!desc || !toks.length) return -1;
  const d = normP(desc);
  const achou = toks.filter((t) => d.includes(t)).length;
  if (achou === 0) return 0;                                  // não contém nada do item: nota mínima
  const cobertura = achou / toks.length;
  const pos = d.indexOf(toks.find((t) => d.includes(t)));
  const comeco = pos >= 0 && pos <= Math.max(20, d.length * 0.25) ? 1 : 0;
  const concisao = Math.max(0, 1 - d.length / 1200);
  return cobertura * 10 + comeco * 3 + concisao;
}

/**
 * Gera um candidato por método, pontua contra o item e devolve o vencedor.
 * @param celulaConfirmada resultado de casa_por_celula (já validado pelo número do item) ou null
 * @returns { desc, metodo, nota } — metodo identifica quem venceu, para virar dado e não suposição
 */
export function escolheRecorte(docNorm, off, offs, descricaoItem, celulaConfirmada = null, cap = BLOCO_CAP_PADRAO) {
  const toks = sig(descricaoItem);
  const cands = [];
  // 1) CÉLULA CONFIRMADA pelo número do item — a única que não depende da âncora do TF-IDF
  if (celulaConfirmada?.desc) cands.push({ desc: celulaConfirmada.desc, metodo: `celula_num_${celulaConfirmada.confirmacao}` });
  // 2) CÉLULA pela âncora — precisa, mas refém da âncora
  if (docNorm.includes("\t")) { const c = recortaPorCelula(docNorm, off, cap); if (c) cands.push({ desc: c, metodo: "celula" }); }
  // 3) LINHA — a linha física da tabela
  if (docNorm.includes("\n")) { const l = recortaPorLinha(docNorm, off, offs, cap); if (l) cands.push({ desc: l, metodo: "linha" }); }
  // 4) JANELA — o método antigo, que erra por excesso e por isso raramente fica em zero
  const j = recortaBloco(docNorm, off, offs, cap, RECUO_PADRAO); if (j) cands.push({ desc: j, metodo: "janela" });
  if (!cands.length) return null;

  let melhor = null;
  for (const c of cands) {
    const n = nota(c.desc, toks);
    if (!melhor || n > melhor.nota) melhor = { ...c, nota: +n.toFixed(2) };
  }
  // Se NENHUM candidato contém uma palavra do item, o item não está naquele documento: não se escolhe o
  // "menos ruim". Devolver lixo com carimbo de confiança é o que contamina preço e CATMAT em silêncio.
  if (!melhor || melhor.nota <= 0) return null;
  return melhor;
}
