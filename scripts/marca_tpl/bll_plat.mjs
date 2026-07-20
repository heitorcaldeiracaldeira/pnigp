// Parser DETERMINISTICO de MARCA — celula: plataforma='BLL Compras' (~3.753 processos)
//
// Engenharia reversa do TEMPLATE GERADO pela plataforma BLL (portal bll.org.br / "BLL Compras").
// A marca do produto do VENCEDOR vive na TABELA "VENCEDORES DO PROCESSO" (documento de resultado /
// homologacao gerado pelo portal). Layout de PDF 2-colunas achatado em uma linha por item:
//
//   TEMPLATE A — "bll_vencedores" (PRINCIPAL, alta precisao). Bloco por item:
//     Item: <N> Descricao: <desc> [Inf. detal.: ...] Quantidade: <q> Val. Ref.: <ref> Unidade: <UN>
//       Total Item: <tot> Marca: <MARCA> Modelo: <MODELO> Valor Unit.: <VALOR> Quant.: 1 Total: <t>LOTE <L>...
//     -> numero  = grupo "Item: N"  (== itens_sc.numero)
//     -> marca   = texto entre "Marca:" e "Modelo:"
//     -> modelo  = texto entre "Modelo:" e "Valor Unit.:" (as vezes e a spec inteira -> guardamos curto)
//     -> valor   = "Valor Unit.:" (== unit_homologado; 2 a 4 casas decimais: 220,90 / 2.940,00 / 13.515,625)
//     DUPLO ANCORA: casa por NUMERO (Item:N) E confirma pelo VALOR (Valor Unit ~ unit_homologado).
//     Confianca 'alta' quando os dois anconoram; 'media' quando so o valor casa (numero divergente).
//
//   TEMPLATE B — "betha_achatado" (residual). Docs gerador='betha' dentro da plataforma trazem
//     "... Valor Unit.: V ... Marca: M Modelo: MD" (rotulo APOS o valor). Na pratica esta celula quase
//     sempre traz "Marca: propria/proprio" (FP) -> rende pouco. Tratado de forma conservadora e opcional.
//
// REALIDADE do denominador (censo do corpus BLL, tipos 1,2,11,16,19,20):
//   - Marcas REAIS vivem quase so no template A, concentrado no municipio de Criciuma (grande usuario do
//     portal): ~11.180 ocorrencias de "Marca: <marca real>" (CRISTOFOLI, SAEVO, KAVO, GNATUS, DABIATLANTE,
//     ELGIN, AGRATTO, VONDER, SCHULZ, HONDA, OLSEN, MANORT...). Fora de Criciuma o portal arquiva no PNCP
//     editais/atas/contratos que NAO trazem coluna de marca do vencedor -> residuo (nao e falha do parser).
//
// Zero rede / zero LLM. Casa SEMPRE por numero+valor; DESCARTA quando nao casa. Anti-falso-positivo.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// LIXO / ausencia de marca (nunca e marca de fabricante)
const LIXO = new Set([
  "propria", "proprio", "marca propria", "sem marca", "s marca", "nao aplicavel", "n aplicavel",
  "nao se aplica", "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas",
  "varias", "varios", "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional",
  "importado", "conforme edital", "a definir", "objeto", "servico", "servicos", "serv", "sv",
  "obra", "obras", "nao", "sim", "razao social", "referencia", "tecnica e preco", "in natura",
  "prop", "propria propria", "proprio proprio", "s m", "não", "de referencia",
]);
const PROSA = new Set(["ano", "anos", "meses", "mes", "fim", "garantia", "de", "da", "do", "com", "sem", "para", "e", "ou", "the", "um", "uma", "kit", "cor", "und", "un"]);

function ehLixo(nm) {
  if (!nm || nm.length < 2 || nm.length > 40) return true;
  if (/^\d+$/.test(nm)) return true;
  if (LIXO.has(nm)) return true;
  if (nm.split(" ").every((w) => LIXO.has(w) || PROSA.has(w))) return true;
  return false;
}

// "13.515,625" / "2.940,00" / "220,90" -> Number. Ponto = milhar, virgula = decimal.
function valorTxtToNum(s) {
  if (!s) return NaN;
  const t = String(s).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
// casa valor do texto com unit_homologado (decimais variaveis no PDF; tolerancia relativa+absoluta)
function valorCasou(vTxt, unit) {
  const a = valorTxtToNum(vTxt), b = Number(unit);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return false;
  const dif = Math.abs(a - b);
  return dif <= 0.02 || dif / b <= 0.005;
}

function limpaMarca(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/(?:\s[-–]\s?)+/g, " ")   // colapsa ruido de separador " - - " (PDF 2-col)
    .replace(/\s+/g, " ")
    .replace(/[.,;:\-–\/\s]+$/, "")
    .replace(/^[.,;:\-–\/\s]+/, "")
    .trim()
    .slice(0, 60);
}

function detectaTemplate(texto) {
  const t = texto;
  const temColuna = /Item:\s*\d+/.test(t) && /Marca:\s*\S/.test(t) && /Valor\s*Unit/.test(t);
  if (!temColuna) return "outro";
  // template A: marca ANTES do "Valor Unit" (Marca:..Modelo:..Valor Unit.:)
  if (/Marca:\s*[^\n]{0,60}?Modelo:\s*[^\n]{0,80}?Valor\s*Unit/.test(t)) return "bll_vencedores";
  // template B: valor ANTES do rotulo Marca:
  if (/Valor\s*Unit[^\n]{0,40}Marca:/.test(t)) return "betha_achatado";
  return "bll_vencedores";
}

// TEMPLATE A: blocos "Item: N ... Marca: M Modelo: MD Valor Unit.: V"
function parseVencedores(texto, itensApi) {
  // fatiar por "Item: N Descricao:" (delimitador REAL do bloco do vencedor).
  // ATENCAO: NAO usar /Item:\s*\d+/ solto -> casaria "Total Item: 99.960,00" (o "Item:" do total)
  // e embaralharia os numeros. O bloco do vencedor e SEMPRE "Item: <N> Descri(cao):".
  const marks = [];
  const reItem = /Item:\s*(\d+)\s+Descri[cç]/g;
  let m;
  while ((m = reItem.exec(texto)) !== null) marks.push({ pos: m.index, end: reItem.lastIndex, numero: Number(m[1]) });
  if (!marks.length) return [];

  // por numero -> lista de {marca,modelo,valTxt} (um item pode reaparecer; guardamos todos)
  const porNumero = new Map();
  const reMMV = /Marca:\s*([^\n]{1,60}?)\s*Modelo:\s*([^\n]{0,90}?)\s*Valor\s*Unit\.?:\s*([\d.]*,\d+)/;
  for (let i = 0; i < marks.length; i++) {
    const ini = marks[i].end;
    const fim = i + 1 < marks.length ? marks[i + 1].pos : Math.min(texto.length, ini + 600);
    const bloco = texto.slice(ini, fim);
    const mm = reMMV.exec(bloco);
    if (!mm) continue;
    const rec = { numero: marks[i].numero, marca: limpaMarca(mm[1]), modelo: limpaMarca(mm[2]) || null, valTxt: mm[3] };
    if (!porNumero.has(rec.numero)) porNumero.set(rec.numero, []);
    porNumero.get(rec.numero).push(rec);
  }
  if (!porNumero.size) return [];

  // achatar todos os blocos numa lista
  const todos = [];
  for (const arr of porNumero.values()) for (const r of arr) todos.push(r);

  const out = [];
  const usados = new Set(); // evita reusar o mesmo bloco (por numero+valTxt+marca)
  for (const it of itensApi) {
    const unit = Number(it.unit_homologado);
    // ANCORA OBRIGATORIA = valor (unit_homologado). O numero do doc NAO e confiavel isolado:
    // ha processos onde a numeracao "Item: N" do documento diverge de itens_sc.numero (docs multi-
    // proponente listam varios lances por numero). So o VALOR identifica a linha vencedora.
    const vhits = todos.filter((r) => valorCasou(r.valTxt, unit));
    if (!vhits.length) continue;                       // valor nao casa -> DESCARTA (nunca chuta)

    let rec = null, conf = null;
    const byNum = vhits.filter((r) => r.numero === Number(it.numero));
    if (byNum.length >= 1) { rec = byNum[0]; conf = "alta"; }   // valor E numero confirmam
    else if (vhits.length === 1) { rec = vhits[0]; conf = "media"; } // valor unico (numero diverge)
    else continue;                                     // varios blocos no mesmo valor, numero nao ajuda -> ambiguo, descarta

    const key = rec.numero + "|" + rec.valTxt + "|" + rec.marca;
    if (usados.has(key)) continue;
    const nm = norm(rec.marca);
    if (ehLixo(nm)) continue; // marca ausente (propria/servico/...) -> nao pendura
    usados.add(key);
    out.push({
      numero: Number(it.numero),
      marca: rec.marca,
      modelo: rec.modelo && !ehLixo(norm(rec.modelo)) ? rec.modelo : null,
      valorUnit: unit,
      confianca: conf,
      template: "bll",
    });
  }
  return out;
}

// TEMPLATE B: betha achatado — valor ANTES de "Marca:". Conservador (quase so FP nesta celula).
function parseBethaAchatado(texto, itensApi) {
  // "... Valor Unit.: V ... Marca: M Modelo: MD"  (rotulos apos o valor)
  const re = /Valor\s*Unit\.?:\s*([\d.]*,\d+)[^\n]{0,60}?Marca:\s*([^\n]{1,60}?)\s*Modelo:/g;
  const porValor = new Map();
  let m;
  while ((m = re.exec(texto)) !== null) {
    const rec = { valTxt: m[1], marca: limpaMarca(m[2]) };
    if (!porValor.has(m[1])) porValor.set(m[1], rec);
  }
  if (!porValor.size) return [];
  const out = [];
  for (const it of itensApi) {
    const unit = Number(it.unit_homologado);
    let rec = null;
    for (const r of porValor.values()) if (valorCasou(r.valTxt, unit)) { rec = r; break; }
    if (!rec) continue;
    const nm = norm(rec.marca);
    if (ehLixo(nm)) continue;
    out.push({ numero: Number(it.numero), marca: rec.marca, modelo: null, valorUnit: unit, confianca: "media", template: "bll" });
  }
  return out;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const tpl = detectaTemplate(texto);
  if (tpl === "bll_vencedores") {
    const r = parseVencedores(texto, itensApi);
    if (r.length) return r;
    return parseBethaAchatado(texto, itensApi); // ultimo recurso
  }
  if (tpl === "betha_achatado") return parseBethaAchatado(texto, itensApi);
  return [];
}

export { detectaTemplate, valorTxtToNum, valorCasou };
