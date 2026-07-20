// Parser deterministico de MARCA para a celula: plataforma='Contrata+Brasil'
//   (Contrata +Brasil = plataforma federal da Central de Compras / MGI)
//
// CONCLUSAO DA ENGENHARIA REVERSA (678 processos, engenharia reversa sem LLM):
//   O documento NAO e por-processo: sao 5 TEMPLATES NACIONAIS boilerplate,
//   compartilhados byte-a-byte entre todos os 678 processos (5 hashes distintos
//   para 678 docs). Todos vem no tipo_documento_id=20. As modalidades sao
//   Inexigibilidade (673) e Dispensa (5). Os itens sao 93% SERVICO (credenciamento
//   de MEI: manutencao/reparos) e 7% ALIMENTO in natura da agricultura familiar
//   (PAA-CI / Chamada Publica: cenoura, alface, banana, cuca) - nenhum tem marca.
//
//   Os 5 templates:
//     T_CRED_MEI  (~28.441 chars) "CREDENCIAMENTO 3/2025" - servicos MEI. Sem marca.
//     T_CHAMADA   (~200.000 chars) "CHAMADA PUBLICA PAA-CI" - agric. familiar. Sem marca.
//     T_CRED_06   (~200.000 chars) "EDITAL DE CREDENCIAMENTO 06/2025" - PAA. Sem marca.
//     T_ZIP_A/B   (~199.060/199.085 chars) EXTRACAO BINARIA falha (.zip com .pdf
//                 dentro; ~40% printable) - texto ilegivel, nada a extrair.
//   A palavra "marca" so aparece como PROSA: "marcacoes exigidas pela legislacao",
//   "Comarca", "campo de marcacao obrigatorio". NUNCA existe coluna "Marca" com
//   valor por item, nem tabela item x preco por-processo (o preco/fornecedor
//   por item vive so na API estruturada, itens_sc, e NAO traz marca).
//
//   => Nesta celula a marca CORRETA a trazer ao PNCP e ZERO: o dado nao existe
//      no documento (nem no PNCP estruturado). O parser abaixo e defensivo: se um
//      dia um template com coluna "Marca" por item aparecer, ele extrai ancorando
//      no unit_homologado e no numero do item; hoje retorna [].
//
// Zero rede, zero LLM.

// ---- utilidades -----------------------------------------------------------
function toNum(br) {
  // "1.234,56" ou "1234,56" ou "20.03" -> Number
  if (br == null) return NaN;
  const s = String(br).trim();
  if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.')); // valor da API (ponto decimal)
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));             // formato BR do texto
}
function eqValor(a, b) {
  if (!isFinite(a) || !isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
}

// Prosa juridica / falsos-positivos que NUNCA sao marca de produto
const FP = /\b(marca[cç][oõ]es?|comarca|campo de marca[cç][aã]o|de refer[eê]ncia|quando for o caso|data marcada|marcar[aá]|n[aã]o ser[aá] admitida|indica[cç][aã]o de marca|marca pr[oó]pria|sem marca)\b/i;

function limpaMarca(tok) {
  if (!tok) return null;
  let m = tok.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');
  if (m.length < 2 || m.length > 40) return null;
  if (/^\d+$/.test(m)) return null;         // so numero
  if (FP.test(m)) return null;               // prosa
  if (!/[A-Za-zÀ-ÿ]/.test(m)) return null;   // sem letra
  return m;
}

// e um dos 5 templates conhecidos do Contrata+Brasil?
export function detectTemplate(texto) {
  if (!texto) return null;
  const head = texto.slice(0, 4000);
  const printable = (texto.match(/[\x20-\x7EÀ-ÿ]/g) || []).length / texto.length;
  if (printable < 0.6) return 'T_ZIP';                                    // extracao binaria falha
  if (/CHAMADA\s+P[UÚ]BLICA\s+PAA/i.test(head)) return 'T_CHAMADA';
  if (/EDITAL\s+DE\s+CREDENCIAMENTO\s+N?[º°]?\s*0?6/i.test(head)) return 'T_CRED_06';
  if (/CREDENCIAMENTO\s+3?\/?2025/i.test(head) || /Contrata\s*\+?\s*Brasil/i.test(head)) return 'T_CRED_MEI';
  return null;
}

// Extrator defensivo de coluna "Marca" por item (nao dispara nos templates atuais).
// Procura linhas de tabela que tragam, na mesma linha, o numero do item e/ou o
// valor unitario e um token de marca posicionado ENTRE a especificacao e o preco.
function extraiColunaMarca(texto, itensApi, out, usados) {
  // so tenta se existir um cabecalho de tabela com a coluna Marca ao lado de preco/valor
  const temColuna = /marca[^\n]{0,40}(valor|preç|pre[çc]o|unit)/i.test(texto) ||
                    /(item|descri[çc][aã]o)[^\n]{0,60}marca/i.test(texto);
  if (!temColuna) return;
  // linha: <itemNum> ... <MARCA> ... <valorUnitBR>
  const ROW = /(?:^|\n)\s*(\d{1,4})\b[^\n]{3,180}?\b([A-Za-zÀ-ÿ][\wÀ-ÿ .\/&-]{1,30})\s+(\d{1,3}(?:\.\d{3})*,\d{2,4})\b/g;
  let m;
  while ((m = ROW.exec(texto))) {
    const itemNum = parseInt(m[1], 10);
    const unit = toNum(m[3]);
    const marca = limpaMarca(m[2]);
    if (!marca) continue;
    // casa com a API por numero E valor unitario (nunca pendura no item errado)
    let api = itensApi.find(it => !usados.has(it.numero) && it.numero === itemNum && eqValor(toNum(it.unit_homologado), unit));
    if (!api) api = itensApi.find(it => !usados.has(it.numero) && eqValor(toNum(it.unit_homologado), unit));
    if (!api) continue;                       // descarta se nao casar
    usados.add(api.numero);
    out.push({ numero: api.numero, marca, modelo: null, valorUnit: unit, confianca: 'media', template: 'contrata_brasil' });
  }
}

// ---- API principal --------------------------------------------------------
export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  const tpl = detectTemplate(texto);
  if (!tpl) return out;                        // fora da celula conhecida -> nada
  if (tpl === 'T_ZIP') return out;             // texto binario ilegivel -> nada
  const usados = new Set();
  extraiColunaMarca(texto, itensApi, out, usados);
  return out;
}

export default { parse, detectTemplate };
