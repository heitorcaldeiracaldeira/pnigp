// Parser DETERMINISTICO de MARCA — CELULA plataforma='Betha Sistemas' (a MAIOR: 78.567 processos).
// Roteada por contratacoes_sc.plataforma (NAO pelo gerador — 96% dos docs sao gerador='outro').
//
// ============================ ENGENHARIA REVERSA (amostra estratificada de 121 docs) ============================
// A plataforma Betha publica varios documentos gerados. Onde a MARCA do produto vive, de fato:
//
//   TEMPLATE A — "ata_resultado" (UNICA fonte confiavel de marca por item + preco). Documento nativo Betha
//     "ATA .. / VALORES UNITARIOS FINAIS" da fase de disputa. Layout (texto achatado do PDF):
//        VALORES UNITÁRIOS FINAIS Item: N Unidade: U Descrição: D Quantidade: Q Valor Unit.: V Valor Total: T
//        Marca: <MARCA> Modelo: <MODELO> [proximo Item:/LOTE/data]
//     A marca e o VENCEDOR do lote (nao ha proposta de marca por concorrente). ~455 processos / ~2.953 itens
//     homologados. Ancora forte: "Item: N" da o numero + "Valor Unit.: V" confirma contra unit_homologado.
//     Confianca 'alta'. Muitos vem "Marca: PROPRIA" (moveis sob medida) ou "Engenharia"/"Serviço" (obra) ->
//     esses NAO sao marca de fabricante -> descartados pelo filtro SEM_MARCA (fiel, mas nao inventa marca).
//
//   TEMPLATE B — "leilao_veiculo" (bem confiavel, nicho ~31 proc). Leilao de bens moveis (frota). Cada LOTE
//     traz "MARCA: <X> MODELO: <Y>" no bloco de descricao detalhada. Marca = fabricante do veiculo
//     (CHEVROLET, FIAT, CATERPILLAR...). Ancora: numero do LOTE == numero do item da API. Confianca 'media'.
//
//   NAO carregam marca do produto (denominador REAL, nao falha do parser):
//     · AF/Empenho "Especificação do material Marca ..." (~17.834 proc, o DOMINANTE): a coluna Marca existe no
//       cabecalho mas o VALOR e SEMPRE VAZIO (o comprador nunca preenche). Verificado em toda a amostra.
//     · DFD / Ato de dispensa / Relacao de itens / Orcamento de fornecedor / Termo: sem coluna de marca.
//     · Prosa juridica "marca, modelo, tipo e fabricante vinculam" / "sem indicacao de marca/modelo" -> FP.
//   => A plataforma Betha, no geral, NAO leva a marca do produto ao PNCP. So a ata de resultado nativa leva.
//
// Zero rede / zero LLM. Casa por numero do item + confere o valor unitario (unit_homologado). DESCARTA quando
// nao casa. Filtro anti-falso-positivo (marca propria / servico / obra / ausencia / prosa).
// ===============================================================================================================

// "nao e marca de fabricante": marca propria, servico, obra, sem marca, generico, n/a, so pontuacao.
const SEM_MARCA = /^\s*(marca\s+)?(pr[oó]pri[ao]|servi[çc]os?|obras?|engenharia|m[aã]o\s+de\s+obra|s\/?\s*marca|sem\s+marca|n\/?[ac]|n[aã]o\s+se\s+aplica|n[aã]o\s+informad[ao]|a\s+definir|diversos?|v[aá]rios?|generic[ao]|nacional|importad[ao]|-{1,3}|\.+)\s*$/i;

// prosa juridica que NUNCA e marca (aparece quando a captura pega texto corrido de edital)
const PROSA_RE = /\b(quando|caso|conforme|dever[aá]|licitante|proponente|edital|especifica|art\.|artigo|refer[eê]ncia|vincul|procedencia|proced[eê]ncia|admitir|vedad)\b/i;

const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;

// RODAPE de pagina do Betha ("2 de 3Gerado em: 12/09/2025 MUNICIPIO DE X X-SC") vaza p/ dentro de Marca:/Modelo:.
// So limpa o CAMPO ja capturado (a data do rodape e fronteira do lookahead — nao pode sair do texto-fonte).
function limpaCampo(s) {
  return String(s || "")
    .replace(/\d+\s+de\s+\d+.*$/is, "").replace(/Gerado em:.*$/is, "").replace(/P[áa]gina\s+\d+.*$/is, "")
    .replace(/\bFUNDO MUNICIPAL\b.*$/is, "").replace(/\bMUNIC[IÍ]PIO DE\b.*$/is, "").replace(/\bMUNICIPIO DE\b.*$/is, "")
    .replace(/\bPREFEITURA\b.*$/is, "").replace(/\bESTADO DE\b.*$/is, "")
    .replace(/\bRaz[ãa]o Social\b.*$/is, "").replace(/\bMENSAGEM\b.*$/is, "")
    .replace(/[\s.,;:\-–]+$/,"").replace(/^[\s.,;:\-–]+/,"").trim();
}

function marcaLimpa(raw) {
  const m = limpaCampo(raw);
  if (!m || m.length < 2 || m.length > 50) return null;
  if (SEM_MARCA.test(m)) return null;
  if (PROSA_RE.test(m)) return null;
  if (/^\d+$/.test(m)) return null;                     // so numero
  if (m.split(/\s+/).length > 5) return null;           // marca nao tem 6+ palavras -> capturou prosa
  return m.slice(0, 50);
}

// formas do valor unitario como aparecem no PDF (2 e 4 casas, com/sem separador de milhar)
function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`, `${cp},${dec}00`, `${int},${dec}00`])];
}

// ————————————————— TEMPLATE A: ata_resultado (VALORES UNITARIOS FINAIS) —————————————————
// bloco: "Item: N Unidade: U Descrição: D Quantidade: Q Valor Unit.: V Valor Total: T Marca: M Modelo: X"
const ITEM_RE = /Item:\s*(\d+)\s+Unidade:\s*(?:.{1,40}?)\s+Descri[çc][ãa]o:\s*[\s\S]{1,2000}?\s+Quantidade:\s*[\d.]+(?:,\d+)?\s+Valor\s*Unit\.?:\s*([\d.]+,\d{2})\s+Valor\s*Total:\s*[\d.]+,\d{2}\s+Marca:\s*([^]{0,60}?)\s*Modelo:/g;

function parseAta(texto, itensApi) {
  const blocos = new Map();   // numero -> {valStr, marca}
  let m;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(texto)) !== null) {
    const numero = parseInt(m[1], 10);
    if (!blocos.has(numero)) blocos.set(numero, { valStr: m[2], marca: m[3] });
  }
  if (!blocos.size) return [];
  const out = [];
  for (const it of itensApi) {
    const b = blocos.get(it.numero);
    if (!b) continue;                                    // sem bloco p/ esse numero -> descarta
    const formas = formasValor(it.unit_homologado);
    if (formas.length && !formas.includes(b.valStr)) continue;   // valor da ata != unit_homologado -> descarta
    const marca = marcaLimpa(b.marca);
    if (!marca) continue;                                // PROPRIA/servico/obra/prosa -> sem marca (fiel)
    out.push({ numero: it.numero, marca, modelo: null, valorUnit: Number(it.unit_homologado), confianca: "alta", template: "betha_ata_resultado" });
  }
  return out;
}

// ————————————————— TEMPLATE B: leilao_veiculo (MARCA: X MODELO: Y por LOTE) —————————————————
// Detecta leilao/alienacao de bens; cada lote traz "MARCA: <fabricante> MODELO: <modelo>". numero(lote)==item.
const LEILAO_SIG = /(LEIL[ÃA]O|aliena..o de bens|bens m[oó]veis|VALOR M[IÍ]NIMO PARA VENDA|DESCRI..O DETALHADA)/i;
const LOTE_MARCA_RE = /(?:^|\D)(\d{1,3})\s+[^]{0,120}?MARCA:\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .&\/-]{1,28}?)\s*MODELO:/gi;

function parseLeilao(texto, itensApi) {
  if (!LEILAO_SIG.test(texto)) return [];
  const porLote = new Map();
  let m;
  LOTE_MARCA_RE.lastIndex = 0;
  while ((m = LOTE_MARCA_RE.exec(texto)) !== null) {
    const lote = parseInt(m[1], 10);
    if (!porLote.has(lote)) porLote.set(lote, m[2]);
  }
  if (!porLote.size) return [];
  const out = [];
  for (const it of itensApi) {
    const raw = porLote.get(it.numero);
    if (raw === undefined) continue;
    const marca = marcaLimpa(raw);
    if (!marca) continue;
    out.push({ numero: it.numero, marca, modelo: null, valorUnit: Number(it.unit_homologado), confianca: "media", template: "betha_leilao_veiculo" });
  }
  return out;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  // TEMPLATE A e a fonte principal e mais confiavel
  const a = parseAta(texto, itensApi);
  if (a.length) return a;
  // TEMPLATE B (leilao) so quando nao houve ata de resultado
  return parseLeilao(texto, itensApi);
}

export { parseAta, parseLeilao, marcaLimpa };
