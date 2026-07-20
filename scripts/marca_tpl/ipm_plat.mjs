// PARSER DETERMINÍSTICO DE MARCA — célula plataforma='IPM Sistemas' (ERP atende.net / IPM Sistemas Ltda).
// Roteada por contratacoes_sc.plataforma='IPM Sistemas' (o "gerador" do texto quase sempre é 'outro'; quem
// identifica a célula é a PLATAFORMA que publicou no PNCP). Zero rede, zero LLM, zero estatística: engenharia
// reversa do TEMPLATE GERADO pelo software. `node --check ipm_plat.mjs`.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ONDE A MARCA VIVE (lido do documento real, não suposto):
//
// O único artefato desta célula que carrega a MARCA DO VENCEDOR é o TERMO DE HOMOLOGAÇÃO / ATA nativo do IPM
// ("IPM Sistemas Ltda Atende.Net"), na tabela por FORNECEDOR. Cabeçalho (colunas, nesta ordem):
//
//     <codigoCliente> - <FORNECEDOR>   Item  Produto/Descrição  Unidade  Marca  Qtde  Valor Unitário  Valor Total
//
// e cada linha de item (texto do PDF achatado numa linha só):
//
//     37 CAMARA DE AR 750*16 UNIDADE TORTUGA 20 R$59,00 R$1.180,00
//     └┬┘└──────┬──────┘ └──┬──┘ └──┬──┘ └┬┘ └──┬──┘ └───┬───┘
//    numero  descrição/produto  UNIDADE  MARCA  qtd  R$unit   R$total
//     ...
//     Total do Fornecedor: R$22.620,00   <PRÓXIMO FORNECEDOR> Item Produto Unidade Marca Qtde ...
//
// A MARCA é a COLUNA entre a UNIDADE e a QTDE. Palavra "Marca" só no cabeçalho; o valor vem em cada linha.
// ÂNCORA RÍGIDA à direita = <qtd> R$<unit> R$<total>, com PROVA ARITMÉTICA qtd×unit≈total (separa item real de
// lixo de rodapé que também tem "R$"). Depois casamos numero+valorUnit ao itensApi (unit_homologado) — se não
// casar, DESCARTA (nunca pendura marca no item errado).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A REALIDADE DESTA CÉLULA (medido em amostra 60 + varredura ~400 docs com cabeçalho de marca):
//  · 70.878 processos na célula; 51.452 têm ≥1 item homologado (unit>0).
//  · O grosso dos documentos IPM é DISPENSA de alimento/merenda/agricultura familiar e SERVIÇO/OBRA — nesses a
//    coluna Marca vem VAZIA (gênero alimentício não tem marca; art. 41 veda no edital). Emitimos marca=null → nada.
//  · Onde há PRODUTO DURÁVEL (pneus, odontológico, EPI…), a coluna Marca vem PREENCHIDA com marca real
//    (TORTUGA, MAQUIRA, VIPAL, AGRATTO…). É daí que trazemos marca ao PNCP.
//  · Ruído medido e filtrado: "N/C", "MARCA PRÓPRIA", "PRÓPRIA", supplier-leak ("… LTDA/EIRELI"), e vazamento de
//    descrição quando falta rótulo de unidade — por isso EXIGIMOS um rótulo de unidade reconhecido antes da marca.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// —— utilidades numéricas ——
// "1.234,56" e "1234,56" → Number. Remove só os pontos de MILHAR (seguidos de 3 dígitos), vírgula = decimal.
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const clip = (s, n) => { const x = String(s || "").trim(); return x ? x.slice(0, n) : null; };
const eqValor = (a, b) => isFinite(a) && isFinite(b) && Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);

// —— vocabulário de UNIDADE (a régua que separa DESCRIÇÃO | UNIDADE | MARCA) ——
// A marca começa DEPOIS do último rótulo de unidade da linha. Lista ampla (rótulos vistos no corpus IPM).
// Multi-palavra (METRO CUBICO) vem antes das simples para casar por completo.
const UNID = [
  "METROS?\\s+LINEARES?", "METRO\\s+C[UÚ]BICO", "METRO\\s+QUADRADO", "MET\\.?\\s+C[UÚ]BICO", "QUILOGRAMAS?", "QUIL[OÔ]METROS?",
  "UNIDADES?", "UNID", "UND", "UN", "PARES?", "PAR", "KITS?", "CONJUNTOS?", "CJ", "EMBALAGENS?", "EMB",
  "CENTO", "MILHEIRO", "RESMAS?", "ROLOS?", "BOBINAS?", "METROS?", "MT", "M2", "M3", "M[ÉE]TRO",
  "PC", "PE[ÇC]AS?", "CX", "CAIXAS?", "FARDOS?", "FRASCOS?", "FR", "GAL[ÃA]O", "GL", "BALDES?",
  "POTES?", "LATAS?", "SACOS?", "SACH[EÊ]S?", "TUBOS?", "BLOCOS?", "BARRAS?", "BISNAGAS?", "AMPOLAS?",
  "COMPRIMIDOS?", "CP", "D[UÚ]ZIAS?", "DZ", "LITROS?", "MILILITROS?", "ML", "QUILO", "KG", "GRAMAS?", "GR",
  "TONELADAS?", "TON", "SERVI[ÇC]OS?", "SERV", "M[ÊE]S", "MESES", "DIAS?", "DI[ÁA]RIAS?", "HORAS?",
  "VERBA", "GLOBAL", "OBRA", "VB", "PT", "LT", "SC", "BD", "PACOTES?", "PCT", "BANDEJAS?", "GARRAFAS?",
  "AMPOLA", "DOSE", "ENVELOPES?", "L", "H",
].join("|");
const RE_UNID_END = new RegExp("(?:^|\\s)(?:" + UNID + ")\\s*$", "i");        // blob termina em unidade → marca vazia
const RE_UNID_ANY = new RegExp("\\b(?:" + UNID + ")\\b", "gi");               // achar o ÚLTIMO rótulo de unidade

// —— cabeçalho da tabela por fornecedor (várias grafias do mesmo layout) e o fecho do bloco ——
const CAB = /Item\s+(?:Produto|Descri[cç][aã]o|Produto\s*\/?\s*Descri[cç][aã]o)\s+Unidade\s+Marca\s+(?:Qtde?|Quant\.?|Quantidade|Qtd)\s+Valor\s+Unit[aá]rio\s+Valor\s+Total/gi;
const TOTAL_FORN = /Total\s+do\s+Fornecedor\s*:?\s*(?:\(R\$\)\s*:?)?\s*R?\$?\s*([\d.]+,\d{2})/gi;

// —— rodapés/blocos legais que o extrator de PDF injeta NO MEIO da tabela (senão o número de página vira "item") ——
function limpaRodape(t) {
  return t
    .replace(/P[áa]g\.?\s*\d+\s*\/\s*\d+\s+IPM\s+Sistemas\s+Ltda[\s\S]*?Emitido por:[\s\S]*?\d{2}:\d{2}:\d{2}\s*(?:-?\d{2}:\d{2})?\s*-?/gi, " ")
    .replace(/[\w.]*\.atende\.net\s+P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    .replace(/www\.[\w.]+\s+P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    .replace(/MUNIC[IÍ]PIO\s+DE\s+[A-ZÀ-Ú ]+?\s+Compras e Contratos\s+Termo\s+Homologa[çc][ãa]o[\s\S]{0,220}?Emitido por:[\s\S]*?\d{2}:\d{2}:\d{2}\s*(?:-?\d{2}:\d{2})?/gi, " ")
    .replace(/Processo\s+(?:N[°ºo:]|Administrativo)[\s\S]*?P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    .replace(/P[áa]gina\s+\d+\s+de\s+\d+/gi, " ")
    .replace(/\s+/g, " ");
}

// —— LINHA DE ITEM: <numero> <blob = DESC…UNIDADE…MARCA> <qtd> R$<unit> R$<total> ——
// g1=numero  g2=blob  g3=qtd (decimais opcionais)  g4=unit  g5=total
// numero não pode colar em dígito/vírgula/ponto (senão pega pedaço do total anterior); descrição inicia em MAIÚSCULA/"(".
const ITEM = new RegExp(
  "(?<![\\d.,])(\\d{1,4})\\s+([A-ZÀ-Ú(\"][\\s\\S]{4,1400}?)\\s+" +
  "(\\d[\\d.]*(?:,\\d{1,3})?)\\s+R\\$\\s*([\\d.]*,\\d{2,4})\\s+R\\$\\s*([\\d.]*,\\d{2,4})(?=\\s|$)",
  "g",
);
// ruído de cabeçalho/rodapé que, se estiver no blob, prova que a "linha" não é item de verdade.
const RUIDO = /Valor\s+Unit|Valor\s+Total|Total\s+do\s+Fornecedor|Identificador|Emitido por|P[áa]gina\s+\d|atende\.net|Item\s+Produto|Item\s+Descri|Qtde\s+Valor/i;

// marca inválida = supplier-leak (razão social) ou vazamento de prosa. Complementa o normalizaMarca (própria/N-C…).
const SUPPLIER = /\b(LTDA|EIRELI|EPP|MEI|S\/?A|S\.A|CIA|COM[ÉE]RCIO|COMERCIAL|IND[UÚ]STRIA|DISTRIBUID|FLORICULTURA|ENGENHARIA|TRANSPORTES?|SERVI[ÇC]OS?\s+LTDA)\b/i;
// SERVIÇO/OBRA/LOCAÇÃO: não têm marca de PRODUTO — a coluna Marca vem vazia ou vaza prosa. Se a descrição é de
// serviço, não emitimos marca (evita "ÁRIO JOGO", nome de pessoa em conserto, etc.).
const SERVICO = /PRESTA[ÇC][ÃA]O\s+DE\s+SERVI|SERVI[ÇC]O\s+DE\s|LOCA[ÇC][ÃA]O|MANUTEN[ÇC][ÃA]O|M[ÃA]O\s+DE\s+OBRA|ARBITRAGEM|CONSERTO|VULCANIZA|BALANCEAMENTO|INSTALA[ÇC][ÃA]O\s+DE|REFORMA|M[ÃA]O\s+DE\s+OBRA/i;

// SEM_MARCA local (própria/serviço/obra/s-marca/n-a/n-c/diversos) — igual ao normalizaMarca compartilhado, embutido
// p/ este arquivo ser autossuficiente (sem import de rede/fs).
const SEM_MARCA = /^\s*(marca\s+)?(pr[oó]pri[ao]s?|pr[ãa]\W*\s*pri[ao]s?|servi[çc]os?|obras?|s\/?\s*marca|sem\s+marca|n\/?[ac]|n\.?[ac]\.?|n[aã]o\s+se\s+aplica|nao\s+informad[ao]|diversos?|-{1,3}|\.+|s\/?m)\s*$/i;
// vazamento de PERIODICIDADE/prosa de serviço (unidade "H"/"MÊS" seguida de "SEMANAL)"/"MENSAL"/parêntese).
const PROSA_LEAK = /[()]|^\s*(mensal|semanal|anual|di[áa]ri[ao]|quinzenal|hor[áa]ri[ao]|semestral|trimestral)\b/i;

function normMarca(s) {
  let m = String(s || "").trim().replace(/^[.\-–:/\s]+|[.\-–:/\s]+$/g, "").replace(/\s+/g, " ");
  if (!m || m.length < 2 || m.length > 60) return null;
  if (SEM_MARCA.test(m)) return null;                 // própria/serviço/N-C/diversos/…
  if (/\bpr[oó]pri[ao]s?\s*$/i.test(m)) return null;  // "...PRÓPRIA" no fim ⇒ auto-declaração de sem-marca
  if (PROSA_LEAK.test(m)) return null;                // periodicidade / parêntese ⇒ prosa vazada
  if (/[¹²³⁰⁴-⁹]/.test(m)) return null;               // superscritos ⇒ vazamento de descrição (medidas)
  if (/^[\d\W]+$/.test(m)) return null;               // sem letra (ex.: "3 M" fica; "13/14" cai)
  if ((m.match(/[A-Za-zÀ-ÿ]/g) || []).length < 2) return null;
  if (SUPPLIER.test(m)) return null;                  // razão social vazada
  if (RE_UNID_END.test(m) || new RegExp("^(?:" + UNID + ")$", "i").test(m)) return null; // rótulo de unidade vazado (EMBALAGEM/PACOTE)
  // de-dup de repetição do bloco Marca/Modelo achatado: "MAQUIRA MAQUIRA", "3R/ MICRODONT 3R/ MICRODONT",
  // "PERFECT D PERFECT" (marca reaparece). Corta na 2ª ocorrência da 1ª palavra.
  let w = m.split(" ");
  if (w.length > 1) {
    const rep = w.slice(1).indexOf(w[0]);
    if (rep >= 0) { w = w.slice(0, rep + 1); m = w.join(" "); }
  }
  if (w.length > 3) return null;                      // muito longo p/ ser marca ⇒ vazamento; descarta
  return m;
}

// separa o blob em {marca}. A marca começa DEPOIS do ÚLTIMO rótulo de unidade da linha.
// Se o blob TERMINA num rótulo de unidade → marca vazia (linha de alimento/serviço). Se NÃO há rótulo de
// unidade reconhecido → não arriscamos (evita supplier-leak/descrição): marca null.
function extraiMarca(blob) {
  const b = String(blob || "").trim();
  if (RE_UNID_END.test(b)) return null;               // termina em unidade ⇒ coluna Marca vazia
  RE_UNID_ANY.lastIndex = 0;
  let mm, last = null;
  while ((mm = RE_UNID_ANY.exec(b))) last = mm;
  if (!last) return null;                             // sem unidade reconhecida ⇒ não confiar
  return normMarca(b.slice(last.index + last[0].length));
}

function validaLinha(qtd, unit, total) {
  if (total <= 0 || qtd <= 0 || unit <= 0) return false;
  return Math.abs(qtd * unit - total) / total < 0.03; // prova aritmética
}

/**
 * parse(texto, itensApi) → [{numero, marca, modelo, valorUnit, confianca:'alta'|'media', template:'ipm'}]
 *   · Só emite item cujo (numero + valorUnit) casa com um item homologado de itensApi (unit_homologado).
 *   · Só emite quando a coluna Marca traz marca REAL de produto (marca !== null); linhas de alimento/serviço
 *     (coluna vazia / "própria" / "N/C") NÃO geram saída — seria pendurar nada, ou marca falsa.
 * itensApi: [{numero, unit_homologado, quantidade, ...}] (situacao='Homologado', unit_homologado>0).
 */
export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  const t = limpaRodape(String(texto).replace(/\s+/g, " "));

  // índice dos itens da API por numero (só homologados com valor) + razão social do fornecedor (p/ guarda anti-leak).
  const byNum = new Map();
  const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const it of itensApi) {
    const n = parseInt(it.numero, 10);
    const u = num(it.unit_homologado);
    if (Number.isFinite(n) && u > 0 && !byNum.has(n)) byNum.set(n, { unit: u, forn: norm(it.fornecedor) });
  }
  if (!byNum.size) return out;
  // sinais de FABRICANTE/importador: se o vencedor é indústria, "marca == nome do vencedor" é marca LEGÍTIMA
  // (fabricante vendeu direto, ex.: MAQUIRA INDÚSTRIA → marca MAQUIRA). Só é leak quando o vencedor é REVENDA.
  const FABRICANTE = /IND[UÚ]STRIA|INDUSTR|F[ÁA]BRICA|FABRIC|IMPORTA|LABORAT|IND\b/;

  // esta célula só carrega marca quando existe o cabeçalho da tabela por fornecedor.
  if (!CAB.test(t)) return out;
  CAB.lastIndex = 0;

  const usados = new Set();
  const emit = (numero, marca, unit) => {
    if (usados.has(numero)) return;
    usados.add(numero);
    out.push({ numero, marca: clip(marca, 60), modelo: null, valorUnit: unit, confianca: "alta", template: "ipm" });
  };

  // varre por bloco de fornecedor (cabeçalho → "Total do Fornecedor" | próximo cabeçalho | fim).
  const cabs = [...t.matchAll(CAB)];
  for (let i = 0; i < cabs.length; i++) {
    const ini = cabs[i].index + cabs[i][0].length;
    TOTAL_FORN.lastIndex = ini;
    const mf = TOTAL_FORN.exec(t);
    const fim = mf && (!cabs[i + 1] || mf.index < cabs[i + 1].index) ? mf.index
      : (cabs[i + 1] ? cabs[i + 1].index : t.length);
    const trecho = t.slice(ini, fim);
    for (const m of trecho.matchAll(ITEM)) {
      const numero = parseInt(m[1], 10);
      const qtd = num(m[3]), unit = num(m[4]), total = num(m[5]);
      if (!validaLinha(qtd, unit, total)) continue;
      if (RUIDO.test(m[2]) || SERVICO.test(m[2])) continue;            // serviço/obra ⇒ sem marca de produto
      const api = byNum.get(numero);
      if (api === undefined || !eqValor(api.unit, unit)) continue;      // âncora: numero + valor
      const marca = extraiMarca(m[2]);
      if (!marca) continue;                                            // coluna Marca vazia/ruído ⇒ nada a trazer
      // guarda anti-leak: marca == nome do PRÓPRIO vencedor E o vencedor é REVENDA (não fabricante) ⇒ é o nome
      // comercial vazado na coluna (ex.: "FLORIARTE" de FLORICULTURA FLORIARTE), não marca de produto.
      if (api.forn && !FABRICANTE.test(api.forn)) {
        const fTok = new Set(api.forn.split(/[^A-Z0-9]+/).filter((w) => w.length >= 4));
        if (norm(marca).split(/[^A-Z0-9]+/).some((w) => w.length >= 4 && fTok.has(w))) continue;
      }
      emit(numero, marca, unit);
    }
  }
  return out;
}

export default { parse };
