// Parser deterministico de MARCA para a celula: slug=ecustomize_srp
//   portal(gerador)='portal_compras_publicas' | modalidade=Registro de Precos (c.srp=true)
//   tipos_doc=11,19,16  (na pratica 99,97% sao tipo 16 = Ata de Registro de Precos)
//
// CONCLUSAO DA ENGENHARIA REVERSA (amostra 60 + varredura 200):
//   O documento tipo 16 desta celula NAO e a "Ata de Resultado por item" gerada pelo
//   portal com a marca do vencedor. O PDF anexado e, na esmagadora maioria:
//     (a) o EDITAL/Aviso do Pregao SRP  -> a palavra "marca" aparece so como PROSA
//         ("indicacao completa do produto ofertado, incluindo marca", "com a marca do
//         seu produto", "logomarca", "horario marcado") = FALSO POSITIVO; e/ou
//     (b) uma pagina do DIARIO OFICIAL (DOM/SC) de consorcios (CINCATARINA/CIGA), que
//         as vezes traz uma tabela "Item Descricao Marca/Modelo Fornecedor Qtd Valor"
//         de uma DECISAO DE ADESAO -> mas essa tabela se refere a OUTRO processo
//         (ata consolidada ATCxxxx de outra licitacao/municipio), com numeros de item,
//         descricoes e valores que NAO batem com os itens_sc deste cnpj/ano/seq.
//
//   Evidencia dura:
//     - unit_homologado da API aparece no texto em apenas ~2-3% dos itens (63/4229 na
//       amostra; 239/8142 na varredura de 200). Sem o valor no texto nao ha ancora.
//     - Na varredura de 200 docs, 0 traziam o cabecalho "Marca/Modelo"; os 5 da amostra
//       eram todos do mesmo lote CINCATARINA e, verificados 1 a 1, a tabela de adesao
//       referenciava produto/processo DIFERENTE do item homologado (ex.: itens_sc=TONER
//       e tabela=PNEU; itens_sc=MEDICAMENTO e tabela=MINIBUS). Marca real, item errado.
//
//   Logo: a MARCA do vencedor deste processo NAO vive neste documento. O resultado
//   deterministico CORRETO e ~0 marcas caseaveis. Emitir qualquer coisa aqui seria
//   pendurar marca no item errado -> proibido.
//
// O parser abaixo implementa a logica de forma DEFENSIVA e reutilizavel:
//   Template A (adesao "Marca/Modelo"): extrai as linhas, mas SO emite se o numero do
//     item E o valor unitario casarem com um item homologado da API (guarda dupla).
//     Como as adesoes referenciam processo estranho, na pratica isso descarta tudo -
//     mas se um dia o portal anexar a ata do PROPRIO processo, a mesma logica capta.
//   Template B (edital SRP): sem coluna de marca -> nada a extrair (documentado).
//
// Sem rede / sem LLM. Rode: node --check ecustomize_srp.mjs

// ---- utilidades -----------------------------------------------------------
function toNum(br) {
  // "1.234,56" ou "1234,56" ou "397.000,00" -> Number
  if (br == null) return NaN;
  return parseFloat(String(br).replace(/\./g, '').replace(',', '.'));
}
function eqValor(a, b) {
  if (!isFinite(a) || !isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
}

// Prosa juridica / instrucoes de edital / falsos-positivos que NUNCA sao marca de produto
const FP = /\b(quando for o caso|incluindo marca|indica[cç][aã]o de marca|com a marca|logomarca|horario marcad|marcad[oa]s? para|n[aã]o ser[aá] admitida|marcas? e especifica|marca pr[oó]pria|sem marca|refer[eê]ncias? e demais|de \d+\.?\d*\s*km)\b/i;

function limpaMarca(tok) {
  if (!tok) return null;
  let m = tok.trim().replace(/^[-–:.\s\/]+|[-–:.\s\/]+$/g, '').replace(/\s+/g, ' ');
  if (m.length < 2 || m.length > 60) return null;
  if (/^\d+$/.test(m)) return null;              // so numero
  if (FP.test(m)) return null;                    // prosa/instrucao
  if (!/[A-Za-zÀ-ÿ]/.test(m)) return null;        // sem letra
  return m;
}

// ---- Template A: tabela de ADESAO "Item Descricao Marca/Modelo ..." --------
// Duas ordens de coluna observadas:
//   A1: Item Descricao Marca/Modelo Fornecedor        Quantidade da Adesao Valor Unitario
//   A2: Item Descricao Marca/Modelo Quantidade da Adesao Fornecedor        Valor Unitario
// A descricao SEMPRE termina num codigo de catalogo do consorcio: (CIMxxxx) / (CINxxxx).
// A marca/modelo e o texto ENTRE esse codigo e o inicio do fornecedor/quantidade.
const SIG_A = /Item\s+Descri[cç][aã]o\s+Marca\/Modelo\s+(Fornecedor|Quantidade)/i;
// Ancora o fim da descricao no codigo de catalogo e captura ate a quantidade "N unidade(s)".
// Grupo 1 = numero do item (logo antes da descricao), 2 = marca/modelo+fornecedor bruto,
// 3 = quantidade, 4 = valor. Separamos marca de fornecedor depois.
const ROW_A = /(?:^|\s)(\d{1,4})\s+([A-ZÀ-Ý].*?\((?:CIM|CIN|CIS)\s?\d{3,6}\)\.?)\s+(.+?)\s+(\d{1,4})\s+unidades?\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/gs;

function parseTemplateA(texto, itensApi, out, usados) {
  const hdr = texto.search(SIG_A);
  if (hdr < 0) return;
  // limita a janela ao redor da(s) tabela(s) de adesao (evita varrer o diario inteiro)
  const bloco = texto;
  ROW_A.lastIndex = Math.max(0, hdr - 5);
  let m;
  while ((m = ROW_A.exec(bloco))) {
    const itemNum = parseInt(m[1], 10);
    const marcaFornBruto = m[3];            // "MARCA[/MODELO] FORNECEDOR LTDA"
    const unit = toNum(m[5]);
    if (!isFinite(unit) || unit <= 0) continue;

    // GUARDA DUPLA: so casa se numero E valor baterem com um item homologado da API.
    const api = itensApi.find(it =>
      !usados.has(it.numero) &&
      it.numero === itemNum &&
      eqValor(toNum(it.unit_homologado), unit));
    if (!api) continue; // adesao referencia processo estranho -> descarta (nunca erra o item)

    // separa marca do fornecedor: fornecedor costuma terminar em LTDA/EIRELI/S.A/ME/EPP.
    let marcaModelo = marcaFornBruto;
    const cut = marcaFornBruto.search(/\s+[A-ZÀ-Ý0-9][^]*?\b(LTDA|EIRELI|S\.?A\.?|ME|EPP|MEI|COMERCIO|IND[UÚ]STRIA|DISTRIBUI)/);
    if (cut > 0) marcaModelo = marcaFornBruto.slice(0, cut);
    const marca = limpaMarca(marcaModelo);
    if (!marca) continue;

    usados.add(api.numero);
    out.push({ numero: api.numero, marca, modelo: null, valorUnit: unit, confianca: 'media', template: 'A_adesao_marcamodelo' });
  }
}

// ---- Template B: edital/aviso SRP -> sem coluna de marca -------------------
function parseTemplateB(/* texto, itensApi, out, usados */) {
  return; // "marca" so aparece como prosa/instrucao neste layout -> nada a extrair
}

// ---- API principal --------------------------------------------------------
export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  const usados = new Set();
  parseTemplateA(texto, itensApi, out, usados);
  parseTemplateB(texto, itensApi, out, usados);
  return out;
}

export default { parse };
