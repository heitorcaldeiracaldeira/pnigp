// Parser DETERMINISTICO de MARCA — celula: compras_gov
//   roteada por contratacoes_sc.plataforma='Compras.gov.br' (sistema federal Comprasnet / Compras.gov.br).
//   tipos doc 1,2,11,16,19,20.
//
// ============================ ACHADO PRINCIPAL (engenharia reversa, amostra) ============================
// O Compras.gov.br quase NUNCA traz a MARCA do vencedor de forma estruturada ao PNCP. O universo real da
// celula (~20,5k processos SC) e dominado por documentos PRE-ADJUDICACAO gerados pelo Comprasnet:
//   - Termo de Referencia (td=1) — tabela Item/Descricao/CODIGO(CATMAT)/Unidade/Qtd/Valor: SEM coluna Marca,
//     e o valor e o PRECO ESTIMADO (nao o homologado);
//   - Aviso de Contratacao Direta / Dispensa Eletronica, ETP, Nota de Empenho, decisoes: SEM marca.
// A palavra "marca" aparece em ~56% dos docs, mas quase sempre em PROSA (falsos positivos):
//   "indicacoes referentes a: marca, fabricante, modelo, procedencia" (exigencia de rotulo/NF),
//   "a marca do produto, quando for o caso" (art.41), "campo Marca/Fabricante" (regra do edital),
//   "marca e modelo de referencia: <X>" (marca de referencia na spec). NADA disso e marca do vencedor.
//
// UNICO ponto onde a marca do VENCEDOR aparece estruturada: o rotulo "Marca/Fabricante:" da "Relacao de
// Propostas" da DISPENSA ELETRONICA do Comprasnet — presente em apenas ~23 processos de ~20,5k (~0,1%).
// E campo de TEXTO LIVRE preenchido pelo fornecedor, logo de QUALIDADE BAIXA (muitas vezes traz a
// DESCRICAO do item, "propria", ou lixo em vez de uma marca de fabricante). Extraimos so o que da p/
// confiar; o resto e descartado. Este parser cobre esse nicho; a conclusao honesta e que o Comprasnet
// NAO e fonte de marca em escala (ao contrario dos sistemas municipais das outras celulas).
//
// ============================== TEMPLATE (2 sub-layouts do "Marca/Fabricante:") ==========================
//  SUB-LAYOUT B — "propostas_dispensa" (o comum). Lista de propostas por item:
//     "Propostas do Item N   Fornecedor Porte ... Valor Situacao
//        <CNPJ> - <NOME> [UF endereco: XX] Sim R$ <VALOR>,dddd  [<Situacao>]
//        Modelo/versao: <MOD>Marca/Fabricante: <MARCA> Descricao detalhada: ..."
//     O VENCEDOR e a proposta com "Proposta adjudicada" (e/ou cujo valor == unit_homologado). O valor R$
//     (4 casas) aparece ANTES de "Modelo/versao:...Marca/Fabricante:". Ancora: unit_homologado + "adjudicada".
//
//  SUB-LAYOUT A — "homolog_grid" (raro; ex. HU-UFSC). Linha de item da homologacao com a marca colada:
//     "<n> <sidec> <un> <valortotal><valorunit>ESPEC... Marca/Fabricante: <MARCA> <resto ALLCAPS da spec>"
//     Ancora: unit_homologado na linha; MARCA = texto apos "Marca/Fabricante:" ate a spec ALLCAPS voltar.
//
// Zero rede / zero LLM. Casa SEMPRE por unit_homologado (2 e 4 casas). DESCARTA quando nao casa. Filtro
// anti-falso-positivo forte (prosa juridica, marca==descricao, "propria/sem marca", nome de empresa).

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const LIXO = new Set([
  "propria", "proprio", "marca propria", "sem marca", "s marca", "nao aplicavel", "n aplicavel",
  "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas", "varias", "varios",
  "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional", "importado", "tx", "xx",
  "conforme edital", "a definir", "objeto", "servico", "servicos", "nao", "sim", "nao informada",
  "marca nao informada", "sem similar", "similar", "referencia", "propria propria", "oda", "no",
  "compativel", "ou similar", "similar ou", "equivalente", "comum", "novo", "nova", "padrao",
  "qualidade", "melhor", "primeira", "linha", "tr", "th", "ta", "tb", "aa", "bb", "cc", "s a",
]);
// tokens que denunciam DESCRICAO/PROSA (nao e marca de fabricante)
const DESC_TOKENS = new Set([
  "de", "da", "do", "com", "sem", "para", "e", "ou", "em", "por", "un", "und", "unidade", "unid",
  "kg", "ml", "litro", "caixa", "cx", "pacote", "pct", "cm", "mm", "aspecto", "fisico", "tipo",
  "largura", "altura", "cor", "material", "modelo", "versao", "tamanho", "peso", "volume", "sache",
  "refinado", "acucar", "adocante", "placa", "homenagem", "estojo",
]);
const EMPRESA_RE = /\b(ltda|eireli|epp|s\/?a|industria|comercio|comercial|distribuidora|representac|import|export|cnpj|cpf|atacado|atacadista|me\b)\b/i;

function ehLixo(marcaRaw) {
  const nm = norm(marcaRaw);
  if (!nm || nm.length < 3 || nm.length > 34) return true;
  if (/^\d/.test(nm)) return true;               // comeca com numero -> lixo
  if (LIXO.has(nm)) return true;
  const toks = nm.split(" ");
  if (toks.length > 3) return true;              // marca real e curta; >3 palavras = descricao
  if (toks.every((w) => LIXO.has(w) || DESC_TOKENS.has(w))) return true;
  // se a MAIORIA dos tokens sao de descricao/prosa -> descarta
  const descCount = toks.filter((w) => DESC_TOKENS.has(w)).length;
  if (descCount >= 1 && descCount >= toks.length - 1 && toks.length >= 2) return true;
  return false;
}

// formas do valor no PDF: 2 e 4 casas, com/sem separador de milhar
function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`, `${cp},${dec}00`, `${int},${dec}00`])];
}

function temTemplate(texto) {
  return typeof texto === "string" && /Marca\/Fabricante:/.test(texto);
}

// conectores/sufixos soltos que nunca terminam uma marca
const TRAIL = new Set(["e", "de", "da", "do", "com", "sem", "para", "ou", "the", "a", "o", "em", "por"]);

// extrai o valor da marca apos o rotulo "Marca/Fabricante:" ate o proximo delimitador estrutural
function valorMarca(texto, posDepoisDoRotulo) {
  const tail = texto.slice(posDepoisDoRotulo, posDepoisDoRotulo + 90);
  // corta no primeiro delimitador de campo do Comprasnet, "Valor negociado", CNPJ ou volta da spec
  let seg = tail.split(/Descri[cç][aã]o detalhada:|Modelo\/vers[aã]o:|Lances do|Valor negociado|\d{2}\.\d{3}\.\d{3}\//)[0];
  // corta quando a spec ALLCAPS retoma (>=2 palavras MAIUSCULAS seguidas) — sub-layout A
  const capm = seg.match(/\s[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}){1,}/);
  if (capm && capm.index > 0) seg = seg.slice(0, capm.index);
  seg = seg.replace(/[.;:\-–,\s/]+$/, "").replace(/^[.;:\-–,\s/]+/, "").trim();
  // apara conectores soltos no fim ("Profilática E" -> "Profilática")
  let toks = seg.split(/\s+/).filter(Boolean);
  while (toks.length > 1 && (TRAIL.has(norm(toks[toks.length - 1])) || toks[toks.length - 1].length === 1)) toks.pop();
  return toks.join(" ").slice(0, 40);
}

export function parse(texto, itensApi) {
  if (!temTemplate(texto) || !Array.isArray(itensApi) || !itensApi.length) return [];

  // colhe todas as ocorrencias "Marca/Fabricante: <valor>" com o contexto ANTES.
  // ANCORA PRINCIPAL = marcador "Proposta adjudicada" (vencedor). O valor R$ listado e o da PROPOSTA,
  // que na Dispensa Eletronica frequentemente NAO bate com unit_homologado (negociacao); por isso o
  // valor so refina, nao decide.
  const ocorr = [];
  const re = /Marca\/Fabricante:/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const marca = valorMarca(texto, m.index + m[0].length);
    if (!marca || ehLixo(marca) || EMPRESA_RE.test(marca)) continue;
    const win = texto.slice(Math.max(0, m.index - 260), m.index);
    // situacao da proposta: pega o rotulo mais PROXIMO do valor (fim da janela)
    const adjud = /adjudicad/i.test(win);            // proposta vencedora
    const desclass = /desclassificad/i.test(win);    // proposta perdedora -> NUNCA emitir
    const vals = [...win.matchAll(/(\d[\d.]*,\d{2,4})/g)].map((x) => x[1]);
    ocorr.push({ marca, vals, adjud, desclass, pos: m.index });
  }
  if (!ocorr.length) return [];

  const out = [];
  const usados = new Set();

  for (const it of itensApi) {
    const formas = new Set(formasValor(it.unit_homologado));
    // 1) ANCORA FORTE: proposta ADJUDICADA (vencedora) cujo valor bate com o homologado -> alta
    let pick = ocorr.find((o) => !usados.has(o.pos) && o.adjud && !o.desclass && o.vals.some((v) => formas.has(v)));
    let conf = "alta";
    // 2) media: proposta NAO desclassificada cujo valor bate com o homologado. So aceita se essa for a
    //    UNICA ocorrencia (nao desclassificada) que casa o valor -> evita colar marca de perdedor.
    if (!pick) {
      const cands = ocorr.filter((o) => !usados.has(o.pos) && !o.desclass && o.vals.some((v) => formas.has(v)));
      if (cands.length === 1) { pick = cands[0]; conf = "media"; }
    }
    if (!pick) continue;   // sem ancora confiavel -> DESCARTA (Comprasnet raramente casa marca->item)
    usados.add(pick.pos);
    out.push({
      numero: it.numero,
      marca: pick.marca.slice(0, 40),
      modelo: null,
      valorUnit: Number(it.unit_homologado),
      confianca: conf,
      template: "compras_gov",
    });
  }
  return out;
}

export { temTemplate, valorMarca };
