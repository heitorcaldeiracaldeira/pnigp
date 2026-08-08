// RECORTE DO BLOCO DE SPEC — a fronteira do trecho que descreve UM item dentro do documento.
// Módulo próprio (e não uma função solta no enriquece_item_documento) porque o teste precisa exercitar
// exatamente ESTA função: cópia colada em teste é teste que passa enquanto o código de produção muda.
//
// ═══ O QUE ESTAVA ERRADO, MEDIDO EM 08/ago ═══
// Das 1.749.931 descrições vindas de documento, 1.426.043 (81,5%) começavam com letra MINÚSCULA — e a
// consulta de controle, as que começam com maiúscula, voltou VAZIA. Nenhuma. Não era estilo:
//     BRUNFELSIA UNIFLORA     → "a grandiflora manaca da flor grande 145 r 9 77 r 1 416 65 9"
//     DISJUNTOR BIFÁSICO 10 A → "egundo nbr iec 60898 3 2021 36 un 20 31 38 627 60 disjuntor"
// "egundo" é "segundo" sem o s. Duas causas somadas:
//   1. o início recuava um número FIXO de caracteres, caindo no meio de uma palavra;
//   2. nada impedia esse recuo de atravessar a âncora do item ANTERIOR, e então vinham os valores dele
//      grudados — que depois contaminam preço normalizado e CATMAT.
// E 58% dessas linhas estavam rotuladas como confiança ALTA: o rótulo não media o que prometia.
//
// ⚠️ O QUE ISTO NÃO CONSERTA: a mistura de COLUNAS. O texto do edital ainda vem sem geometria (fluxo de
// linha única), então descrição, quantidade e valor seguem vizinhos no mesmo fluxo. Isso só a re-extração
// resolve. Aqui se conserta fronteira: truncamento de palavra e invasão do item vizinho.
export const BLOCO_CAP_PADRAO = 2500;   // teto do bloco (era 600 → truncava item multi-atributo)
export const RECUO_PADRAO = 60;         // contexto antes da âncora: nº do item, unidade

export function recortaBloco(docNorm, off, offs, cap = BLOCO_CAP_PADRAO, recuo = RECUO_PADRAO) {
  if (off == null || !docNorm) return null;
  const nexts = offs.filter((o) => o != null && o > off);
  const prevs = offs.filter((o) => o != null && o < off);
  const fim0 = Math.min(off + cap, nexts.length ? Math.min(...nexts) : off + cap);

  // ── INÍCIO: o recuo só acontece se couber INTEIRO depois da âncora anterior.
  // Se não couber, começa-se na própria âncora do item. Perder contexto é barato; misturar dois itens não
  // é — o item vizinho traz valores que viram preço e CATMAT errados.
  const piso = prevs.length ? Math.max(...prevs) : -1;
  const recuado = off - recuo;
  let ini = (piso >= 0 && recuado <= piso) ? off : Math.max(0, recuado);

  // fronteira de palavra no INÍCIO: se caiu no meio, AVANÇA até o próximo espaço — perde caractere, nunca
  // inventa. Só avança se o espaço estiver perto; senão manteria e engoliria a descrição inteira.
  if (ini > 0 && /\S/.test(docNorm[ini - 1] || "") && /\S/.test(docNorm[ini] || "")) {
    const esp = docNorm.indexOf(" ", ini);
    if (esp !== -1 && esp - ini <= 40) ini = esp + 1;
  }
  // fronteira de palavra no FIM: recua até o espaço anterior, pelo mesmo motivo.
  let fim = fim0;
  if (fim < docNorm.length && /\S/.test(docNorm[fim] || "") && /\S/.test(docNorm[fim - 1] || "")) {
    const esp = docNorm.lastIndexOf(" ", fim);
    if (esp !== -1 && fim - esp <= 40) fim = esp;
  }
  if (fim <= ini) return null;
  const b = docNorm.slice(ini, fim).replace(/\s+/g, " ").trim();
  return b.length >= 12 ? b : null;
}
