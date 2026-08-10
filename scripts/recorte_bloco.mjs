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

// ═══ LIMPEZA DO RUÍDO TABULAR — O ITEM ESTÁ LÁ, CERCADO DE COLUNA ═══
// Medido em 10/ago sobre o que o roteador estava gravando: a descrição CERTA quase sempre está dentro do
// recorte, ilhada entre colunas de preço, quantidade e código da mesma linha da tabela:
//   "eco unit preco total 1 38608 15 un r 20 00 r 300 00 produto CONFECCAO DE CRACHAS 2 6268 10 un r 45 00"
//   "preco un preco totalquantidadeitem unid 1018920 PLAFON LED QUADRADO 24W 6500K SOBREPOR 459 0051 00009"
// Isso não é falha de fronteira (o bloco está certo) nem de âncora (o item está lá): é COLUNA VIZINHA
// grudada, e some com limpeza — sem mexer em regra de recorte nenhuma.
//
// ⚠️ O QUE NÃO PODE SER APAGADO: número que faz parte da especificação. "24w", "6500k", "10a", "4 x 4",
// "60898" (NBR IEC) são o item, não ruído. Por isso a limpeza mira PADRÃO DE TABELA e não "número":
//   · dinheiro    — `r 20 00`, `r$ 1 416 65`   (o `r` solto é o R$ que o normalizador desmontou)
//   · corridas    — três ou mais grupos numéricos seguidos: `459 0051 00009 000` é coluna, não medida
//   · quantidade  — `15 un`, `200 un`, `un1`   (número colado à unidade de compra, não de medida)
//   · cabeçalho   — `preco unit total quantidade item unid descricao`, os rótulos da tabela
// E o resultado NÃO substitui nada: entra como mais um candidato no roteador. Se limpar piorar, o gabarito
// reprova e o sujo continua vencendo. É a mesma lei de sempre — vários métodos, o gabarito escolhe.
const MOEDA = /\br\$?(?:\s+\d+){1,6}\b/g;                       // "r 20 00", "r$ 1 416 65"
const CORRIDA = /\b\d+(?:\s+\d+){2,}\b/g;                        // "459 0051 00009 000"
const QTD_UN = /\b\d+\s*(?:un|und|unid|und\.|pc|pct|cx|dz)\b|\b(?:un|und|unid)\s*\d+\b/g;
const ROTULO = /\b(?:preco|precos|unit|unitario|total|totais|quantidade|qtde|qtd|item|itens|unid|unidade|descricao|valor|vlr|medida|codigo|cod|seq|lote)\b/g;

// ⚠️ A PRIMEIRA VERSÃO DESTA FUNÇÃO APAGAVA O NÚMERO DO MODELO — e a medição aprovou assim mesmo.
// Medido em 10/ago:  API "ROLAMENTO ESFERA 6201 ROÇADEIRA" → limpo "rolamento esfera rocadeira".
// O `6201` É a especificação, e sumiu junto com o ruído. Pior: o placar deu +4 pontos de "começa certo",
// porque a nota só conta palavras com 5+ caracteres e é CEGA a "6201". Métrica que não enxerga o dano
// aprova o dano. Por isso o item declarado entra aqui: o que o próprio item diz é INTOCÁVEL.
// Regra: só se apaga ruído que NÃO aparece na descrição que a API declara para aquele item.
export function limpaRuidoTabular(txt, descricaoItem = "") {
  if (!txt) return null;
  // números e códigos que o PRÓPRIO item declara — nunca são ruído, por mais que pareçam coluna de tabela
  const protegidos = new Set(String(descricaoItem).toLowerCase().match(/\d+[a-z]*|\b[a-z]*\d+\b/g) || []);
  const guardar = (m) => (protegidos.size && m.trim().split(/\s+/).some((t) => protegidos.has(t)) ? m : " ");
  let s = " " + String(txt).toLowerCase() + " ";
  s = s.replace(MOEDA, guardar).replace(CORRIDA, guardar).replace(QTD_UN, guardar).replace(ROTULO, " ");
  s = s.replace(/\s+/g, " ").trim();
  // sobra frequente: números soltos que perderam o vizinho na limpeza. Tira só os ISOLADOS entre espaços,
  // preservando o que está colado a letra (24w, 6500k) e o que o item declara (6201, 6202).
  s = s.replace(/(?:^|\s)(\d{1,7})(?=\s|$)/g, (m, d) => (protegidos.has(d) ? m : " ")).replace(/\s+/g, " ").trim();
  // Corta as PONTAS que sobraram sem conteúdo: token de 1-2 caracteres solto no começo ou no fim.
  // ⚠️ ESTE PASSO IGNORAVA A PROTEÇÃO e era o furo que sobrava: item cujo número declarado tem 2 dígitos
  // ("tamanhos 28 a 42", "cano 60") perdia justamente o número quando ele calhava de ficar na ponta.
  // Agora para no primeiro token protegido, em vez de varrer os quatro.
  const toks = s.split(" ");
  let a = 0, b = toks.length;
  while (a < b && a < 4 && toks[a].length <= 2 && !protegidos.has(toks[a])) a++;
  while (b > a && b > toks.length - 4 && toks[b - 1].length <= 2 && !protegidos.has(toks[b - 1])) b--;
  s = toks.slice(a, b).join(" ").trim();
  if (s.length < 12) return null;

  // ═══ GARANTIA FINAL: A LIMPEZA NÃO PODE CUSTAR UM NÚMERO DO ITEM ═══
  // As proteções acima cobrem os casos previstos, e as medições mostraram que sempre sobra um caminho que
  // eu não previ — foram três rodadas assim (dano 4,0% → 3,5% → 1,3%). Em vez de caçar o próximo furo,
  // a verificação é feita no RESULTADO: se algum número que o item declara existia no texto sujo e sumiu
  // no limpo, o candidato limpo é DESCARTADO inteiro e o sujo segue valendo.
  // Assim a limpeza vira ganho sem risco: no pior caso não melhora; nunca destrói especificação.
  const sujo = String(txt).toLowerCase();
  for (const p of protegidos) {
    if (p.length >= 2 && sujo.includes(p) && !s.includes(p)) return null;
  }
  return s;
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
