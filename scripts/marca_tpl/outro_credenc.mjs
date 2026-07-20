// Parser deterministico de MARCA para a celula: outro_credenc
// portal (gerador): "outro" | modalidade: Credenciamento (modalidade_id=12) | tipos doc: 1,16,20
//
// ENGENHARIA REVERSA (amostra de 60 docs, 28 com item homologado, 113 itens):
//   Credenciamento no gerador "outro" e composto quase inteiramente por SERVICOS
//   (saude/SUS, transporte/caminhao, radio) e por CHAMADA PUBLICA de agricultura
//   familiar (PNAE, hortifruti). Nenhum desses casos carrega marca de produto.
//
//   Apenas o template "IPM Atende.Net / Termo de Homologacao" possui uma COLUNA
//   "Marca" no cabecalho. Foram achadas 2 assinaturas de cabecalho:
//     T1: "Produto Unidade Marca Qtde Valor Unitario Valor Total"
//         linha do item: "<n> - <descricao> <UNIDADE> <MARCA?> <qtde> R$<vunit> R$<vtotal>"
//         -> a coluna Marca fica ENTRE a unidade e a quantidade.
//     T2: "Item Quantidade Unidade Produto Marca Valor Unitario Valor Total"
//         linha do item: "<n> <qtde> <UNID> <cod> - <descricao> <MARCA?> R$<vunit> R$<vtotal>"
//         -> a coluna Marca fica ENTRE o fim da descricao e o valor unitario.
//   Em TODOS os exemplares observados a coluna Marca vem VAZIA (itens = servicos).
//
//   Portanto a taxa esperada de marca nesta celula e ~0%. O parser abaixo esta
//   correto e capturaria a marca SE ela existisse na coluna; ele simplesmente nao
//   inventa marca onde o gerador nao a imprime. Cada item so recebe marca se casar
//   por numero E por proximidade do valor unitario homologado (nunca pendura marca
//   no item errado), e a marca precisa passar no filtro anti-falso-positivo.

// ---- helpers de valor (formato BR) --------------------------------------
function brVariants(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return [];
  const comMil = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const semMil = n.toFixed(2).replace('.', ',');
  const set = new Set([comMil, semMil, 'R$' + comMil, 'R$' + semMil, 'R$ ' + comMil, 'R$ ' + semMil]);
  return [...set];
}

// ---- filtro anti-falso-positivo -----------------------------------------
const UNIDADES = new Set(['UN', 'UND', 'UNID', 'UNIDADE', 'KG', 'G', 'MG', 'L', 'ML', 'M', 'M2', 'M3',
  'CX', 'PC', 'PCT', 'PACOTE', 'DZ', 'DUZIA', 'H', 'HR', 'HORA', 'HORAS', 'SERVICO', 'SERVICOS',
  'SERV', 'MES', 'MESES', 'DIA', 'DIAS', 'FR', 'FRASCO', 'AMP', 'AMPOLA', 'CP', 'COMP', 'CPR',
  'LT', 'LATA', 'SC', 'SACO', 'RL', 'ROLO', 'PAR', 'PARES', 'GLB', 'VB', 'VERBA', 'TON', 'T']);

const PROSA_MARCA = /marca\s+(de|do|da|propria|pr[oó]pria|e\s+especifica|quando|sem\b)|indica[cç][aã]o\s+de\s+marca|n[aã]o\s+ser[aá]\s+admitida|marcas?\s+e\s+especifica/i;

function looksLikeMarca(tok) {
  if (!tok) return false;
  const t = tok.trim();
  if (t.length < 2 || t.length > 30) return false;
  if (/^[\d.,%/R$\s-]+$/.test(t)) return false;                 // so numeros/simbolos
  if (UNIDADES.has(t.toUpperCase().replace(/[.:]/g, ''))) return false;
  if (/^(SERVI[CÇ]O|CONTRATA|PRESTA|CREDENCIA|GRUPO|SUB|TOTAL|FORNECEDOR)/i.test(t)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return false;                     // precisa ter letra
  return true;
}

// ---- deteccao de template pelo cabecalho --------------------------------
const HDR_T1 = /Produto\s+Unidade\s+Marca\s+Qtde\s+Valor\s+Unit[aá]rio/i;
const HDR_T2 = /Item\s+Quantidade\s+Unidade\s+Produto\s+Marca\s+Valor\s+Unit[aá]rio/i;

/**
 * @param {string} texto  texto do documento (arquivo_texto_sc.texto)
 * @param {Array}  itensApi  itens homologados da API (numero, descricao, unit_homologado, ...)
 * @returns {Array<{numero, marca, modelo, valorUnit, confianca, template}>}
 */
export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || itensApi.length === 0) return out;

  const hasT1 = HDR_T1.test(texto);
  const hasT2 = HDR_T2.test(texto);
  if (!hasT1 && !hasT2) return out; // sem coluna de marca -> nada a extrair
  const template = hasT2 ? 'ipm_termo_itemprodutomarca' : 'ipm_homolog_produtomarcaqtde';

  const flat = texto.replace(/\s+/g, ' ');

  for (const it of itensApi) {
    const num = Number(it.numero);
    const vars = brVariants(it.unit_homologado);
    if (!vars.length) continue;

    // ancora: posicao do valor unitario homologado no texto
    let pricePos = -1, priceStr = '';
    for (const v of vars) {
      const p = flat.indexOf(v);
      if (p >= 0) { pricePos = p; priceStr = v; break; }
    }
    if (pricePos < 0) continue; // nao casa por preco -> descarta (nao chuta)

    // confirma que a linha do item pertence a este numero:
    // a descricao (ou o numero do item) deve aparecer numa janela antes do preco
    const janela = flat.slice(Math.max(0, pricePos - 400), pricePos);
    const descHead = (it.descricao || '').replace(/\s+/g, ' ').slice(0, 25);
    const numAncora = new RegExp('(^|[^\\d])' + num + '\\s*[-\\s]');
    const casaNumero = numAncora.test(janela);
    const casaDesc = descHead.length > 5 && janela.toUpperCase().includes(descHead.toUpperCase());
    if (!casaNumero && !casaDesc) continue; // nao conseguiu localizar a linha certa

    // extrai o candidato a marca na posicao da COLUNA (imediatamente antes do preco)
    // pega os ultimos tokens antes do valor unitario, removendo qtde/unidade obvios
    const antes = janela.replace(/R\$\s*$/,'').trimEnd();
    const toks = antes.split(/\s+/).filter(Boolean);
    let cand = '';
    // varre de tras pra frente pulando numeros/qtde ate achar um token "marca-like"
    for (let i = toks.length - 1; i >= 0 && i >= toks.length - 4; i--) {
      const t = toks[i];
      if (/^[\d.,]+$/.test(t)) continue;              // qtde / numero
      cand = t;
      break;
    }

    if (!looksLikeMarca(cand)) continue;               // coluna vazia (servico) => sem marca
    if (PROSA_MARCA.test(janela)) continue;            // vedacao / prosa juridica

    out.push({
      numero: num,
      marca: cand.replace(/[.,;:]+$/, '').toUpperCase(),
      modelo: null,
      valorUnit: Number(it.unit_homologado),
      confianca: casaNumero && casaDesc ? 'alta' : 'media',
      template,
    });
  }

  return out;
}

export default { parse };
