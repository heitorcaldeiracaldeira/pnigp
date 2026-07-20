// Parser deterministico de MARCA para a celula: slug=outro_dispensa
//   portal(gerador)='outro' | modalidade=Dispensa (modalidade_id=8) | tipos_doc=1,16,20
//
// CONCLUSAO DA ENGENHARIA REVERSA (ver observacoes no relatorio):
//   Os documentos desta celula sao pre-adjudicacao: DFD, Aviso/Edital de Dispensa,
//   Justificativa/Autorizacao, Relatorio de Dispensa e formularios de "Solicitacao de
//   despesa" de sistemas municipais heterogeneos. A palavra "marca" so aparece como
//   PROSA (vedacao art.41 "a marca do produto, quando for o caso", "data marcada",
//   "marcara um passo"). As tabelas de item tem colunas Item/Qtd/Unid/Descricao/Valor;
//   quando existe coluna "Marca" (template Fiorilli) ela vem VAZIA (marca so eh
//   preenchida na Proposta/Termo, que nao esta neste conjunto gerador+tipo).
//
// O parser abaixo:
//   1) Detecta os 2 templates dominantes, ancora cada linha pelo unit_homologado (e nº do item);
//   2) So emite MARCA quando ha um token de marca REAL na coluna certa (nunca prosa);
//   3) Descarta o item se nao casar com itensApi.numero (nunca pendura marca no item errado).
// Na amostra desta celula o resultado correto e ~0 marcas: o dado nao esta no documento.

// ---- utilidades -----------------------------------------------------------
function toNum(br) {
  // "1.234,56" ou "1234,56" -> 1234.56
  if (br == null) return NaN;
  return parseFloat(String(br).replace(/\./g, '').replace(',', '.'));
}
function eqValor(a, b) {
  if (!isFinite(a) || !isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
}

// Prosa juridica / falsos-positivos que NUNCA sao marca de produto
const FP = /\b(quando for o caso|data marcada|marcar[aá]|n[aã]o ser[aá] admitida|indica[cç][aã]o de marca|marcas? e especifica|marca pr[oó]pria|sem marca|de \d+\.?\d*\s*km)\b/i;

function limpaMarca(tok) {
  if (!tok) return null;
  let m = tok.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');
  if (m.length < 2 || m.length > 40) return null;
  if (/^\d+$/.test(m)) return null;              // so numero
  if (FP.test(m)) return null;                    // prosa
  if (!/[A-Za-zÀ-ÿ]/.test(m)) return null;        // sem letra
  return m;
}

// ---- Template A: "Fiorilli" (colunar municipal) ---------------------------
// Assinatura de cabecalho: "Especificacao do material  Marca  Preco Un. Preco Total Quantidade Item Unid."
// Linha:  <cod> - <DESCRICAO>[MARCA]<Total:n,nn><Unit:n,nnnn><Qtd:n,nnn> <UNID><itemNum>
const SIG_A = /Especificação do material\s*Marca\s*Preço\s*Un/i;
// bloco numerico colado: Total(2 dec) + Unit(4 dec) + Qtd(3 dec) + " " + UNID + itemNum
const ROW_A = /(\d{1,3}(?:\.\d{3})*,\d{2})(\d{1,3}(?:\.\d{3})*,\d{4})(\d{1,3}(?:\.\d{3})*,\d{3})\s+([A-Za-zºª]{1,6}?)(\d{1,4})\b/g;

function parseTemplateA(texto, itensApi, out, usados) {
  const hdr = texto.search(SIG_A);
  if (hdr < 0) return;
  // corta a partir do cabecalho ate o "Total Geral"
  let tail = texto.slice(hdr);
  const fim = tail.search(/Total\s*Geral/i);
  const bloco = fim > 0 ? tail.slice(0, fim) : tail;

  ROW_A.lastIndex = 0;
  let m, prevEnd = bloco.search(SIG_A);
  prevEnd = bloco.indexOf('Unid.'); // fim do cabecalho
  while ((m = ROW_A.exec(bloco))) {
    const unit = toNum(m[2]);
    const itemNum = parseInt(m[5], 10);
    // segmento textual que antecede o bloco numerico = "<cod> - DESCRICAO [MARCA]"
    const seg = bloco.slice(prevEnd, m.index).trim();
    prevEnd = ROW_A.lastIndex;

    // casa com a API por VALOR unitario e/ou numero do item
    let api = itensApi.find(it => !usados.has(it.numero) && it.numero === itemNum && eqValor(toNum(it.unit_homologado), unit));
    if (!api) api = itensApi.find(it => !usados.has(it.numero) && eqValor(toNum(it.unit_homologado), unit));
    if (!api) continue; // nunca pendura no item errado

    // coluna MARCA (template A): fica ENTRE o fim da especificacao e o bloco de precos.
    // Na pratica desta celula vem vazia. So emitimos se houver token de marca real e
    // separavel (delimitador " - MARCA:" ou " MARCA:" no fim do segmento). Sem isso,
    // nao ha como separar marca de descricao de forma deterministica -> descartamos.
    let marca = null;
    const mm = seg.match(/(?:marca[:\s]+)([A-Za-z0-9À-ÿ][\wÀ-ÿ .\/-]{1,30})$/i);
    if (mm) marca = limpaMarca(mm[1]);
    if (!marca) continue; // sem marca real -> nao emite (evita lixo)

    usados.add(api.numero);
    out.push({ numero: api.numero, marca, modelo: null, valorUnit: unit, confianca: 'media', template: 'A_fiorilli' });
  }
}

// ---- Template B: edital "Item Qtd Unidade Descricao Valor Unit Valor Total"
// Este layout NAO possui coluna de marca -> nada a extrair (mantido documentado).
const SIG_B = /Item\s+Quantidade\s+Unidade\s+Descrição\s+Valor\s*Unit/i;
function parseTemplateB(/* texto, itensApi, out, usados */) {
  return; // sem coluna Marca neste template
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
