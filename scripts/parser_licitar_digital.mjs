// PARSER DETERMINÍSTICO — LICITAR DIGITAL (arquivo_texto_sc.gerador='licitar_digital').
// Rotear pelo `gerador` (assinatura no texto), NÃO pela plataforma do PNCP ([[mapa_atas_plataformas]]).
//
// 🎁 BÔNUS deste formato: a marca NÃO precisa de heurística. O Licitar Digital emite CAMPOS ROTULADOS por item:
//   "Marca: <m> Fabricante: <f> Modelo: <x>".  Determinístico puro — sem split "marca≈última unidade" do ECustomize.
//   (Quando o objeto é serviço/combustível, os três campos vêm VAZIOS — é fiel: não há marca. normalizaMarca→null.)
//
// DOIS layouts de resultado carregam marca (medido 2026-07-15 em SC; ambos com a MESMA célula de item):
//  A) "FORNECEDORES HABILITADOS"  — agrupado por Fornecedor (vencedor/habilitado do lote). Célula tem Sub Total.
//  B) "ATA DE PROPOSTAS ENVIADAS" — TODAS as propostas de TODOS os fornecedores por lote (cobertura completa da
//     disputa). Célula tem só "Unitário Proposto" (sem subtotal) + "Avaliação da proposta: Classificado".
// Também aparecem "ATA PREGÃO"/"ATA DISPENSA" (ata de sessão) com as mesmas células. O parser é agnóstico ao layout:
// casa a CÉLULA (valor + rótulos Marca/Fabricante/Modelo) e associa descrição/fornecedor/lote por posição.
//
// ⚠️ ARMADILHAS reais (lidas no texto, não supostas):
//  1. RODAPÉ/CABEÇALHO de página vaza NO MEIO do bloco: a faixa espaçada "E S T A D O D E S A N T A ... Licitar
//     Digital :: <ente> Página N de M" cai entre "Descrição Comprador" e a célula. Aqui é RUÍDO PURO (nenhuma âncora
//     depende dela) → removida do texto ANTES de casar. (Diferente do Betha, onde a data do rodapé era fronteira.)
//  2. UM "Lote" pode conter VÁRIOS "Comprador" (ex.: Lote 3 = Comprador 3 ÓLEO DIESEL + Comprador 4 ARLA). Logo a
//     unidade-item é o número do COMPRADOR, não o do Lote. Chave de casamento = descrição (casaItens do parser_az).
//  3. Rótulo do CNPJ alterna "CPF/CNPJ:" (layout A) e "CNPJ/CPF:" (layout B).
//  4. PDF achatado: descrição do comprador e da célula podem repetir; usamos a do Comprador (mais limpa).
//
// ⛔ NÃO CASA (de propósito) — "Relatório de Pesquisa de Preços" (IN 65/2021): ~metade dos docs com "Marca:" deste
//    gerador são pesquisa de preços, não a ata DESTE processo. Cada item cita o *VENCEDOR* de OUTRO ente ("Fonte:
//    app2.licitardigital.com.br…", "Lote/Item: 1/1 … Janaúba-MG … Valor da Proposta Final R$ … Marca: FUJI"). A
//    marca/CNPJ/valor pertencem à contratação de REFERÊNCIA, não a cnpj/ano/seq. Atribuí-los aqui seria erro de
//    fidelidade ([[pnigp-mina-precos-referencia]]). Felizmente a célula deles ("Valor da Proposta Final R$ X Marca:")
//    NÃO tem o trio "<qtd> <unidade> <preço>" que a CELL exige → o parser os ignora naturalmente (0 linhas). Fica a
//    ressalva: extrair pesquisa de preços como benchmark é outro produto, com atribuição ao ente-fonte.
import { normalizaMarca } from "./mapa_atas_plataformas.mjs";

const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => String(s).replace(/[^\d]/g, "");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
// assinatura de item = descrição normalizada. É a CHAVE de casamento (casaItens usa `r.lote ?? r.item`): o número
// impresso "Comprador N" REINICIA por lote (quase sempre 1) → inútil como chave; a descrição é a identidade real.
const sigDesc = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

// faixa de cabeçalho/rodapé de página do Licitar Digital. A run "E S T A D O D E ..." (letras soltas) precede
// "Licitar Digital :: <ente> Página N de M". Tudo isso é ruído; removê-lo do texto normalizado é seguro.
const RODAPE = /(?:(?:[A-ZÀ-Ú]\s){6,})?Licitar Digital\s*::[\s\S]*?P[áa]gina\s+\d+\s+de\s+\d+/gi;

// bloco do fornecedor. Âncora forte = rótulo CNPJ + CNPJ/CPF completo. Nome é o campo fuzzy (mesma arquitetura dos
// outros parsers: identidade = CNPJ, nome = atributo). "Avaliação da proposta: X" só existe no layout B.
const FORN = /Fornecedor:\s*(.{2,120}?)\s*(?:CPF\/CNPJ|CNPJ\/CPF)\s*:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2}|\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2}|\d{11,14})(?:[\s\S]{0,160}?Avalia[çc][ãa]o da proposta:\s*([A-Za-zÀ-ú]+))?/gi;

// posição de cada "Lote N" (informativo; a chave de item é o Comprador).
const LOTE = /\bLote\s+(\d+)\b/gi;

// ── DUAS ÂNCORAS INDEPENDENTES (mais robusto que um regex só) ────────────────────────────────────────────────
// Descobri (medindo cobertura) que amarrar tudo a UM regex que exige o CABEÇALHO exato da coluna perde ~4% das
// células quando o cabeçalho muda de forma (a coluna de valor é "Unitário Sub Total" | "Unitário Proposto" |
// "Desconto Final" | "Desconto Proposto"…). O INVARIANTE real do formato é a CÉLULA de valor colada ao rótulo
// "Marca: … Fabricante: … Modelo:". Então: (1) CELL casa a célula sem depender do cabeçalho; (2) COMPRADOR casa a
// descrição+número; associo os dois por POSIÇÃO (a descrição que rege a célula é a última "Descrição Comprador"
// antes dela). Mesma filosofia dos outros parsers: âncora rígida (valor+rótulo) faz o trabalho; o resto por posição.

// COMPRADOR: nº do item impresso + descrição. Corta no PRÓXIMO "Descri…" (o cabeçalho "Descrição do Fornecedor…"/
// "Descrição Quantidade…" SEMPRE começa com "Descri"), sem depender das palavras do cabeçalho.
const COMPRADOR = /Descri[çc][ãa]o Comprador\s*(\d+)\s*[-–]\s*([\s\S]{1,2600}?)(?=\s+Descri[çc][ãa]o\b|\s+Fornecedor:|\s+Lote\s+\d|\s+Marca:|$)/gi;

// CÉLULA: <quantidade> <unidade> <valor unitário> [<subtotal>] Marca: <m> Fabricante: <f> Modelo: <x>.
//  g1=qtd, g2=unidade, g3=valorUnitário, g4=subtotal (OPCIONAL — só onde a coluna tem Sub Total), g5=marca,
//  g6=fabricante, g7=modelo.  A âncora forte = os 2–3 números seguidos IMEDIATAMENTE de "Marca:".
// ⚠️ VALOR pode terminar em "%": no registro por DESCONTO o "unitário" é um PERCENTUAL ("1,00 UNI 0,30%") — o `%?`
//    opcional evita que a célula suma. (Aí valorUnitario guarda o % de desconto, não R$ — ressalva a jusante.)
// Nº com vírgula decimal protege contra pegar "Tabela 2." ou "R$ 10.000,00 (DEZ MIL…)" da descrição: só casa quando
// o trio "num unidade num [num]" vem GRUDADO em "Marca:".
const CELL = new RegExp(
  "([\\d.]+,\\d{2,4})\\s+(\\S{1,14})\\s+([\\d.]+,\\d{2,4})\\s*%?(?:\\s+([\\d.]+,\\d{2,4})\\s*%?)?\\s+" +
  "Marca:\\s*(.*?)\\s*Fabricante:\\s*(.*?)\\s*Modelo:\\s*(.*?)" +
  "(?=\\s*(?:Lote\\b|Fornecedor:|Descri[çc][ãa]o Comprador|Total de\\b|A gera[çc][ãa]o|Homologa|Documento gerado|_{5,}|$))",
  "gi",
);

/**
 * parseAtaLicitarDigital(texto) → array de propostas/itens:
 *   { codigo, numero, descricao, cnpjFornecedor, fornecedor, marca, modelo, fabricante,
 *     valorUnitario, quantidade, valorTotal, classificado, lote, item, layout }
 * `numero` sai null — preencher com casaItens(regs, itensDoPncp) do parser_az (casa por DESCRIÇÃO).
 * Determinístico: regex + âncoras (CNPJ, R$/valores, rótulos Marca/Fabricante/Modelo). Sem LLM.
 */
export function parseAtaLicitarDigital(texto) {
  // 1) remove a faixa de cabeçalho/rodapé (ruído puro) e normaliza espaços.
  const t = String(texto || "").replace(RODAPE, " ").replace(/\s+/g, " ");
  const layout = /ATA DE PROPOSTAS ENVIADAS/i.test(t) ? "propostas_enviadas"
    : /FORNECEDORES HABILITADOS/i.test(t) ? "habilitados"
    : /ATA PREGÃO|ATA DISPENSA/i.test(t) ? "ata_sessao" : "licitar_digital";

  // 2) índice dos blocos de fornecedor e das marcações de lote (para associar por posição).
  const forns = [];
  for (const m of t.matchAll(FORN)) {
    forns.push({
      pos: m.index,
      fornecedor: clean(m[1]).replace(/[,;.\-]+$/, "") || null,
      cnpj: limpaCnpj(m[2]),
      avaliacao: m[3] ? clean(m[3]) : null,
    });
  }
  const lotes = [...t.matchAll(LOTE)].map((m) => ({ pos: m.index, num: parseInt(m[1], 10) }));
  const compradores = [...t.matchAll(COMPRADOR)].map((m) => ({
    pos: m.index, num: parseInt(m[1], 10), descricao: clean(m[2]).slice(0, 600),
  }));
  const antes = (arr, idx) => { let r = null; for (const x of arr) { if (x.pos <= idx) r = x; else break; } return r; };

  // 3) uma linha por CÉLULA de valor+marca; descrição/fornecedor/lote vêm da última âncora antes da célula.
  const out = [];
  for (const m of t.matchAll(CELL)) {
    const c = antes(compradores, m.index);
    const f = antes(forns, m.index);
    const l = antes(lotes, m.index);
    const descricao = c ? c.descricao : null;
    const marca = normalizaMarca(clean(m[5]));   // vazio → null (serviço/combustível: fiel, não há marca)
    const modelo = clean(m[7]) || null;
    const fabricante = clean(m[6]) || null;
    // classificado: "Classificado"/"Desclassificado" (layout B) ou habilitado (layout A → classificado por definição).
    const classificado = f?.avaliacao
      ? /classificad/i.test(f.avaliacao) && !/desclassificad/i.test(f.avaliacao)
      : layout === "habilitados" ? true : null;
    out.push({
      codigo: c ? c.num : null,  // nº "Comprador" impresso (reinicia por lote — NÃO é identidade global)
      numero: null,              // preenchido por casaItens (parser_az) — casa por descrição ao numeroItem do PNCP
      // CHAVE de casaItens (`r.lote ?? r.item`): a descrição normalizada. Propostas do MESMO item (vários
      // fornecedores) compartilham a chave → resolvem juntas; itens distintos têm chaves distintas.
      lote: null,
      item: descricao ? sigDesc(descricao) : `__cell_${m.index}`,
      numeroLote: l ? l.num : null,  // nº do Lote (informativo; um Lote pode agrupar vários Compradores)
      descricao,
      cnpjFornecedor: f ? f.cnpj : null,
      fornecedor: f ? f.fornecedor : null,
      marca: marca || null,
      modelo: modelo ? modelo.slice(0, 120) : null,
      fabricante: fabricante ? fabricante.slice(0, 120) : null,
      quantidade: num(m[1]),
      valorUnitario: num(m[3]),
      valorTotal: m[4] ? num(m[4]) : Number((num(m[1]) * num(m[3])).toFixed(2)) || null,
      classificado,
      layout,
    });
  }
  return out;
}

export default parseAtaLicitarDigital;