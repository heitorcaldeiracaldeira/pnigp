// Parser DETERMINISTICO de MARCA — celula: BNC
//   plataforma = 'Bolsa Nacional De Compras - BNC' (~2.774 processos)
//
// Engenharia reversa (amostra de 60 procs c/ item Homologado + varredura do universo, 744 procs c/ item
// homolog / 11.436 itens). A plataforma BNC gera DOIS tipos de tabela; SO UMA carrega a marca do VENCEDOR:
//
//   TEMPLATE UNICO — "quotation_report"  (bnccompras.com/Quotation/QuotationReport)  [confianca ALTA]
//     Relatorio da cotacao/disputa. Um bloco por item, com a proposta VENCEDORA ja selecionada. Layout do
//     PDF achatado (rotulos de coluna com typos de OCR: "Parcipante", "Quandade"):
//        Item <N> <descricao> Parcipante Documento Modelo Marca Quandade Unidade Proposta Metodo
//        <FORNECEDOR> <CNPJ14> <MODELO...> <MARCA> <QTD>,<dd> <UNID> R$ <PROPOSTA> (Proposta) IMPORTADO
//        Valor unitario: R$ <UNIT> Valor total: R$ <TOTAL> Metodo: Menor valor
//     Colunas (ordem fixa): Participante | Documento(CNPJ) | Modelo | Marca | Quantidade | Unidade | Proposta.
//     A MARCA e o ULTIMO token antes de "<QTD>,<dd> <UNID> R$" (Modelo pode ser vazio, 1 ou varios tokens;
//     muito comum Modelo==Marca, ex. "ULTRAFLEX ULTRAFLEX", "CORFIO CORFIO", "KRONA KRONA").
//     Ancora dupla: o numero do item ("Item N" == itensApi.numero) E "Valor unitario: R$ <UNIT>" == unit_homologado.
//
//   ⚠️ ACHADO DECISIVO (honesto — leia antes de usar): o QuotationReport da BNC NAO e o resultado da
//     homologacao — e uma PESQUISA DE PRECOS / cotacao para estimativa. Cada linha de item traz a MENOR
//     COTACAO de um fornecedor QUALQUER (nao o vencedor). Nos 11 procs (todos Dispensa) que tem esse doc,
//     o CNPJ do participante no QR NUNCA coincide com o cnpj_fornecedor HOMOLOGADO (0 de 57 itens): o
//     vencedor real (ex. ERALMAR, SILVIERI) levou a cesta inteira, mas as marcas do QR pertencem a OUTRAS
//     empresas que so cotaram preco. Logo, casar a marca do QR ao item homologado seria FALSO POSITIVO
//     (marca do fornecedor errado). Por isso este parser EXIGE que o CNPJ do participante no bloco QR seja
//     igual ao cnpj_fornecedor homologado (itensApi[].cnpj_fornecedor); so assim a marca e do VENCEDOR.
//
//   ⚠️ REALIDADE DO DENOMINADOR: 744 procs BNC tem item homologado (11.436 itens). O QuotationReport
//     aparece em 11 (61 itens). O doc padrao da BNC e a AUTORIZACAO DE FORNECIMENTO, cuja tabela
//     "Item Cod. Qtde. Unid. Marca Preco Unit." tem a coluna Marca VAZIA (55 procs) — cabecalho impresso,
//     sem valor. Conclusao empirica: a BNC NAO traz a marca do VENCEDOR ao PNCP por via deterministica.
//     Com a guarda de CNPJ, este parser corretamente emite ~0 marca na base atual — e o retrato fiel.
//
// Zero rede / zero LLM. Casa por NUMERO do item; EXIGE CNPJ do vencedor; confirma por unit_homologado.
// DESCARTA quando o participante do QR nao e o fornecedor homologado. Anti-falso-positivo (art.41 etc.).

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// LIXO que NUNCA e marca de fabricante
const LIXO = new Set([
  "propria", "proprio", "marca propria", "sem marca", "s marca", "nao aplicavel", "n aplicavel",
  "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas", "varias", "varios",
  "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional", "importado", "referencia",
  "conforme edital", "a definir", "objeto", "servico", "servicos", "nao", "sim", "proposta", "metodo",
]);
// tokens de UNIDADE de medida (nunca sao marca; podem colar apos a marca)
const UNITS = new Set([
  "unidade", "und", "un", "unid", "uni", "pc", "pca", "peca", "pecas", "caixa", "cx", "litro", "lt", "l",
  "kg", "g", "mg", "m", "m2", "m3", "metro", "metros", "ml", "par", "pares", "pacote", "pct", "fardo",
  "fd", "resma", "galao", "gl", "frasco", "fr", "conjunto", "cj", "cjto", "kit", "rolo", "ro", "saco",
  "sc", "balde", "bd", "lata", "tubo", "tb", "barra", "folha", "fl", "dz", "duzia", "milheiro", "comp", "cp",
  "ampola", "comprimido", "capsula", "envelope", "bloco", "bobina", "grama", "hora", "vidro", "bisnaga",
  "tonelada", "ton", "km", "cento", "jogo", "jg", "display", "blister", "pote", "pt", "und.", "cm",
]);
// prosa juridica que sinaliza FALSO POSITIVO de marca (art.41 etc.)
const PROSA_FP = /\b(nao ser[aá] admitida|indicacao de marca|marca de referencia|quando for o caso|preferencialmente|equivalente|ou similar|ou superior)\b/i;

function ehLixo(nm) {
  if (!nm || nm.length < 2 || nm.length > 40) return true;
  if (/^\d+$/.test(nm)) return true;
  if (LIXO.has(nm)) return true;
  if (UNITS.has(nm)) return true;
  if (nm.split(" ").every((w) => LIXO.has(w) || UNITS.has(w))) return true;
  return false;
}

// valor "1.234,56" / "1234,56" -> Number
function brToNum(s) {
  if (!s) return NaN;
  return Number(String(s).replace(/\./g, "").replace(",", "."));
}

// assinatura do QuotationReport (tolerante a typos de OCR)
function detectaTemplate(texto) {
  if (/Modelo\s+Marca\s+Quan\w+\s+Unidade\s+Proposta\s+M[eé]todo/i.test(texto) || /QuotationReport/i.test(texto)) return "quotation_report";
  return "outro";
}

// extrai os blocos {numero, marca, modelo, valorUnit} do QuotationReport
function extrairBlocos(texto) {
  const blocos = [];
  // Item N <desc> ...cabecalho... Metodo <ROW> Valor unitario: R$ <UNIT>
  const re = /Item\s+(\d+)\s+.*?Modelo\s+Marca\s+Quan\w+\s+Unidade\s+Proposta\s+M[eé]todo\s+([\s\S]*?)\s+Valor\s+unit[aá]rio:\s*R\$\s*([\d.]+,\d{2,3})/gi;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const numero = Number(m[1]);
    const row = m[2];
    const valorUnit = brToNum(m[3]);
    // localizar CNPJ do participante (14 digitos, com ou sem mascara) — a marca vem DEPOIS dele
    const cnpj = row.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\b\d{14}\b/);
    const cnpjPart = cnpj ? cnpj[0].replace(/\D/g, "") : null;
    let tail = cnpj ? row.slice(cnpj.index + cnpj[0].length) : row;
    // tail = "<MODELO...> <MARCA> <QTD>,<dd> <UNID> R$ <PROP> (Proposta) ..."
    // captura o que vem ANTES do primeiro "<qtd>,<dd> <unid> R$"
    const mt = tail.match(/^([\s\S]*?)\s+(\d[\d.]*,\d{2,3})\s+(\S+)\s+R\$/);
    if (!mt) continue;
    let toks = mt[1].trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    // MARCA = ultimo token; MODELO = o restante (pode ser vazio)
    const marca = toks[toks.length - 1];
    const modelo = toks.slice(0, -1).join(" ") || null;
    if (!Number.isFinite(valorUnit) || valorUnit <= 0) continue;
    blocos.push({ numero, marca, modelo, valorUnit, cnpjPart });
  }
  return blocos;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  if (detectaTemplate(texto) !== "quotation_report") return [];

  const blocos = extrairBlocos(texto);
  if (!blocos.length) return [];

  const out = [];
  const usados = new Set();
  // NOTA: no QuotationReport o "Valor unitario" e o valor da PROPOSTA na disputa, que muitas vezes DIFERE
  // do unit_homologado final (renegociacao apos arremate). Logo a ancora primaria e o NUMERO do item
  // ("Item N" == itensApi.numero), que e fiel; o valor so REFORCA a confianca (alta) quando coincide.
  const casaValor = (b, alvo) => Number.isFinite(alvo) && alvo > 0 &&
    (Math.abs(b.valorUnit - alvo) <= 0.011 || Math.abs(b.valorUnit - alvo) <= alvo * 0.01);
  for (const it of itensApi) {
    const alvo = Number(it.unit_homologado);
    const cnpjHom = String(it.cnpj_fornecedor || "").replace(/\D/g, "");
    // GUARDA CRITICA: sem o CNPJ do fornecedor homologado nao ha como provar que a marca e do VENCEDOR.
    // O QR e pesquisa de precos; suas linhas sao de OUTROS fornecedores. Sem prova -> nao emite.
    if (cnpjHom.length !== 14) continue;
    // 1) casa por NUMERO do item E exige que o participante do QR seja o FORNECEDOR HOMOLOGADO
    let idx = blocos.findIndex((b, i) => !usados.has(i) && b.numero === Number(it.numero) && b.cnpjPart === cnpjHom);
    let conf = "media";
    if (idx >= 0) {
      conf = casaValor(blocos[idx], alvo) ? "alta" : "media";
    } else {
      // 2) numero nao bateu: aceita bloco do MESMO fornecedor cujo valor casa e e UNICO
      const cand2 = blocos.map((b, i) => ({ b, i })).filter(({ b, i }) => !usados.has(i) && b.cnpjPart === cnpjHom && casaValor(b, alvo));
      if (cand2.length === 1) { idx = cand2[0].i; conf = "alta"; }
      else continue; // participante do QR != vencedor homologado, ou ambiguo -> DESCARTA
    }
    if (idx < 0) continue;
    const cand = blocos[idx];
    const nm = norm(cand.marca);
    if (ehLixo(nm)) continue;                 // "sem marca" / unidade / lixo -> pula
    if (PROSA_FP.test(cand.marca)) continue;  // prosa juridica (art.41) -> falso positivo
    usados.add(idx);
    out.push({
      numero: Number(it.numero),
      marca: cand.marca.slice(0, 60),
      modelo: cand.modelo ? cand.modelo.slice(0, 60) : null,
      valorUnit: cand.valorUnit,
      confianca: conf,
      template: "bnc",
    });
  }
  return out;
}

export { detectaTemplate, extrairBlocos };
