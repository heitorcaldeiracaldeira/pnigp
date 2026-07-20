// Parser DETERMINISTICO de MARCA — celula: outro_pregaoE
//   gerador='outro' · modalidade Pregao Eletronico (modalidade_id=6) · tipos doc 16,11,19
//
// A marca do produto do VENCEDOR vive na TABELA DE ITENS do documento gerado. Os docs "outro" desta
// celula tem VARIOS sub-templates (sistemas municipais diferentes). Engenharia reversa (amostra de 60):
//
//   TEMPLATE A — "betha_vencedores" (PRINCIPAL, alta precisao) — sistema Betha "VENCEDORES DA FASE DE
//     DISPUTA" / "Relacao de Vencedores". Usado por Gaspar, Barra do Sul, Ponte Alta... Layout (rotulos
//     APOS o valor, texto de PDF 2-colunas achatado):
//        ... <valor unit> Valor total: Item: 1 Unidade: <UNIDADE> <MARCA>Marca: <MODELO>Modelo: <descricao>
//     Assinatura: co-ocorrencia de "Marca:" (com valor ANTES) + "Modelo:" + ("Item:"/"Itens do lote"/
//     "VENCEDORES DA"/"Fase de Disputa"). A MARCA e o texto entre a UNIDADE e o rotulo "Marca:".
//     Ancora: o valor homologado (unit_homologado) aparece imediatamente ANTES do bloco "Item: N Unidade:".
//     -> casa por valor+proximidade; marca = segmento menos o(s) token(s) de unidade. Confianca 'alta'.
//
//   TEMPLATE B — "cvc_ata" (CONSERVADOR, media) — Consorcio Interm. Velho Coronel (CVC), Ata de Registro
//     de Precos Nova Lei. Cabecalho "Item Qtde Unid. Descricao Marca/ Modelo Valor Unit. (R$)". A celula
//     Marca/Modelo e livre (as vezes so a marca "IMPLEFORTE", as vezes "marca/ modelo", as vezes o nome do
//     FABRICANTE "CREMASCO/ CAPRI INDUSTRIA...") e a spec cola nela sem delimitador -> RUIDO alto. So
//     aceitamos quando ha UM token-marca limpo (maiusc., sem sufixo de empresa, sem stopword) colado no
//     valor \d+,\d{4}. O resto e residuo SEMANTICO (precisa_haiku). Confianca 'media'; dedup por numero.
//
//   Templates "relacao_vencedores" (coluna Marca vazia / traz o fornecedor) e demais atas de realizacao/
//   bid-log NAO carregam marca do produto -> ignorados (residuo). ~2/3 dos docs da celula sao bid-logs
//   sem coluna de marca: isso e a REALIDADE do denominador, nao falha do parser.
//
// Zero rede / zero LLM. Casa SEMPRE por unit_homologado; DESCARTA quando nao casa (nunca pendura marca no
// item errado). Aplica filtro anti-falso-positivo (prosa juridica, "marca propria/sem marca").

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// LIXO que NUNCA e marca de fabricante (ausencia de marca / rotulos / genericos)
const LIXO = new Set([
  "propria", "proprio", "marca propria", "sem marca", "s marca", "nao aplicavel", "n aplicavel",
  "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas", "varias", "varios",
  "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional", "importado",
  "conforme edital", "a definir", "objeto", "servico", "servicos", "nao", "sim", "propria propria",
]);
// tokens de UNIDADE de medida que precedem a marca no template A (para remover)
const UNITS = new Set([
  "unidade", "und", "un", "unid", "uni", "pc", "pca", "peca", "pecas", "caixa", "cx", "litro", "lt", "l",
  "kg", "g", "mg", "m", "m2", "m3", "metro", "metros", "ml", "par", "pares", "pacote", "pct", "fardo",
  "fd", "resma", "galao", "gl", "frasco", "fr", "conjunto", "cj", "cjto", "kit", "rolo", "ro", "saco",
  "sc", "balde", "bd", "lata", "lt", "tubo", "tb", "barra", "folha", "fl", "dz", "duzia", "milheiro",
  "ampola", "comprimido", "capsula", "envelope", "bloco", "bobina", "grama", "hora", "vidro", "bisnaga",
  "tonelada", "ton", "km", "cento", "servico", "jogo", "jg", "display", "blister", "pote", "pt",
]);
// sufixos/tokens de nome de EMPRESA (nao e marca de produto)
const EMPRESA_RE = /\b(ltda|eireli|epp|me|s\/?a|industria|comercio|comercial|distribuidora|representac|import|export|cnpj|cpf)\b/i;
// stopwords de PROSA (fim de spec) que nao podem virar marca no template B
const PROSA = new Set(["ano", "anos", "meses", "mes", "fim", "garantia", "de", "da", "do", "com", "sem", "para", "e", "ou", "the", "um", "uma"]);

function ehLixo(nm) {
  if (!nm || nm.length < 2 || nm.length > 40) return true;
  if (/^\d+$/.test(nm)) return true;
  if (LIXO.has(nm)) return true;
  if (nm.split(" ").every((w) => LIXO.has(w) || PROSA.has(w))) return true;
  return false;
}

// formas do valor no PDF: 2 e 4 casas decimais, com e sem separador de milhar
function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([
    `${cp},${dec}`, `${int},${dec}`,       // 1.234,56 / 1234,56
    `${cp},${dec}00`, `${int},${dec}00`,   // 1.234,5600 / 1234,5600 (Betha/CVC 4 casas)
  ])];
}

function detectaTemplate(texto) {
  const t = texto;
  if (/Marca:\s*\S/.test(t) && /Modelo:/.test(t) && /(Itens do lote|Valor total:|Fase de Disputa|VENCEDORES DA|Vencedores)/i.test(t)) return "betha_vencedores";
  if (/Marca\/\s*Modelo/i.test(t)) return "cvc_ata";
  return "outro";
}

// ————— TEMPLATE A: betha_vencedores —————
// Bloco = "Item: N Unidade: <seg>Marca:" ; marca = <seg> menos unidade(s). Ancora: valor unit ANTES do bloco.
function parseBetha(texto, itensApi) {
  const blocks = [];
  const re = /Item:\s*\d+\s*Unidade:\s*([^\n]{1,70}?)Marca:/g;
  let m;
  while ((m = re.exec(texto)) !== null) blocks.push({ pos: m.index, seg: m[1] });
  if (!blocks.length) return [];

  const out = [];
  const usados = new Set();
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    // acha a ocorrencia do valor cujo bloco "Marca:" venha logo em seguida (<=260 chars)
    let anchorBlock = null, anchorGap = 1e9;
    for (const f of formas) {
      let from = 0, pos;
      while ((pos = texto.indexOf(f, from)) >= 0) {
        from = pos + f.length;
        // bloco mais proximo apos esta ocorrencia do valor
        for (const b of blocks) {
          const gap = b.pos - pos;
          if (gap >= 0 && gap <= 260 && gap < anchorGap) { anchorGap = gap; anchorBlock = b; }
        }
      }
    }
    if (!anchorBlock) continue;                       // nao casou -> descarta (nunca chuta)
    if (usados.has(anchorBlock.pos)) continue;        // 1 bloco por item
    // marca = segmento menos token(s) de unidade no inicio
    let toks = anchorBlock.seg.trim().split(/\s+/);
    while (toks.length > 1 && UNITS.has(norm(toks[0]))) toks.shift();
    let marca = toks.join(" ").replace(/[.,;:\-–\s]+$/, "").replace(/^[.,;:\-–\s]+/, "").trim();
    if (ehLixo(norm(marca))) continue;                // "PROPRIA" / prosa -> pula (marca ausente)
    usados.add(anchorBlock.pos);
    out.push({ numero: it.numero, marca: marca.slice(0, 60), modelo: null, valorUnit: Number(it.unit_homologado), confianca: "alta", template: "betha_vencedores" });
  }
  return out;
}

// ————— TEMPLATE B: cvc_ata (conservador) —————
// Marca/Modelo e celula livre e a spec cola nela. So aceita UM token-marca limpo colado no valor \d+,\d{4}.
function parseCvc(texto, itensApi) {
  // pares (marca-candidata, valor) — pega ate 3 ultimos tokens alfabeticos antes do valor 4-casas
  const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ&\/-]{1,24}(?:\s+[A-Za-zÀ-ÿ&\/-]{1,24}){0,2})\s*(\d[\d.]*,\d{4})\b/g;
  const porValor = new Map();  // valorStr -> Map(marcaNorm -> {marca, n})
  let m;
  while ((m = re.exec(texto)) !== null) {
    const raw = m[1].trim();
    const valStr = m[2];
    // marca limpa = ULTIMO token (a celula Marca/Modelo termina colada no valor); rejeita empresa/prosa
    const toks = raw.split(/\s+/).filter(Boolean);
    let cand = toks[toks.length - 1] || "";
    cand = cand.replace(/^[\/&-]+|[\/&-]+$/g, "").trim();
    const nc = norm(cand);
    if (ehLixo(nc)) continue;
    if (EMPRESA_RE.test(cand)) continue;
    if (PROSA.has(nc)) continue;
    if (nc.length < 3) continue;                       // token curto e ruido
    // exige marca "limpa": so letras (com acento) e talvez 1 hifen/barra; sem digitos
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\-\/]{2,}$/.test(cand)) continue;
    if (!porValor.has(valStr)) porValor.set(valStr, new Map());
    const mm = porValor.get(valStr);
    mm.set(nc, { marca: cand, n: (mm.get(nc)?.n || 0) + 1 });
  }
  const out = [];
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    let best = null;
    for (const f of formas) {
      const mm = porValor.get(f);
      if (!mm) continue;
      for (const v of mm.values()) if (!best || v.n > best.n) best = v;
    }
    if (!best) continue;                               // nao casou -> descarta
    out.push({ numero: it.numero, marca: best.marca.slice(0, 60), modelo: null, valorUnit: Number(it.unit_homologado), confianca: "media", template: "cvc_ata" });
  }
  return out;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const tpl = detectaTemplate(texto);
  if (tpl === "betha_vencedores") return parseBetha(texto, itensApi);
  if (tpl === "cvc_ata") return parseCvc(texto, itensApi);
  return [];   // demais templates: coluna de marca ausente / residuo semantico
}

export { detectaTemplate };
