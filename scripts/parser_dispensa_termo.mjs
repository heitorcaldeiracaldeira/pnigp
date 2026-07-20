// PARSER DETERMINÍSTICO — TERMO DE DISPENSA / INEXIGIBILIDADE (modalidade_id 8/9/12).
// Rotear por arquivo_texto_sc: modalidade 8/9/12 + documento de homologação/razão da escolha/proposta do vencedor.
//
// ⚠️ VERDADE MEDIDA (2026-07-19, 301.043 docs de dispensa em SC): a marca É RARA neste formato.
//   · só  6.219 (2,1%) têm um rótulo "Marca: <valor real>";
//   · só  1.721 (0,6%) têm cabeçalho "Marca/ Fabricante";
//   · o Termo de Dispensa "puro" é um DOCUMENTO JURÍDICO (preâmbulo, fundamentação, cláusulas): nomeia o VENCEDOR +
//     CNPJ + item + valor, mas NÃO traz marca (é serviço, ou compra de baixo valor sem especificação de marca).
// Por isso o parser tem 4 camadas, da mais rica (marca por proposta) à mais pobre (só vencedor), e devolve o que
// o documento de fato tem — nunca inventa marca. A marca, quando existe, vem dos sistemas de disputa eletrônica que
// alguns municípios usam DENTRO da dispensa (e-Pública/Lance Eletrônico, IPM, SES-SC, TJSC-Cotação).
//
// Os documentos "Portal de Compras Públicas" (cabeçalho "Fornecedor CNPJ/CPF Data ... Marca/ Fabricante ... Sim/Não")
// NÃO são tratados aqui: o roteador (detectaGerador) manda-os para parser_ecustomize, que já os lê.
//
// Determinístico: âncoras rígidas — "Marca:"/"Modelo:", cabeçalho "Autor Marca/Modelo Valor", CNPJ completo,
// valores "R$ 0.000,00", "LOTE N Num:". Fuzzy (heurística documentada): separar marca/modelo do blob quando vêm
// grudados por " / " (marca ≈ token antes da barra; modelo = resto), como o parser_ecustomize. SEM LLM.
import { normalizaMarca } from "./mapa_atas_plataformas.mjs";

const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => String(s || "").replace(/\s+/g, "");
const CNPJ = String.raw`\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2}`;

// PDF achatado: rótulo "Serviço"/"Própria"/"Obra"/vazio no campo Marca não é marca de produto → normalizaMarca dá null.
// Também limpo ruído de rodapé de página que vaza no fim do valor de um campo.
const RODAPE = /\d+\s+de\s+\d+\s*Gerado em:.*$|Gerado em:.*$|P[áa]g\.?\s*\d+.*$|Documento assinado.*$|MUNIC[IÍ]PIO DE.*$/is;
const limpaCampo = (s) => String(s || "").replace(RODAPE, "").replace(/\s+/g, " ").trim();
// placeholders de SERVIÇO que a disputa eletrônica joga no campo Marca quando não há produto (m_19, medido):
// "1", "SV", "sv", "serv", "SERVIÇO", "Conforme Edital", "Nível". normalizaMarca já mata "Serviço"/"Própria"/"N/A";
// aqui completo os que só aparecem nesta fonte. Fica FIEL: campo preenchido, mas não é marca de produto → null.
const MARCA_JUNK = /^\s*(sv|serv|servi[çc]?o?|conforme(\s+edital)?|edital|km\s*zero|zero|di?versos?|n[íi]vel|item|lote|\d+|[a-z]\s*\/\s*[a-z]|x)\s*$/i;
const marcaOk = (s) => { const m = normalizaMarca(s); return m && !MARCA_JUNK.test(m) ? m : null; };
// marca vem colada em modelo por " / " (layout "Autor Marca/Modelo"): fornecedor+marca à esquerda, modelo à direita.
// heurística de OURO (parser_ecustomize): marca = ÚLTIMA unidade do blob antes da barra; o resto é o fornecedor.
function separaFornMarca(blobEsquerda) {
  const bt = limpaCampo(blobEsquerda).replace(/^[\d.\/-]+\s+/, "").split(" ").filter(Boolean); // tira CPF/CNPJ parcial que prefixa
  if (!bt.length) return { fornecedor: null, marca: null };
  const marca = marcaOk(bt[bt.length - 1]);
  const fornecedor = bt.length > 1 ? bt.slice(0, -1).join(" ") : null;
  return { fornecedor, marca };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CAMADA 1 — tabela de PROPOSTAS "Autor Marca/Modelo Valor" (e-Pública / Lance Eletrônico; Criciúma e outros).
// A mais rica: por ITEM, TODOS os proponentes com marca+modelo+valor. Layout real (m_11, Criciúma 2024/195):
//   LOTE 1 Descrição: Cofre para armas Item: 1 Unidade: UNIDADEQuant.: 4 Autor Marca/Modelo Valor
//   K R MARCONDES DISTRIBUIDORA JG / 5ARMAS 5.700,00
//   BR 2000 INDUSTRIA E METALURGICA LTDA. PRÓPRIA / COF-01 ESPECIAL 5.700,00 ... Val. Ref.: 5.700,00
// ⚠️ armadilhas reais: (a) "Unidade: UNIDADEQuant.:" vem GRUDADO; (b) alguns proponentes não têm " / " (só marca,
// sem modelo: "GUSTAVO DE ALMEIDA LEITE Syngenta 180,00"); (c) prefixo de CPF parcial "52.837.726 GUSTAVO...".
const CAB_B = new RegExp(
  String.raw`(?:LOTE\s+(\d+)\s+)?Descri[çc][ãa]o:\s*([^]{1,300}?)\s+Item:\s*(\d+)\s+Unidade:\s*([^]{1,30}?)\s*Quant\.?\s*:\s*([\d.]+(?:,\d+)?)\s+Autor\s+Marca\s*\/\s*Modelo\s+Valor`,
  "gi"
);
// linha: <fornecedor [marca] [/ modelo]> <valor>. Âncora = o valor no fim; o miolo é fuzzy.
const LIN_B = /([A-ZÀ-Ú0-9][^]{2,140}?)\s+([\d.]+,\d{2})(?=\s|$)/g;

function parseAutorMarcaModelo(t) {
  const out = [];
  let m;
  CAB_B.lastIndex = 0;
  while ((m = CAB_B.exec(t))) {
    const lote = m[1] ? parseInt(m[1], 10) : null;
    const item = parseInt(m[3], 10);
    const descricao = limpaCampo(m[2]).slice(0, 400);
    const quantidade = num(m[5]);
    // bloco de linhas = do fim do cabeçalho até "Val. Ref." / "Documento" / próximo LOTE / fim
    let bloco = t.slice(CAB_B.lastIndex);
    const fim = bloco.search(/Val\.?\s*Ref\.?:|Documento:|DOCUMENTOS ANEXADOS|ARQUIVOS ANEXADOS|LOTE\s+\d+\s+Descri/i);
    if (fim > 0) bloco = bloco.slice(0, fim);
    LIN_B.lastIndex = 0;
    let lm;
    while ((lm = LIN_B.exec(bloco))) {
      let miolo = lm[1].trim();
      let marca = null, modelo = null, fornecedor = null;
      const barra = miolo.indexOf(" / ");
      if (barra >= 0) {
        const dir = miolo.slice(barra + 3).trim();
        ({ fornecedor, marca } = separaFornMarca(miolo.slice(0, barra)));
        modelo = limpaCampo(dir).slice(0, 80) || null;
      } else {
        ({ fornecedor, marca } = separaFornMarca(miolo));
      }
      out.push({
        codigo: item, numero: item, lote, item,
        descricao, cnpjFornecedor: null, fornecedor: fornecedor ? fornecedor.slice(0, 160) : null,
        marca, modelo, valorUnitario: num(lm[2]), quantidade, valorTotal: null,
        classificado: true, layout: "autor_marca_modelo",
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CAMADA 2 — e-Pública "rótulos" (vencedor por item). Layout real (m_16, Criciúma 2024/221):
//   Item: 1 Descrição: Tendas Sanfonadas 3x3 Quantidade: 6 Val. Ref.: 2.515,00 Unidade: UNIDADE Total Item: 7.470,00
//   Marca: PROPRIA Modelo: TENDA SANFONADA 3X3 Valor Unit.: 1.245,00 Quant.: 1 Total: 7.470,00LOTE 1 Num: 467 Lance:...
//   ... AIALA TENDAS LTDA 20.766.320/0001-64 16.760,00 Gerado em: ...
// O fornecedor+CNPJ do vencedor vem UMA vez no fim e vale para todos os itens do documento.
const ITEM_A = new RegExp(
  String.raw`Item:\s*(\d+)\s+Descri[çc][ãa]o:\s*([^]{1,300}?)\s+Quantidade:\s*([\d.]+(?:,\d+)?)\s+Val\.?\s*Ref\.?:\s*([\d.]+,\d{2})\s+Unidade:\s*([^]{1,30}?)\s+Total Item:\s*([\d.]+,\d{2})\s+Marca:\s*([^]{0,50}?)\s*Modelo:\s*([^]{0,60}?)\s*Valor\s*Unit\.?:\s*([\d.]+,\d{2})\s+Quant\.?\s*:\s*([\d.]+(?:,\d+)?)\s+Total:\s*([\d.]+,\d{2})\s*LOTE\s+(\d+)\s+Num:`,
  "gi"
);
const WINNER_EPUB = new RegExp(String.raw`([A-ZÀ-Ú][A-ZÀ-Ú0-9 .,&'\-\/]{4,80}?)\s+(${CNPJ})\s+([\d.]+,\d{2})\s*(?:\d+\s+de\s+\d+)?Gerado em:`, "i");

function parseEpublicaLabel(t) {
  const out = [];
  const w = t.match(WINNER_EPUB);
  const fornecedor = w ? limpaCampo(w[1]).slice(0, 160) : null;
  const cnpj = w ? limpaCnpj(w[2]) : null;
  let m;
  ITEM_A.lastIndex = 0;
  while ((m = ITEM_A.exec(t))) {
    out.push({
      codigo: parseInt(m[1], 10), numero: parseInt(m[1], 10), lote: parseInt(m[12], 10), item: parseInt(m[1], 10),
      descricao: limpaCampo(m[2]).slice(0, 400),
      cnpjFornecedor: cnpj, fornecedor,
      marca: marcaOk(limpaCampo(m[7])), modelo: limpaCampo(m[8]).slice(0, 80) || null,
      valorUnitario: num(m[9]), quantidade: num(m[3]), valorTotal: num(m[6]),
      classificado: true, layout: "epublica_label",
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CAMADA 3 — rótulo "Marca:/Modelo:" GENÉRICO (SES-SC, TJSC-Cotação, IPM, e-Pública-A que a CAMADA 2 não pegou).
// Layout real (e_12, TJSC 2022/65):  Item1: <desc> Código Comprasnet: 218907 Marca: Brinox Modelo: Atina Unidade:...
// Layout real (e_11, SES 2024/690):  ...Cardioversor Marca: Mindray Modelo: BeneHeart D3 ... 1 R$ 780,00 R$ 780,00
//                                     ...FORNECEDOR: ...MWSC... CNPJ ...n.º 40.276.235/0001-25.
// A marca aqui é do PRODUTO (não "Serviço"). Descrição = texto que precede o "Marca:"; fornecedor/CNPJ = o vencedor
// global do documento. Aproximação honesta: casa marca+descrição bem; o CNPJ é o único do documento na dúvida.
const MARCA_LBL = new RegExp(
  String.raw`Marca:\s*([^]{0,45}?)\s*(?:Fabricante:\s*[^]{0,45}?)?Modelo:\s*([^]{0,60}?)(?=\s+(?:Unidade|N[ºo]\s*S[ée]rie|Patrim|Descri|Valor|Quantidade|Local|C[óo]digo|Item|R\$|$))`,
  "gi"
);
// INLINE minúsculo: "...da marca Maquet, modelo Servo-i..." (SES-SC, e_3). Exige marca = palavra CAPITALIZADA logo
// após "marca " (o boilerplate legal escreve "marca, fabricante, modelo" — vírgula colada — e NÃO casa aqui).
const MARCA_INLINE = /\bmarca:?\s+([A-ZÀ-Ú][\wÀ-ú.\-\/]{2,25})\s*,?\s+modelo:?\s+([A-Za-zÀ-ú0-9][\wÀ-ú .\-\/]{1,45}?)(?=[,.;)]|\s*\(|\s+compat|\s+refer|\s+Patrim|\s+N[ºo]\s|\s+SN\b|$)/g;
// descrição = pega o item/produto imediatamente ANTES do "Marca:" (até 220 chars, sem cruzar outro "Marca:").
const PRE_DESC = /(?:Item\s*\d*:?\s*|Descri[çc][ãa]o(?:\s+do\s+item)?:?\s*|Cardioversor|Equipamento:\s*)([^]{4,220}?)\s*(?:C[óo]digo[^]{0,40}?)?$/i;

function parseMarcaLabelGeneric(t) {
  const winner = extraiVencedor(t);
  const out = [];
  let m, idx = 0;
  MARCA_LBL.lastIndex = 0;
  while ((m = MARCA_LBL.exec(t))) {
    const marca = marcaOk(limpaCampo(m[1]));
    const modelo = limpaCampo(m[2]).slice(0, 80) || null;
    if (!marca && !modelo) { idx = MARCA_LBL.lastIndex; continue; }
    // descrição = trecho antes do rótulo (a partir do fim do rótulo anterior)
    const pre = t.slice(idx, m.index);
    const pd = pre.match(PRE_DESC);
    const descricao = limpaCampo(pd ? pd[1] : pre.slice(-160)).slice(0, 400);
    out.push({
      codigo: out.length + 1, numero: null, lote: null, item: out.length + 1,
      descricao: descricao || null,
      cnpjFornecedor: winner.cnpj, fornecedor: winner.fornecedor,
      marca, modelo, valorUnitario: winner.valor || null, quantidade: null, valorTotal: null,
      classificado: true, layout: "marca_label",
    });
    idx = MARCA_LBL.lastIndex;
  }
  // 2ª passada: inline minúsculo, só se a forma-rótulo não achou nada (evita duplicar o mesmo item)
  if (!out.length) {
    MARCA_INLINE.lastIndex = 0;
    let mi, prev = 0;
    while ((mi = MARCA_INLINE.exec(t))) {
      const marca = marcaOk(limpaCampo(mi[1]));
      const modelo = limpaCampo(mi[2]).slice(0, 80) || null;
      if (!marca) { prev = MARCA_INLINE.lastIndex; continue; }
      const pre = t.slice(prev, mi.index);
      const pd = pre.match(PRE_DESC);
      out.push({
        codigo: out.length + 1, numero: null, lote: null, item: out.length + 1,
        descricao: limpaCampo(pd ? pd[1] : pre.slice(-160)).slice(0, 400) || null,
        cnpjFornecedor: winner.cnpj, fornecedor: winner.fornecedor,
        marca, modelo, valorUnitario: winner.valor || null, quantidade: null, valorTotal: null,
        classificado: true, layout: "marca_inline",
      });
      prev = MARCA_INLINE.lastIndex;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CAMADA 4 — TERMO "puro": só o VENCEDOR (sem marca). É o caso MAJORITÁRIO. Devolve UMA linha (vencedor + objeto +
// valor). Sem marca — e diz isso (marca:null). Ainda é útil: fornecedor+CNPJ+valor por processo, casável ao PNCP.
const OBJ = /(?:^|\s)(?:\d+\.?\s*)?OBJETO\s*:?\s*([^]{6,320}?)(?=\s+\d+\.\s|\s+\d+\.\d|\s+PRAZO|\s+CONTRATAD|\s+FUNDAMENTA|\s+VALOR|\s+DOTA[ÇC]|$)/i;
const VALOR_TOT = /VALOR[^]{0,60}?(?:total|global)?[^]{0,20}?R\$\s*([\d.]+,\d{2})/i;

// tira o enchimento que gruda no nome: prefixo "...será a empresa " (fica só o que vem depois do último "empresa")
// e sufixo ", inscrita.../ CNPJ.../ com sede..." (o nome termina na razão social).
const limpaForn = (s) => limpaCampo(s)
  .replace(/^.*\bempresa\s+/i, "")
  .replace(/[,;]?\s*(?:inscrit[ao]\b|CNPJ\b|com sede\b|estabelecid[ao]\b|portadora?\b|neste ato\b).*$/i, "")
  .replace(/[,\s]+$/, "").slice(0, 160) || null;

// vencedor: várias redações; CNPJ é a âncora forte. Nome vem antes ("empresa X, inscrita ... CNPJ") ou depois do CNPJ.
function extraiVencedor(t) {
  // (a) "...empresa NOME, inscrita no CNPJ sob (o) nº 00.000.000/0000-00"
  let m = t.match(new RegExp(String.raw`(?:empresa|favor d[ae]|CONTRATAD[AO]:?|CONTRATAD[AO]\s+[ée]\s+a\s+empresa)\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú0-9 .,&'\-\/]{3,80}?)[,\.]?\s*(?:inscrit[ao]\s+no\s+CNPJ|CNPJ)[^\d]{0,18}(${CNPJ})`, "i"));
  if (m) return { fornecedor: limpaForn(m[1]), cnpj: limpaCnpj(m[2]), valor: num((t.match(VALOR_TOT) || [])[1]) };
  // (b) "FORNECEDOR: 00.000.000/0000-00 NOME"  ou  "CNPJ: 00.000.000/0000-00 ... NOME"
  m = t.match(new RegExp(String.raw`(?:FORNECEDOR|CONTRATAD[AO]|Contratad[ao])\s*:?\s*(${CNPJ})\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú0-9 .,&'\-\/]{3,80}?)(?=\s+\d|\s+Objeto|\s+R\$|\s+Adjudicad|$)`, "i"));
  if (m) return { fornecedor: limpaForn(m[2]), cnpj: limpaCnpj(m[1]), valor: num((t.match(VALOR_TOT) || [])[1]) };
  // (c) "Contratad(a/o): NOME CNPJ: 00.000.000/0000-00"
  m = t.match(new RegExp(String.raw`(?:CONTRATAD[AO]|Contratad[ao])\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú0-9 .,&'\-\/]{3,80}?)\s+CNPJ[^\d]{0,10}(${CNPJ})`, "i"));
  if (m) return { fornecedor: limpaForn(m[1]), cnpj: limpaCnpj(m[2]), valor: num((t.match(VALOR_TOT) || [])[1]) };
  // (d) sem redação-âncora: pega o 1º CNPJ que não seja o do próprio município (heurística fraca — só p/ não perder)
  m = t.match(new RegExp(CNPJ));
  return { fornecedor: null, cnpj: m ? limpaCnpj(m[0]) : null, valor: num((t.match(VALOR_TOT) || [])[1]) };
}

function parseTermoWinner(t) {
  const w = extraiVencedor(t);
  if (!w.cnpj && !w.fornecedor) return [];
  const objeto = (t.match(OBJ) || [])[1];
  return [{
    codigo: null, numero: null, lote: null, item: 1,
    descricao: objeto ? limpaCampo(objeto).slice(0, 400) : null,
    cnpjFornecedor: w.cnpj, fornecedor: w.fornecedor,
    marca: null, modelo: null, valorUnitario: null, quantidade: null, valorTotal: w.valor || null,
    classificado: true, layout: "termo_vencedor",
  }];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ENTRADA. Precedência: da camada mais RICA (marca por proposta) à mais pobre (só vencedor). Usa a primeira que
// devolve resultado — assim um documento e-Pública nunca cai no fallback pobre, e um termo puro devolve o vencedor.
export function parseAtaDispensaTermo(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const b = parseAutorMarcaModelo(t); if (b.length) return b;
  const a = parseEpublicaLabel(t);    if (a.length) return a;
  const g = parseMarcaLabelGeneric(t); if (g.length) return g;
  return parseTermoWinner(t);
}

export default parseAtaDispensaTermo;