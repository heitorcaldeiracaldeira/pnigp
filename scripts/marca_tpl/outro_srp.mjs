// Parser deterministico de MARCA por item — celula: outro_srp
// portal (gerador): 'outro' | modalidade: Registro de Precos (c.srp=true) | tipos doc: 11,19,16
//
// A gerador 'outro' agrega VARIOS sistemas municipais. Nos docs de SRP amostrados,
// os layouts que carregam MARCA por item, em ordem de confiabilidade:
//
//  TEMPLATE D  (CINCATARINA — "Analise da Amostra / Laudo de Aceitabilidade")  [PRINCIPAL, validado]
//     Cabecalho: "LOTE NN ITEM MARCA/MODELO/ANO DE FABRICACAO RESULTADO DA ANALISE DA AMOSTRA"
//     Linha:     "<numero> <MARCA> [– <modelo>] - Atende aos Requisitos Minimos exigidos pelo edital."
//     Ancora:    numero do item (global) + CNPJ do PROPONENTE deve casar com cnpj_fornecedor (vencedor).
//                Casa por numero E cnpj -> nunca pendura marca de proponente perdedor.
//
//  TEMPLATE C  ("Item Descricao Unidade Marca Qtde. Item Valor Unitario Valor Total")  [best-effort]
//     Linha: "<num> <descricao...> <UNIDADE> <MARCA> <qtd:9,99999> R$<unit> R$<total>"
//     Ancora: preco unitario == unit_homologado (casa por VALOR).
//
//  TEMPLATE A  (BLL/PCP "Vencedores Codigo Produto Fornecedor Modelo Marca/Fabricante ...")  [best-effort]
//     Linha termina em "<Modelo> <Marca> <valorRef> <quantidade> <valorTotal>" (4 casas decimais).
//     Ancora: valorRef == unit_homologado E valorRef*quantidade ~= valorTotal (checagem de consistencia).
//
// Sem rede, sem LLM. parse(texto, itensApi) processa UM documento; o chamador funde
// os resultados dos varios docs do processo (o primeiro numero preenchido vence).

const BAD_MARCA = /^(sem|marca|marcas|propria|própria|proprio|próprio|diversos?|varios?|vários?|n[aã]o|nao|conforme|edital|item|lote|modelo|fabricante|nacional|importad[oa]|generic[oa]|s\/marca|a|o|de|do|da|e|the|and)$/i;

function marcaOk(m) {
  if (!m) return false;
  m = m.trim().replace(/[.,;:]+$/, '');
  if (m.length < 2 || m.length > 40) return false;
  if (BAD_MARCA.test(m)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(m)) return false;      // precisa ter letra
  if (/^\d/.test(m)) return false;                // nao comeca em digito
  if (/\d{4,}/.test(m)) return false;             // nao e um numero/ano longo
  return true;
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

// numero br "1.234,56" ou "1234,5600" -> Number
function brToNum(s) {
  if (!s) return NaN;
  return Number(String(s).replace(/\./g, '').replace(',', '.'));
}

function splitMarcaModelo(cell) {
  cell = cell.trim().replace(/\s+/g, ' ');
  // separador comum entre marca e modelo: barra, en/em-dash ou hifen cercado por espaco
  //  "CORMED / CO-657PA" -> CORMED + CO-657PA ; "ALP – VITAL SCHEFFER" -> ALP + VITAL SCHEFFER
  const m = cell.split(/\s*\/\s*|\s+[–—-]\s+/);
  if (m.length > 1 && m[0].trim()) {
    return { marca: m[0].trim(), modelo: m.slice(1).join(' / ').trim() || null };
  }
  const toks = cell.split(' ');
  return { marca: toks[0], modelo: toks.slice(1).join(' ').trim() || null };
}

// ---------------------------------------------------------------- TEMPLATE D
function parseTemplateD(texto, apiByNum, results) {
  // 3a coluna varia: "ANO DE FABRICACAO" (mobiliario) ou "VERSAO" (eletronicos) etc.
  const HEADER = /ITEM\s+MARCA\/MODELO\/[^\n]{1,40}?RESULTADO DA AN[ÁA]LISE DA AMOSTRA/gi;
  if (!HEADER.test(texto)) return;
  HEADER.lastIndex = 0;

  // CNPJ do proponente: pega o ultimo "CNPJ: ..." antes de cada segmento
  const cnpjRe = /CNPJ:\s*([\d.\/-]{14,20})/gi;
  const cnpjMarks = [];
  let cm;
  while ((cm = cnpjRe.exec(texto))) cnpjMarks.push({ idx: cm.index, cnpj: onlyDigits(cm[1]) });
  const cnpjBefore = (pos) => {
    let best = null;
    for (const c of cnpjMarks) { if (c.idx < pos) best = c.cnpj; else break; }
    return best;
  };

  // segmenta por cabecalho de bloco "Analise"
  const segs = [];
  let m;
  const positions = [];
  while ((m = HEADER.exec(texto))) positions.push(HEADER.lastIndex);
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    let end = i + 1 < positions.length ? positions[i + 1] : texto.length;
    // corta na assinatura / laudo, que vem depois das linhas
    const stop = texto.slice(start, end).search(/Fraiburgo|LAUDO DE ACEITAB|Respons[áa]vel pela confer|Coordenador de Atua|LOTE\s*\d+\s+ITEM MARCA/i);
    if (stop >= 0) end = start + stop;
    segs.push({ start, end });
  }

  // duas variantes de linha CINCATARINA:
  //   "<num> <marca[/modelo]> - Atende aos Requisitos Minimos..."  (com hifen)
  //   "<num> <marca / modelo> Atende aos Requisitos Minimos..."    (sem hifen)
  // o hifen antes de "Atende" e opcional. "NAO Atende" (perdedor) e descartado.
  const ROW = /(\d{1,4})\s+(.+?)\s+(?:[-–—]\s+)?Atende aos Requisitos M[íi]nimos/gi;
  for (const seg of segs) {
    const chunk = texto.slice(seg.start, seg.end);
    const cnpj = cnpjBefore(seg.start);
    let r;
    ROW.lastIndex = 0;
    while ((r = ROW.exec(chunk))) {
      const numero = Number(r[1]);
      let cell = r[2].trim();
      if (/N[ÃA]O\s*$/i.test(cell)) continue;                        // "... NAO Atende" = reprovado
      if (/MARCA\/MODELO|RESULTADO|AN[ÁA]LISE|LOTE\b|AMOSTRA/i.test(cell)) continue; // fronteira de bloco
      if (cell.length > 45) continue;
      const api = apiByNum.get(numero);
      if (!api) continue;                                   // so casa item que existe na API
      // guarda de fornecedor: proponente deve ser o vencedor (cnpj_fornecedor)
      const apiCnpj = onlyDigits(api.cnpj_fornecedor);
      if (cnpj && apiCnpj && cnpj !== apiCnpj) continue;    // parecer de PERDEDOR -> ignora
      const { marca, modelo } = splitMarcaModelo(cell);
      if (!marcaOk(marca)) continue;
      if (results.has(numero)) continue;
      results.set(numero, {
        numero, marca: marca.trim(), modelo,
        valorUnit: api.unit_homologado != null ? Number(api.unit_homologado) : null,
        confianca: (cnpj && apiCnpj && cnpj === apiCnpj) ? 'alta' : 'media',
        template: 'D_cincatarina_amostra',
      });
    }
  }
}

// ---------------------------------------------------------------- TEMPLATE C
function parseTemplateC(texto, itensApi, results) {
  if (!/Item\s+Descri[cç][aã]o\s+Unidade\s+Marca\s+Qtde/i.test(texto)) return;
  // linha: <num> <desc...> <UNIDADE> <MARCA...> <qtd 5 casas> R$<unit> R$<total>
  const ROW = /(\d{1,4})\s+(.+?)\s+([A-Za-zºª]{1,6})\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .\/&-]{0,30}?)\s+(\d[\d.]*,\d{4,5})\s+R\$\s*([\d.]+,\d{2,4})\s+R\$\s*([\d.]+,\d{2,4})/gi;
  let r;
  while ((r = ROW.exec(texto))) {
    const marcaRaw = r[4].trim().replace(/\s+/g, ' ');
    const unit = brToNum(r[6]);
    if (!(unit > 0)) continue;
    // casa por VALOR unitario com a API
    const api = itensApi.find((i) => Math.abs(Number(i.unit_homologado) - unit) < 0.005);
    if (!api) continue;
    const numero = Number(api.numero);
    if (results.has(numero)) continue;
    // a marca costuma ser a ultima palavra da celula (unidade multi-token as vezes)
    const { marca, modelo } = splitMarcaModelo(marcaRaw);
    const cand = marcaRaw.split(' ').length > 1 ? marcaRaw.split(' ').slice(-1)[0] : marca;
    const finalMarca = marcaOk(marcaRaw) ? marcaRaw : cand;
    if (!marcaOk(finalMarca)) continue;
    results.set(numero, {
      numero, marca: finalMarca.trim(), modelo: modelo || null,
      valorUnit: unit, confianca: 'media', template: 'C_item_unidade_marca',
    });
  }
}

// ---------------------------------------------------------------- TEMPLATE A
function parseTemplateA(texto, itensApi, results) {
  if (!/C[oó]digo\s+Produto\s+Fornecedor\s+Modelo\s+Marca/i.test(texto)) return;
  // ...<Modelo> <Marca> <valorRef> <quantidade> <valorTotal>  (4 casas decimais)
  const ROW = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.\/&-]{1,30})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.\/&-]{1,30})\s+(\d[\d.]*,\d{4})\s+(\d[\d.]*,\d{4})\s+(\d[\d.]*,\d{4})/g;
  let r;
  while ((r = ROW.exec(texto))) {
    const modelo = r[1].trim();
    const marca = r[2].trim();
    const valorRef = brToNum(r[3]);
    const qtd = brToNum(r[4]);
    const total = brToNum(r[5]);
    if (!(valorRef > 0)) continue;
    // consistencia: valorRef * qtd ~= total  (confirma que e uma linha de item real)
    if (!(qtd > 0) || Math.abs(valorRef * qtd - total) > Math.max(1, total * 0.02)) continue;
    const api = itensApi.find((i) => Math.abs(Number(i.unit_homologado) - valorRef) < 0.005);
    if (!api) continue;
    const numero = Number(api.numero);
    if (results.has(numero)) continue;
    if (!marcaOk(marca)) continue;
    results.set(numero, {
      numero, marca, modelo: marcaOk(modelo) ? modelo : null,
      valorUnit: valorRef, confianca: 'media', template: 'A_bll_vencedores',
    });
  }
}

/**
 * parse(texto, itensApi)
 * @param {string} texto            texto de UM documento (tipo 11/19/16)
 * @param {Array}  itensApi         itens homologados do processo (numero, descricao, unit_homologado, cnpj_fornecedor, fornecedor, ...)
 * @returns {Array<{numero,marca,modelo,valorUnit,confianca,template}>}
 */
export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const apiByNum = new Map(itensApi.map((i) => [Number(i.numero), i]));
  const results = new Map();

  parseTemplateD(texto, apiByNum, results);
  parseTemplateC(texto, itensApi, results);
  parseTemplateA(texto, itensApi, results);

  return [...results.values()].sort((a, b) => a.numero - b.numero);
}

export default { parse };
