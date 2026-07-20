// PARSER DETERMINÍSTICO — IPM Sistemas / atende.net (id do gerador: 'ipm').
// Rotear por arquivo_texto_sc.gerador='outro' + assinatura no texto/título (a plataforma do PNCP só diz quem PUBLICOU).
//
// COBERTURA = "vencedor" ([[mapa_atas_plataformas]]): o município com ERP IPM publica no PNCP o RESULTADO já consolidado
// (Termo_de_Homologacao / Ata_de_Registro_de_Precos_Consolidada), com o VENCEDOR de cada item + MARCA + MODELO + valor.
// Não há proposta-a-proposta de todos os licitantes (isso mora no portal onde rodou a sessão), então NÃO gravamos
// concorrentes — seria inventar granularidade que o documento não tem.
//
// ESTRUTURA REAL (lida do documento, não suposta) — o layout que CARREGA MARCA é o de tabela consolidada por fornecedor
// (gerado pela CINCATARINA/consórcios e por municípios com IPM). Texto achatado pelo extrator de PDF (uma linha só):
//
//   <FORNECEDOR> Item Descrição Unid. Marca/Modelo Qtde Valor Unit. Total
//   2 ANTENA PARA REDE DE VÔLEI. ...(CIN29125) PAR DALEBOL / ANTENA DE VÔLEI 1.058,00 R$ 64,50 R$ 68.241,00
//   3 APITO PROFISSIONAL ... (CIN 22945) UNIDADE DALEBOL / APITO PROFISSIONAL 2.629,00 R$ 5,56 R$ 14.617,24
//   ...
//   Total do Fornecedor (R$): 4.682.347,77 <PRÓXIMO FORNECEDOR> Item Descrição Unid. Marca/Modelo ...
//
//   Cada LINHA DE ITEM =  <nº> <DESCRIÇÃO> <UNIDADE> <MARCA> / <MODELO> <QTD> R$ <UNIT> R$ <TOTAL>
//   Âncora RÍGIDA (à direita) = os 3 números finais:  <QTD> R$ <UNIT> R$ <TOTAL>.  Separador de marca/modelo = " / ".
//
// ⚠️ 5 ARMADILHAS, TODAS vistas no texto real (nenhuma seria adivinhada):
//  1. PDF ACHATADO: o rodapé/legal repete NO MEIO da tabela ("...113.185,44 Processo N°: 000037/2025 ... Página 1 de 10
//     47 BOLA DE FUTSAL ..."). Se não for removido ANTES, o número da página ("1885") vira "código do item" e polui a
//     descrição. → strip do bloco legal/rodapé antes de casar.
//  2. O "/" do CABEÇALHO ("Marca/Modelo") e dos rodapés ("Pág 7 / 15", "Data ... / SC") NÃO têm espaço nos dois lados;
//     o separador de marca é " / " (espaço-barra-espaço). Casar SÓ `\s\/\s` evita esses falsos positivos.
//  3. QTD SEM DECIMAIS: registro de preço traz quantidade grande sem ",dd" ("MILI / BABY P 486.247 R$ 0,61 ...") — a
//     qtd é `[\d.]+(?:,\d{1,3})?` (decimais OPCIONAIS), senão o item some.
//  4. O número do item NÃO pode estar colado a dígito/./, senão o parser pega um pedaço do valor total anterior como
//     "código". Lookbehind `(?<![\d.,])` + a descrição começa com MAIÚSCULA/`(` resolvem.
//  5. MARCA ≈ conteúdo da coluna Marca (entre a UNIDADE e o " / "). Uso o vocabulário de UNIDADE como régua p/ separar
//     descrição|unidade|marca; sem unidade reconhecida, caio no heurístico "marca = última palavra antes do / " (mesma
//     filosofia do parser_ecustomize). Multi-palavra de marca rara pode perder a 1ª palavra — anotado.
import { normalizaMarca } from "./mapa_atas_plataformas.mjs";

const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const clip = (s, n) => { const x = String(s || "").trim(); return x ? x.slice(0, n) : null; };

// —— rodapés/blocos legais que o extrator de PDF injeta NO MEIO das tabelas (armadilha 1/2) ——
// removidos ANTES de casar itens; sem eles um "1885"/"7 de 10" viraria código e a descrição carregaria lixo.
function limpaRodape(t) {
  return t
    // bloco legal repetido da homologação/adjudicação (CINCATARINA e afins): começa em "Processo N°"/"Processo Administrativo"
    // e vai até "Página N de N" — é o cabeçalho de página que reaparece a cada quebra.
    .replace(/Processo\s+(?:N[°ºo:]|Administrativo)[\s\S]*?P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    // rodapé nativo IPM: "... Pág 7 / 15 IPM Sistemas Ltda Identificador: ... - Emitido por: FULANO 16/05/2024 15:37:39 -"
    .replace(/P[áa]g\.?\s+\d+\s*\/\s*\d+\s+IPM\s+Sistemas\s+Ltda\s+Identificador:[\s\S]*?Emitido por:[\s\S]*?\d{2}:\d{2}:\d{2}\s*-?/gi, " ")
    // rodapé do Portal (alguns municípios IPM rodam a sessão no Portal e anexam a ata dele)
    .replace(/A autenticidade do documento[\s\S]*?(?:C[óo]digo verificador:\s*\w+|portaldecompraspublicas\.com\.br)/gi, " ")
    .replace(/Documento gerado eletronicamente[\s\S]*?(?:C[óo]digo verificador:\s*\w+|P[áa]gina\s+\d+\s+de\s+\d+)/gi, " ")
    // sobras de rodapé (endereço/CNPJ do órgão + "Página N de N" solto)
    .replace(/P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    .replace(/\s+/g, " ");
}

// vocabulário de UNIDADE (régua p/ tirar o rótulo de unidade da descrição). Rótulos vistos: UNIDADE, PAR, KIT, EMBALAGEM…
const UNID = "UNIDADE|UNID|UND|UN|PAR|KIT|CONJUNTO|CJ|EMBALAGEM|EMB|CENTO|MILHEIRO|RESMA|ROLO|BOBINA|M[ÊE]TRO|MT|M2|M3|M|PC|P[ÇC]|PE[ÇC]A|CX|CAIXA|FARDO|FD|FRASCO|FR|GAL[ÃA]O|GL|BALDE|BD|POTE|PT|LATA|LT|SACO|SC|SACHE|TUBO|TB|BLOCO|BL|BARRA|BR|BISNAGA|AMPOLA|COMPRIMIDO|CP|D[UÚ]ZIA|DZ|LITRO|L|MILILITRO|ML|QUILO|QUILOGRAMA|KG|GRAMA|G|TONELADA|TON|T|SERVI[ÇC]O|SERV|SRV|M[ÊE]S|DIA|HORA|H|VERBA|VB|GLOBAL";

// —— LINHA DE ITEM da tabela consolidada (carrega MARCA) ——
// g1=nº do item  g2="DESCRIÇÃO … MARCA" (pré-barra)  g3=MODELO  g4=QTD  g5=UNIT  g6=TOTAL
//  · g2 é lazy e PÁRA no 1º " / " (espaço-barra-espaço) → separador real de marca/modelo (armadilha 2)
//  · g1 não pode colar em dígito/./, (armadilha 4); a descrição começa com maiúscula/acentuada/"(".
//  · qtd com decimais OPCIONAIS (armadilha 3); unit/total sempre "R$ …,dd".
// A separação marca/descrição é heurística (marca ≈ última palavra antes do " / "); a PROVA de que a linha é um item
// de verdade (e não lixo de rodapé/cabeçalho que também tem "/" e "R$") é ARITMÉTICA: qtd × unit ≈ total (validaLinha).
const ITEM = new RegExp(
  "(?<![\\d.,])(\\d{1,5})\\s+([A-ZÀ-Ú(\"][\\s\\S]{3,650}?)\\s+\\/\\s+([\\s\\S]{1,90}?)\\s+" +
  "([\\d.]+(?:,\\d{1,3})?)\\s+R\\$\\s*([\\d.]+,\\d{2,4})\\s+R\\$\\s*([\\d.]+,\\d{2,4})(?=\\s|$)",
  "g",
);
// ruído de cabeçalho/rodapé que, se aparecer na descrição/marca, prova que NÃO é uma linha de item.
const RUIDO = /P[áa]g\.?\b|P[áa]gina|Pre[çc]o\s+Unit|Quantidade\s+Valor|Valor\s+Unit|Total\s+do\s+Fornecedor|Identificador|Emitido por|Marca\s*\/\s*Modelo|Diário|diariomunicipal|https?:/i;
// qtd × unit ≈ total (tolerância 3%). É o filtro que separa item real de coincidência "…/… R$ … R$ …" de rodapé.
function validaLinha(qtd, unit, total) {
  if (total <= 0 || qtd <= 0 || unit <= 0) return false;
  return Math.abs(qtd * unit - total) / total < 0.03;
}

// cabeçalho da coluna (marca a fronteira do bloco por fornecedor) e o rótulo de fechamento do bloco.
const CAB_COL = /Item\s+Descri[çc][ãa]o\s+Unid\.?\s+Marca\s*\/\s*Modelo\s+Qtde\s+Valor\s+Unit\.?\s+(?:Valor\s+)?Total/gi;
const TOTAL_FORN = /Total\s+do\s+Fornecedor\s*\(R\$\):\s*([\d.]+,\d{2})/gi;
// resíduo do cabeçalho colado no fim da descrição do 1º item do bloco (o "Total Item" que sobra antes do nº).
const CAB_RESID = /(?:Valor\s+Unit\.?\s+(?:Valor\s+)?Total|Marca\s*\/\s*Modelo|^Item)\s*/i;

// separa o blob pré-barra (g2) em {descricao, unidade, marca}.
//  · MARCA = última palavra antes do " / " (filosofia do parser_ecustomize). Guarda: se for número puro, recua uma.
//  · UNIDADE = rótulo do vocabulário logo antes da marca (HOM: "…UNIDADE DALEBOL /") — vira null se não houver
//    (ARP põe a unidade no INÍCIO do item, então some da marca; ok, fica embutida na descrição p/ o casamento).
const TRAILING_UNID = new RegExp("\\s+(" + UNID + ")$", "i");
// palavras que NÃO são marca (aparecem como "última palavra antes do /" em linhas de SERVIÇO/DIÁRIA que passaram na
// prova aritmética por acaso). Marca de verdade é substantivo próprio; estas são conectivos/genéricos do texto.
const NAO_MARCA = /^(por|para|com|sem|de|da|do|dos|das|e|ou|no|na|nos|nas|em|dia|dias|hora|horas|m[êe]s|meses|ano|anos|unidade|servi[çc]o|di[áa]ria|convidados?|pessoas?|km|kg)$/i;
// marca válida = 2..40 chars, ≥2 letras, sem "/", não é palavra-conectivo/genérica.
function marcaValida(m) {
  if (!m) return false;
  const s = m.trim();
  if (s.length < 2 || s.length > 40 || s.includes("/")) return false;
  if ((s.match(/[A-Za-zÀ-ÿ]/g) || []).length < 2) return false;
  if (NAO_MARCA.test(s)) return false;
  return true;
}
function separaDescUnidMarca(blob) {
  const b = String(blob || "").replace(CAB_RESID, "").replace(/[(\[]CIN\s?\d+[)\]]\s*$/i, "").trim();
  const w = b.split(/\s+/);
  if (!w.length) return { descricao: null, unidade: null, marca: null };
  let mi = w.length - 1;
  // marca não é número puro nem código-de-catálogo; recua até achar um token "de marca".
  while (mi > 0 && /^[\d.,/-]+$/.test(w[mi])) mi--;
  let marca = w[mi] || null;
  if (!marcaValida(marca)) marca = null;               // resíduo ambíguo (serviço/diária): não inventa marca
  let resto = w.slice(0, marca ? mi : w.length).join(" ").trim();   // descrição + (talvez) unidade
  let unidade = null;
  const um = resto.match(TRAILING_UNID);
  if (um) { unidade = um[1]; resto = resto.slice(0, resto.length - um[0].length).trim(); }
  return { descricao: resto || null, unidade, marca };
}

// —— fornecedores do layout consolidado (Termo de Homologação): cada bloco fecha em "Total do Fornecedor" e o
// nome do PRÓXIMO vem logo antes do cabeçalho "Item Descrição Unid. Marca/Modelo…". ——
function mapaFornecedores(t) {
  // posições dos cabeçalhos de coluna; o fornecedor é o texto ENTRE (fim do bloco anterior) e o cabeçalho.
  const cabs = [...t.matchAll(CAB_COL)];
  if (!cabs.length) return [];
  const blocos = [];
  let prevFim = 0;
  for (let i = 0; i < cabs.length; i++) {
    const cab = cabs[i];
    // nome = trecho antes do cabeçalho, a partir do último "Total do Fornecedor" (ou início) até o cabeçalho.
    let pre = t.slice(prevFim, cab.index);
    const tf = [...pre.matchAll(TOTAL_FORN)];
    if (tf.length) { const last = tf[tf.length - 1]; pre = pre.slice(last.index + last[0].length); }
    let nome = pre.replace(/[^A-Za-zÀ-ÿ0-9&.\-/ ]+/g, " ").replace(/\s+/g, " ").trim();
    // o nome da empresa é o RABO do pre (as últimas ~10 palavras em caixa alta), sem lixo de rodapé.
    const pal = nome.split(" ");
    if (pal.length > 12) nome = pal.slice(-12).join(" ");
    // início do bloco de itens = fim do cabeçalho; fim = próximo "Total do Fornecedor" após o cabeçalho.
    const ini = cab.index + cab[0].length;
    TOTAL_FORN.lastIndex = ini;
    const mfim = TOTAL_FORN.exec(t);
    const fim = mfim ? mfim.index + mfim[0].length : (cabs[i + 1] ? cabs[i + 1].index : t.length);
    blocos.push({ fornecedor: clip(nome, 160), ini, fim });
    prevFim = fim;
  }
  return blocos;
}

// extrai os itens (com marca) de um trecho, opcionalmente amarrando um fornecedor.
function itensDoTrecho(trecho, fornecedor) {
  const out = [];
  for (const m of trecho.matchAll(ITEM)) {
    const qtd = num(m[4]), unit = num(m[5]), total = num(m[6]);
    // PROVA aritmética (qtd×unit≈total) + rejeição de ruído: sem isso, "/" e "R$" de rodapé viram item-fantasma.
    if (!validaLinha(qtd, unit, total)) continue;
    if (RUIDO.test(m[2]) || RUIDO.test(m[3])) continue;
    const { descricao, unidade, marca } = separaDescUnidMarca(m[2]);
    const modelo = m[3].trim();
    out.push({
      codigo: parseInt(m[1], 10),
      numero: null,                       // preenchido por casaItens (numeroItem REAL do PNCP)
      descricao: clip(descricao, 600),
      unidade: unidade || null,
      cnpjFornecedor: null,               // o resultado consolidado do IPM nomeia o fornecedor, sem CNPJ na tabela
      fornecedor: fornecedor || null,
      marca: normalizaMarca(marca) ? clip(normalizaMarca(marca), 80) : null,
      modelo: clip(modelo, 120),
      quantidade: qtd,
      valorUnitario: unit,
      valorTotal: total,
      classificado: true,                 // tabela = itens HOMOLOGADOS/ADJUDICADOS (vencedores)
    });
  }
  return out;
}

// —— FALLBACK: adjudicação NATIVA do IPM (chamada pública / agricultura familiar) ——
// "IPM Sistemas Ltda Identificador…". Linha de item = "<nº> <DESCRIÇÃO> <UNIDADE> R$ <valorUnit>" (SEM marca, SEM total).
// Cobertura = vencedor + valor unitário (marca ausente: é gênero alimentício da agricultura familiar). Fiel: marca=null.
const ITEM_NATIVO = new RegExp(
  "(?<![\\d.,])(\\d{1,4})\\s+([A-ZÀ-Ú(\"][\\s\\S]{5,900}?)\\s+(" + UNID + ")\\s+R\\$\\s*([\\d.]+,\\d{2,4})(?=\\s|$)",
  "gi",
);
function parseNativo(t) {
  const out = [];
  for (const m of t.matchAll(ITEM_NATIVO)) {
    out.push({
      codigo: parseInt(m[1], 10), numero: null,
      descricao: clip(m[2].replace(CAB_RESID, "").replace(/Item\s+Descri[çc][ãa]o[\s\S]*$/i, ""), 600),
      unidade: m[3].trim(), cnpjFornecedor: null, fornecedor: null,
      marca: null, modelo: null,
      quantidade: 0, valorUnitario: num(m[4]), valorTotal: 0,
      classificado: true, layout: "ipm-nativo",
    });
  }
  return out;
}

/** parseAtaIpm(texto) → array por item (vencedor): {codigo, numero, descricao, cnpjFornecedor, fornecedor, marca,
 *  modelo, valorUnitario, quantidade, valorTotal, classificado}. `numero` fica null até casaItens (parser_az). */
export function parseAtaIpm(texto) {
  const bruto = String(texto || "").replace(/\s+/g, " ");
  const t = limpaRodape(bruto);

  // LAYOUT 1 — tabela consolidada com MARCA. Se há blocos de fornecedor, amarra fornecedor↔item; senão varre global.
  const blocos = mapaFornecedores(t);
  let out = [];
  if (blocos.length) {
    for (const b of blocos) out = out.concat(itensDoTrecho(t.slice(b.ini, b.fim), b.fornecedor));
  }
  // ATA DE REGISTRO consolidada (e afins) não tem "Total do Fornecedor"/cabeçalho — mas a MESMA gramática de item vale.
  // Se os blocos não cobriram (ou nem existem), varre o texto inteiro pela linha de item com marca.
  if (!out.length) out = itensDoTrecho(t, null);

  // LAYOUT 2 — adjudicação nativa (sem marca) só se o layout 1 não rendeu e a assinatura nativa está presente.
  if (!out.length && /IPM\s+Sistemas\s+Ltda\s+Identificador/i.test(bruto)) out = parseNativo(t);

  // dedup defensivo: o mesmo item pode reaparecer entre páginas (código + valorTotal iguais).
  const visto = new Set();
  return out.filter((r) => {
    const k = r.codigo + "|" + r.valorTotal + "|" + (r.marca || "") + "|" + (r.modelo || "");
    if (visto.has(k)) return false;
    visto.add(k);
    return true;
  });
}

export default parseAtaIpm;