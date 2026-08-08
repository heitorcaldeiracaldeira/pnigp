// CASAMENTO POR LINHA DE TABELA — a âncora determinística que faltava.
//
// ═══ POR QUE ISTO EXISTE ═══
// Medido em 08/ago sobre os mesmos 500 editais, com os três recortes disponíveis:
//                       janela   linha   célula
//   começa no item certo  35,6%   41,0%   37,0%
//   contém >=2 palavras   60,5%   57,4%   48,1%
//   NÃO contém nada       20,6%   24,6%   36,7%
// Três métodos, o mesmo teto. Isso não é problema de fronteira — é a ÂNCORA caindo no item errado. O
// casador atual pontua por TF-IDF numa janela de 200 caracteres, e num edital com produtos da mesma
// família (bisnaguinha × pão de forma, aspirador × batedeira) ele ancora no vizinho. Nenhuma fronteira
// conserta âncora errada: a célula só torna o erro mais limpo e mais evidente (36,7% sem nada do item).
//
// ═══ O SINAL QUE NÃO ESTÁVAMOS USANDO ═══
// A tabela do edital declara o número do item na PRIMEIRA célula da linha. E `itens_sc.numero` é o número
// da ORIGEM — o PNCP o recebe do mesmo sistema que gerou o PDF. Isso é uma chave, não uma heurística.
// `pdf_layout.mjs` já entrega a fronteira: \n separa linha, \t separa coluna (193.674 documentos com TAB).
// Aqui as duas coisas se encontram: acha-se a LINHA cujo número bate com o item, confirma-se por CONTEÚDO,
// e devolve-se a célula de descrição daquela linha.
//
// ⚠️ A CONFIRMAÇÃO POR CONTEÚDO NÃO É OPCIONAL. Número sozinho casaria "item 3" com a linha 3 de qualquer
// tabela do documento — inclusive a de um anexo ou de outro lote. Exige-se pelo menos uma palavra
// significativa do item na linha. Sem isso, devolve null: é melhor NÃO TER descrição do que ter a do
// vizinho, porque a descrição errada contamina preço normalizado e CATMAT em silêncio.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("para com sem por que dos das uma tipo cor material medida medidas unidade produto qualidade minimo maximo minima maxima aproximado aproximada conforme referencia marca modelo caracteristicas adicionais cada embalagem pacote unid serv item lote".split(" "));
const sig = (s) => [...new Set(norm(s).split(" ").filter((w) => w.length >= 5 && !STOP.has(w)))];

// uma LINHA de tabela: tem \t (colunas) e a primeira célula é um número curto (o nº do item)
function linhasDeTabela(docNorm) {
  const out = [];
  let pos = 0;
  for (const linha of docNorm.split("\n")) {
    const ini = pos; pos += linha.length + 1;
    if (!linha.includes("\t")) continue;
    const cels = linha.split("\t");
    const m = /^\s*0*(\d{1,4})\s*$/.exec(cels[0]);          // 1ª célula = só um número
    if (!m) continue;
    out.push({ numero: Number(m[1]), ini, cels, linha });
  }
  return out;
}

// ═══ A CÉLULA DE DESCRIÇÃO É A QUE MAIS CASA COM O ITEM — NÃO A MAIS LONGA ═══
// A primeira versão escolhia a célula com mais letras e CONFIRMAVA contra a linha inteira. O descompasso
// deixava passar 22,1% de recortes sem nenhuma palavra do item: a confirmação achava a palavra numa célula
// e devolvia outra. Agora a mesma célula que é devolvida é a que precisa provar que pertence ao item.
function melhorCelula(cels, toks) {
  let melhor = null, melhorAcerto = -1, melhorLetras = 0;
  for (let i = 1; i < cels.length; i++) {
    const c = cels[i].trim();
    const letras = (c.match(/[a-z]/g) || []).length;
    if (letras < 8) continue;                          // célula de número/valor/unidade não é descrição
    const alvo = norm(c);
    const acerto = toks.filter((t) => alvo.includes(t)).length;
    // mais acertos vence; empate desempata pela célula mais rica em texto
    if (acerto > melhorAcerto || (acerto === melhorAcerto && letras > melhorLetras)) {
      melhorAcerto = acerto; melhorLetras = letras; melhor = c;
    }
  }
  return melhor ? { desc: melhor, acertos: melhorAcerto } : null;
}

/**
 * Casa itens com linhas de tabela pelo NÚMERO, confirmando por CONTEÚDO.
 * @returns Map numero -> { desc, ini, confirmacao } — só os que passaram na confirmação.
 */
export function casaPorCelula(itens, docNorm) {
  if (!docNorm || !docNorm.includes("\t")) return new Map();
  const linhas = linhasDeTabela(docNorm);
  if (!linhas.length) return new Map();
  const porNumero = new Map();
  for (const l of linhas) {                                  // se o número repete (vários lotes), guarda todas
    if (!porNumero.has(l.numero)) porNumero.set(l.numero, []);
    porNumero.get(l.numero).push(l);
  }
  const out = new Map();
  for (const it of itens) {
    const n = Number(it.numero);
    if (!Number.isFinite(n)) continue;
    const cands = porNumero.get(n);
    if (!cands || !cands.length) continue;
    const toks = sig(it.descricao);
    if (!toks.length) continue;
    // CONFIRMAÇÃO NA PRÓPRIA CÉLULA que será devolvida — não na linha. Entre as linhas com aquele número,
    // vence a que tem a célula que mais casa com o item; exige-se pelo menos uma palavra significativa.
    let melhor = null, melhorCel = null;
    for (const l of cands) {
      const c = melhorCelula(l.cels, toks);
      if (!c) continue;
      if (!melhorCel || c.acertos > melhorCel.acertos) { melhorCel = c; melhor = l; }
    }
    if (!melhor || !melhorCel || melhorCel.acertos === 0) continue;   // não confirmou → não inventa
    out.set(String(it.numero), {
      desc: melhorCel.desc, ini: melhor.ini,
      confirmacao: melhorCel.acertos >= 2 ? "alta" : "media",
      acertos: melhorCel.acertos, de: toks.length,
    });
  }
  return out;
}
