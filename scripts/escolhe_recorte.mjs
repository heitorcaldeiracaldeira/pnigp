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
import { recortaBloco, recortaPorLinha, recortaPorCelula, limpaRuidoTabular, BLOCO_CAP_PADRAO, RECUO_PADRAO } from "./recorte_bloco.mjs";

const normP = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote".split(" "));
const sig = (s) => [...new Set(normP(s).split(" ").filter((w) => w.length >= 5 && !STOP.has(w)))];

// NOTA de um candidato contra o item. Não é "parece bom": é quanto do item está ali e onde começa.
//  · cobertura — fração das palavras significativas do item presentes no recorte (peso maior)
//  · começo    — a primeira palavra do item aparece nos primeiros 25% do recorte
//  · concisão  — desempate suave: entre dois que cobrem igual, o mais curto tem menos lixo em volta
// ⚠️ A NOTA ERA CEGA A NÚMERO — e isso não é detalhe neste domínio.
// `sig()` só guarda palavras com 5+ caracteres, então "6201" (modelo do rolamento), "399" (Paradigm MMT
// 399), "60898" (NBR IEC) NÃO entravam na conta. Medido em 10/ago: um candidato que apagava o número do
// modelo marcava +4 pontos de "começa certo" e a nota registrava MELHORA — a régua não via o dano.
// Em compra pública o número costuma ser o que distingue o item (bitola, modelo, norma, potência). Ele
// entra na nota com peso próprio, para que nenhum método vença destruindo especificação.
const numsDe = (s) => [...new Set(String(s).toLowerCase().match(/\b\d{2,}[a-z]*\b/g) || [])];

function nota(desc, toks, nums = []) {
  if (!desc || !toks.length) return -1;
  const d = normP(desc);
  const achou = toks.filter((t) => d.includes(t)).length;
  if (achou === 0) return 0;                                  // não contém nada do item: nota mínima
  const cobertura = achou / toks.length;
  const pos = d.indexOf(toks.find((t) => d.includes(t)));
  const comeco = pos >= 0 && pos <= Math.max(20, d.length * 0.25) ? 1 : 0;
  const concisao = Math.max(0, 1 - d.length / 1200);
  // ⚠️ ENTRA COMO PENALIDADE, NÃO COMO BÔNUS — e a diferença não é estética.
  // Na primeira versão era `+ numero*4`. Como item SEM número recebe numero=1, ele ganhava 4 pontos de
  // graça: "quase nada do item" ia a 5,5 e virava MÉDIA, e todos os cortes de `grauDaNota` tiveram de ser
  // reescalados — o que quebrou dois casos do teste de confiança, com razão. Penalidade não mexe na escala:
  // item sem número fica idêntico à fórmula antiga (e os cortes 8/4 seguem valendo); só quem PERDE número
  // declarado é punido, até 6 pontos — o bastante para superar os 3 de "começa certo" e impedir que um
  // recorte vença destruindo a especificação.
  const numero = nums.length ? nums.filter((x) => d.includes(x)).length / nums.length : 1;
  // ⚠️ PISO ACIMA DE ZERO. A penalidade pode empurrar a nota para NEGATIVO (cobertura baixa + todos os
  // números perdidos ≈ −4,5), e "não contém nada do item" vale 0 pelo retorno lá em cima. Sem este piso,
  // o nada venceria o pouco-e-sujo — medido: "NÃO contém nada" subia de 1,3% para 1,4%.
  // Conter alguma coisa do item é sempre melhor que não conter nada; a penalidade ordena entre os que
  // contêm, não abre a porta para o que não contém.
  return Math.max(0.01, cobertura * 10 + comeco * 3 + concisao - (1 - numero) * 6);
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

  // 5) A VERSÃO LIMPA DE CADA UM — não substitui, CONCORRE.
  // O bloco costuma estar certo e sujo: a descrição do item ilhada entre colunas de preço, quantidade e
  // código da mesma linha da tabela. Limpar não pode aumentar a cobertura (só remove texto), então um
  // candidato limpo só vence se mantiver as palavras do item E melhorar começo/concisão — que é exatamente
  // a diferença entre "o item está em algum lugar aí dentro" e "o recorte É o item".
  // Se a limpeza levar junto algo que importa, a cobertura cai e o sujo vence. O gabarito decide, não eu.
  for (const c of [...cands]) {
    // `descricaoItem` entra na limpeza para PROTEGER o que o item declara: número de modelo (6201), norma
    // (60898), bitola. Sem isso o limpador apaga a especificação achando que é coluna de tabela — e a nota
    // não reclama, porque só conta palavras de 5+ letras e é cega a "6201".
    const limpo = limpaRuidoTabular(c.desc, descricaoItem);
    if (limpo && limpo !== c.desc.toLowerCase()) cands.push({ desc: limpo, metodo: `${c.metodo}+limpo` });
  }

  const nums = numsDe(descricaoItem);
  let melhor = null;
  for (const c of cands) {
    const n = nota(c.desc, toks, nums);
    if (!melhor || n > melhor.nota) melhor = { ...c, nota: +n.toFixed(2) };
  }
  // Se NENHUM candidato contém uma palavra do item, o item não está naquele documento: não se escolhe o
  // "menos ruim". Devolver lixo com carimbo de confiança é o que contamina preço e CATMAT em silêncio.
  if (!melhor || melhor.nota <= 0) return null;
  return { ...melhor, grau: grauDaNota(melhor.nota) };
}

// ═══ O GRAU DO RECORTE — A CONFIANÇA PRECISA MEDIR O TEXTO, NÃO SÓ A CONVERGÊNCIA ═══
// Medido em 08/ago: 929.298 linhas estavam carimbadas com confiança ALTA e tinham a descrição recortada
// no lugar errado — 58% de todas as "alta". O carimbo media convergência entre documentos ("três docs
// concordam") e nunca olhava o texto que estava sendo gravado.
// E convergência de documentos com o MESMO defeito não é evidência: o edital, o TR e o ETP costumam
// repetir a mesma tabela, então o mesmo recorte errado aparece nos três e a regra o promovia a alta.
// A nota já existe — é ela que escolhe o vencedor entre os métodos. Aqui ela vira grau, e o grau passa a
// ser TETO da confiança: convergência pode elevar dentro do teto, nunca acima dele.
//   nota = cobertura*10 + começo*3 + concisão − perda_de_número*6
// Os cortes seguem os originais (8 e 4) DE PROPÓSITO: o termo de número é penalidade, então item sem
// número declarado pontua exatamente como antes e a escala não se move. Cheguei a reescalar para 10,5/5,5
// quando o termo era bônus — e o teste de confiança reprovou dois casos, com razão. A régua ficou.
export function grauDaNota(nota) {
  if (nota >= 8) return "alta";      // cobre boa parte do item E começa nele
  if (nota >= 4) return "media";     // cobre parte do item
  return "baixa";                    // contém pouco do item: pode ser vizinho, cabeçalho, sobra
}
