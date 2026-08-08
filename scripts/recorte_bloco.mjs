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

// ═══ QUANDO HÁ GEOMETRIA, A FRONTEIRA É A LINHA — NÃO A CONTAGEM DE CARACTERES ═══
// Medido em 08/ago: mexer no tamanho do recuo (60 → 0) não mudou nada, porque o método é que estava errado.
// A janela de N caracteres é sempre arbitrária num texto de tabela: cai no cabeçalho, no item anterior, no
// meio do valor. Toda ferramenta madura do ramo — pdfplumber, Camelot, pdf.js-extract (`pageToLines`) —
// resolve o mesmo problema agrupando por Y e cortando por LINHA/CÉLULA.
// Nós já produzimos essa geometria (`pdf_layout.mjs`, 198.106 documentos convertidos); o que faltava era
// consumi-la. Se o texto tem `\n`, ele veio com geometria: recorta-se da linha da âncora até a linha do
// próximo item. Se não tem (documento ainda achatado), cai no modo antigo por janela — que é ruim, mas é
// o que existe até a re-extração chegar nele.
// ═══ RECORTE POR CÉLULA — A FRONTEIRA QUE FALTAVA ═══
// Ordem do Heitor, 08/ago: "recortar a célula, não a linha nem a janela".
// A célula JÁ ESTAVA no texto e nós a apagávamos. `pdf_layout.mjs` (06/ago) emite TAB quando o vão entre
// dois blocos passa do limite de coluna — medido: 193.674 dos 199.499 documentos-fonte com geometria
// trazem TAB, média de 279 por documento. E `norm()` fazia `[^a-z0-9]+ → " "`, apagando TAB e \n de uma
// vez: a coluna era reconstruída a custo de 648 mil downloads e destruída na primeira função do consumidor.
//
// POR QUE A CÉLULA E NÃO A LINHA: medido em 500 editais, cortar por linha acertava mais o COMEÇO (41,0%
// contra 35,6%) e errava mais o CONTEÚDO (24,6% sem nada do item, contra 20,6%) — porque a linha física
// carrega a linha inteira da tabela, com número, unidade, quantidade e valor grudados na descrição. A
// célula isola a coluna: pega só o texto entre os dois TABs que cercam a âncora.
// É o que pdfplumber e Camelot fazem, e o passo que faltava sobre o `pdf_layout`.
//
// ⚠️ Quando a célula é curta demais (a âncora caiu na coluna do número ou da unidade), estende-se para as
// células vizinhas da MESMA linha até formar um trecho utilizável — a descrição às vezes é quebrada em
// duas colunas pelo gerador do PDF. Nunca atravessa \n: linha vizinha é outro item.
export function recortaPorCelula(docNorm, off, cap = BLOCO_CAP_PADRAO) {
  const iniLinha = docNorm.lastIndexOf("\n", off) + 1;
  let fimLinha = docNorm.indexOf("\n", off);
  if (fimLinha === -1) fimLinha = docNorm.length;
  const linha = docNorm.slice(iniLinha, fimLinha);
  const rel = off - iniLinha;                       // posição da âncora dentro da linha
  const celulas = [];
  let p = 0;
  for (const c of linha.split("\t")) { celulas.push({ txt: c, ini: p, fim: p + c.length }); p += c.length + 1; }
  let i = celulas.findIndex((c) => rel >= c.ini && rel <= c.fim);
  if (i === -1) return null;
  // cresce para os lados enquanto o trecho for curto demais para ser uma descrição
  let a = i, b = i;
  let txt = celulas[i].txt.trim();
  while (txt.length < 25 && (a > 0 || b < celulas.length - 1)) {
    if (b < celulas.length - 1) b++; else if (a > 0) a--;
    txt = celulas.slice(a, b + 1).map((c) => c.txt.trim()).filter(Boolean).join(" ").trim();
    if (txt.length >= cap) break;
  }
  txt = txt.replace(/\s+/g, " ").trim().slice(0, cap);
  return txt.length >= 12 ? txt : null;
}

export function recortaPorLinha(docNorm, off, offs, cap = BLOCO_CAP_PADRAO) {
  const iniLinha = docNorm.lastIndexOf("\n", off) + 1;          // começo da linha onde a âncora caiu
  const nexts = offs.filter((o) => o != null && o > off);
  const limite = nexts.length ? Math.min(...nexts) : off + cap;
  // vai até o começo da linha do PRÓXIMO item (nunca invade a linha dele), com o teto de `cap`
  let fim = nexts.length ? docNorm.lastIndexOf("\n", limite) : docNorm.indexOf("\n", off + cap);
  if (fim <= iniLinha) fim = docNorm.indexOf("\n", off);         // item de uma linha só
  if (fim === -1 || fim > iniLinha + cap) fim = Math.min(iniLinha + cap, docNorm.length);
  const b = docNorm.slice(iniLinha, fim).replace(/\s+/g, " ").trim();
  return b.length >= 12 ? b : null;
}

// ⚠️ MEDIDO E REPROVADO EM 08/ago — fica atrás de flag, não como padrão.
// A hipótese era boa e é o que pdfplumber/Camelot/pdf.js-extract fazem: cortar por LINHA, não por janela.
// Testado em 1.251 editais, contra 6.003 no baseline, com a métrica "o recorte contém o começo da descrição
// que a API declara":
//                       janela (atual)   por linha
//   começa no item certo     43,6%          39,0%
//   contém >=2 palavras      73,3%          59,9%
//   não contém nada          15,9%          22,5%
// PIOR nas três. O motivo está na amostra: a linha que `pdf_layout` recupera é a linha FÍSICA da página, e
// ela não é a linha LÓGICA da tabela — mistura cabeçalho/rodapé com o item, e a descrição de um item se
// espalha por várias linhas físicas. Agrupar por Y devolve a geometria da PÁGINA, não a estrutura da
// TABELA. Para valer, faltaria o passo que essas ferramentas têm e nós não: detectar as COLUNAS (limites
// de X) e ler a célula da coluna "descrição" — e não a linha inteira.
// Fica acessível por RECORTE_LINHA=1 para quem retomar isso com a detecção de coluna feita.
export function recortaBloco(docNorm, off, offs, cap = BLOCO_CAP_PADRAO, recuo = RECUO_PADRAO) {
  if (off == null || !docNorm) return null;
  // ⚠️ CÉLULA SEM CONFIRMAÇÃO É O PIOR DOS TRÊS — por isso está DESLIGADA por padrão aqui.
  // Medido em 500 editais: recortar a célula pela âncora do TF-IDF deu 36,7% de recortes sem NENHUMA
  // palavra do item, contra 20,6% da janela. A razão é que a célula é precisa: quando a âncora erra, o
  // recorte não tem nada a ver com o item, enquanto a janela — por pegar tudo em volta — quase sempre
  // arrasta algum pedaço certo junto com o lixo.
  // A célula só rende COM confirmação, e essa via é o `casa_por_celula.mjs`: lá o número do item ancora e
  // a própria célula tem de provar que pertence ao item. Aqui, no fallback, a janela mede melhor.
  if (process.env.RECORTE_CELULA === "1" && docNorm.includes("\t")) {
    const c = recortaPorCelula(docNorm, off, cap);
    if (c) return c;
  }
  if (process.env.RECORTE_LINHA === "1" && docNorm.includes("\n")) return recortaPorLinha(docNorm, off, offs, cap);
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
