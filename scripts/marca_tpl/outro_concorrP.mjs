// Parser deterministico de MARCA para a celula: outro_concorrP
//   portal (gerador): outro   |   modalidade: Concorrencia Presencial (modalidade_id=5)
//   tipos de documento: 16,11,19,1
//
// ACHADO DA ENGENHARIA REVERSA (60 docs de amostra + probe de todo o universo = 270 processos / 224 itens):
//   Esta celula e QUASE 100% OBRAS e servicos de engenharia (pavimentacao asfaltica,
//   drenagem, construcao/reforma, canal, sinalizacao viaria, publicidade). Cada item
//   homologado da API e "CONTRATACAO DE EMPRESA PARA EXECUCAO DE OBRA" (quantidade=1,
//   fornecedor = construtora). NAO existe tabela de itens de PRODUTO com coluna de MARCA.
//   O documento e planilha orcamentaria (BDI/SINAPI), cronograma fisico-financeiro,
//   matriz de riscos, memorial. A palavra "marca" aparece SO como PROSA:
//     - "marcacoes feitas no pavimento", "demais marcas serao em tinta retrorefletiva"
//     - "Marcacao e instrucoes" (ensaios INMETRO)
//   ==> Nao ha MARCA DE PRODUTO a extrair. O parser abaixo e conservador: so emite marca
//       quando ha uma tabela de itens de PRODUTO real (cabecalho com coluna "marca") e o
//       token casa como marca plausivel; do contrario devolve [] (nunca pendura prosa).
//   Se algum dia entrar nesta celula um processo de PRODUTO (raro), o parser o captura.
//   Zero dependencia de rede/LLM.

const COLWORDS = /\b(item|c[oó]d(?:igo)?|quant|qtd|unid|especifica|descri|marca|modelo|fabricante|valor|pre[cç]o|unit|total|fornecedor|lote|refer[eê]ncia)/gi;

// Palavras/contextos que indicam PROSA juridica ou de obra — NUNCA sao marca de produto.
const PROSA = [
  /marca[cç][aã]o/i,             // marcacao / marcacoes (pavimento)
  /marcas?\s+(ser[aã]o|feitas|no\s+pavimento|s[ií]mbolos)/i,
  /n[aã]o\s+ser[aá]\s+admitida/i,
  /veda(d|-se|[cç][aã]o)/i,
  /sem\s+marca/i,
  /marca\s+pr[oó]pria/i,
  /quando\s+for\s+o\s+caso/i,
  /marca\s+de\s+refer[eê]ncia/i,
  /marcas?\s+e\s+especifica/i,
  /marca\s+de\s+\d/i,            // "marca de 10.000 km"
  /prefer[eê]ncia\s+de\s+marca/i,
];

// Token NAO pode ser marca se: numero/moeda, unidade, data, palavra de prosa comum.
const NAO_MARCA_TOKEN = /^(und?|un|unid|pç|pc|peca|m|m2|m3|ml|kg|g|l|cx|kit|par|jg|hora|h|mes|dia|r\$|total|geral|item|lote|sim|nao|n\/a|na|marca|modelo)$/i;
const NUMERICO = /^[\d.,%$/-]+$/;
const DATA = /^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/;

function stripAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Formas textuais do valor unitario: "1.234,56" e "1234,56"
function formasValor(v) {
  const n = Number(v);
  if (!(n > 0)) return [];
  const [i, d] = n.toFixed(2).split('.');
  const comMilhar = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [...new Set([`${comMilhar},${d}`, `${i},${d}`])];
}

// Um trecho de contexto (janela ao redor de um indice) contem prosa vedada?
function ehProsa(trecho) {
  return PROSA.some((re) => re.test(trecho));
}

// number+unit (medida), ex.: "6,00m", "50kg", "100mm" -> NAO e marca
const MEDIDA = /^\d+([.,]\d+)?\s*(m|m2|m3|cm|mm|km|kg|g|l|ml|un|und|pc|pç|cx|h|mes|dia|min|seg|und?)$/i;

// Valida se um token isolado parece uma marca de produto real.
function marcaPlausivel(tok) {
  if (!tok) return false;
  tok = tok.trim().replace(/[.,;:]+$/, '');
  if (tok.length < 2 || tok.length > 30) return false;
  if (NUMERICO.test(tok)) return false;
  if (DATA.test(tok)) return false;
  if (MEDIDA.test(tok)) return false;
  if (NAO_MARCA_TOKEN.test(tok)) return false;
  // precisa ter pelo menos uma letra
  if (!/[A-Za-zÀ-ÿ]/.test(tok)) return false;
  // digitos nao podem dominar (marca e alfabetica; codigo/medida tem muitos digitos)
  const nDig = (tok.match(/\d/g) || []).length;
  const nAlf = (tok.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (nDig > nAlf) return false;
  return true;
}

// Localiza a linha que contem uma das formas do valor. Retorna {linha, idxLinha} ou null.
function linhaDoValor(lines, formas) {
  for (let k = 0; k < lines.length; k++) {
    if (formas.some((f) => lines[k].includes(f))) return { linha: lines[k], idx: k };
  }
  return null;
}

// Detecta cabecalho de tabela de PRODUTO com coluna "marca". Retorna indice do token "marca"
// dentro do cabecalho tokenizado, ou -1.
function cabecalhoComMarca(lines) {
  for (let k = 0; k < lines.length; k++) {
    const ln = lines[k];
    if (ln.length > 220) continue;
    if (!/\bmarca\b/i.test(ln)) continue;
    const cols = (ln.match(COLWORDS) || []).length;
    if (cols < 3) continue;               // precisa parecer cabecalho de tabela
    if (ehProsa(ln)) continue;
    // token index da palavra marca
    const toks = ln.trim().split(/\s{2,}|\t|\s*\|\s*/).filter(Boolean);
    const idx = toks.findIndex((t) => /^marca$/i.test(t.trim()));
    return { headerLine: k, headerTokens: toks, marcaCol: idx };
  }
  return null;
}

/**
 * @param {string} texto  texto do documento (arquivo_texto_sc.texto)
 * @param {Array<{numero:number,descricao?:string,unit_homologado:number}>} itensApi
 * @returns {Array<{numero:number,marca:string,modelo:string|null,valorUnit:number|null,confianca:'alta'|'media',template:string}>}
 */
export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || itensApi.length === 0) return out;

  const lines = texto.split(/\r?\n/);
  const header = cabecalhoComMarca(lines);

  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    if (formas.length === 0) continue;

    // ancora: primeira ocorrencia do valor no texto
    let pos = -1, forma = '';
    for (const f of formas) {
      const p = texto.indexOf(f);
      if (p >= 0) { pos = p; forma = f; break; }
    }
    if (pos < 0) continue; // sem ancora -> nao casa -> descarta (nunca chuta)

    // janela de contexto ao redor da ancora (para checagem de prosa)
    const janela = texto.slice(Math.max(0, pos - 400), pos + 120);
    if (ehProsa(janela)) continue; // valor esta dentro de prosa de obra -> descarta

    let marca = null, confianca = 'media', template = 'outro_concorrP:generico';

    // --- TEMPLATE A: tabela de produto com cabecalho "marca" ---
    if (header && header.marcaCol >= 0) {
      const alvo = linhaDoValor(lines, formas);
      if (alvo) {
        const toks = alvo.linha.trim().split(/\s{2,}|\t|\s*\|\s*/).filter(Boolean);
        const cand = toks[header.marcaCol];
        if (cand && marcaPlausivel(cand) && !ehProsa(alvo.linha)) {
          marca = cand.trim().replace(/[.,;:]+$/, '');
          confianca = 'alta';
          template = 'outro_concorrP:tabela_marca';
        }
      }
    }

    // --- TEMPLATE B: rotulo inline "Marca: XXX" proximo da ancora ---
    if (!marca) {
      const rot = janela.match(/\bmarca\s*[:\-]\s*([A-Za-zÀ-ÿ0-9][\wÀ-ÿ .&+/-]{1,28})/i);
      if (rot && !ehProsa(janela)) {
        const cand = rot[1].split(/\s{2,}|;|\bmodelo\b/i)[0].trim();
        if (marcaPlausivel(cand)) {
          marca = cand;
          confianca = 'media';
          template = 'outro_concorrP:rotulo_inline';
        }
      }
    }

    if (!marca) continue; // obra/servico sem marca de produto -> nada a emitir

    out.push({
      numero: it.numero,
      marca,
      modelo: null,
      valorUnit: Number(it.unit_homologado),
      confianca,
      template,
    });
  }

  return out;
}

export default { parse };
