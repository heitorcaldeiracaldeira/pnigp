// Parser deterministico de MARCA — celula: estado_sc
// plataforma (gerador): 'Secretaria de Estado da Administração de Santa Catarina' (SEA-SC)
// universo: ~15.485 processos, ~74.373 itens homologados
//
// ============================ ACHADO (engenharia reversa de ~120 docs) ============================
// O Governo do Estado de SC (portal SGPE/SEA) publica ao PNCP, quase que exclusivamente, documentos
// de PLANEJAMENTO e de FORMALIZACAO — NAO um "resultado por item com a marca do vencedor".
// Nos ~15.479 processos com texto, a palavra "marca" aparece em 4 papeis, e SO UM traz marca de
// vencedor (e ainda assim de forma fragil):
//
//   1) BOILERPLATE art.41 (1.139 proc / 1.564 docs) — "se houver indicacao de uma ou mais marcas ou
//      modelos, justificativa..." / "vedacao a contratacao de marca". FALSO POSITIVO (vedacao legal).
//   2) MARCA DE REFERENCIA no ETP/TR (25 proc) — "Marca/modelo de referencia: Corfio ou Sil",
//      "...: Torelli TA 138. IGUAL, SIMILAR OU SUPERIOR", "...referencia: Arauterm/CAD-HP-500 ...
//      ou equivalente". E a marca-PADRAO citada pela ADMINISTRACAO, nao a do vencedor. FALSO POSITIVO.
//   3) COLUNA "Marca/modelo" EM BRANCO no CONTRATO (303 proc / 371 docs) — o template do contrato da
//      UDESC etc. traz o cabecalho "Item | Caracteristicas Minimas | Marca/modelo | Quantidade |
//      Valor Unitario | Valor Total" mas a celula da marca vem VAZIA (preenchida so no PDF assinado
//      fora do PNCP, ou nunca). Nada a extrair.
//   4) MARCA DE EQUIPAMENTO EXISTENTE em contratos de SERVICO (manutencao/calibracao/seguro/leilao):
//      "Marca/Modelo: Shimadzu TQ 8040" (equipamento em manutencao), "marca/modelo CHEV/CRUZE"
//      (veiculo segurado), tabela de LEILAO "MARCA/MODELO ... RENAVAM ... CHASSI". Descreve o OBJETO
//      do servico, nao a marca comprada. FALSO POSITIVO.
//
//   5) UNICO layout com marca de VENCEDOR (21 proc / 32 docs — ~0,14% do universo): pagina de
//      DIARIO OFICIAL / "Extrato de Ata de Registro de Precos" que lista, em corrido:
//        "Lote L - Item N: <descricao> marca/modelo: <MARCA> Quantidade: <q> preco Unitario: r$ <V>"
//      Essa pagina, porem, costuma AGREGAR atas de VARIOS processos (bundle do DOM), e no PNCP fica
//      ANEXADA a UM processo so — cujos itens da API sao OUTROS (ex.: doc lista canetas "bic" a
//      r$0,78, mas o processo ao qual esta anexado e uma REFORMA de r$167.999). Por isso o parser
//      ancora pelo PRECO (unit_homologado) e SO emite se o preco casar com um item homologado do
//      MESMO processo — descartando os bundles mal-atribuidos (a esmagadora maioria).
//
// CONCLUSAO: o Estado NAO traz a marca do vencedor ao PNCP de forma estruturada e por-item. O parser
// abaixo captura o unico layout que existe (DOM/Extrato de Ata), com ancoragem por preco, mas o
// rendimento real e proximo de ZERO — nao por falha do parser, e sim porque o dado nao existe na
// fonte. (Documentado honestamente para o relatorio; nada de marca inventada.)
//
// Zero rede / zero LLM.

// ---- ancoras de valor -------------------------------------------------------
function parseBRL(s) {
  if (s == null) return null;
  let x = String(s).replace(/[^\d.,]/g, '').trim();
  if (!x) return null;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if ((x.match(/\./g) || []).length > 1) x = x.replace(/\./g, ''); // "1.234.567" milhar sem decimal
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : null;
}
function apiUnit(v) {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function moneyEq(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 0.015 || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.005);
}

// ---- filtro anti-falso-positivo --------------------------------------------
const PLACEHOLDER = new Set([
  'na','n/a','nao ha','nao ha marca','sem marca','s/marca','sem','nda','a definir','a especificar',
  'diversos','diversas','propria','proprio','generico','conforme edital','conforme proposta',
  'nao informado','nao informada','nao aplicavel','nenhum','nenhuma','-','--','.','..','x','xx',
  'igual','similar','superior','equivalente','ou equivalente','padrao','referencia',
]);
const WORKS_RADICAL = /(obra|engenh|projeto|servic|pavimenta|constru|reform|instalac|montagem|execuc|mao de obra|drenagem)/;

function normLower(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s/&.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function trimMarca(raw) {
  let m = String(raw).replace(/�/g, ' '); // "�" = separador mangado no DOM
  m = m.split(/\b(?:chassi|serie|s[ée]rie|ano\s*fab|placa|renavam|patrim|n[ºo]?\s*serie)\b/i)[0];
  // corta no proximo rotulo do layout DOM
  m = m.split(/\b(?:quantidade|qtde|pre[çc]o|valor|un\b|unidade)\b/i)[0];
  m = m.replace(/[\s:;\-/.]+$/, '').replace(/^[\s:;\-/.]+/, '').trim();
  return m;
}
function isRealBrand(raw) {
  if (!raw) return false;
  const m = trimMarca(raw);
  if (!m) return false;
  const n = normLower(m);
  if (!n || n.length < 2) return false;
  if (PLACEHOLDER.has(n)) return false;
  if (WORKS_RADICAL.test(n)) return false;
  if (/^[\d.,%/\s-]+$/.test(n)) return false;
  if (n.replace(/[^a-z]/g, '').length < 2) return false;
  if (m.length > 40) return false;
  // reference-brand / prosa juridica
  if (/(refer[êe]ncia|ou equivalente|igual\b|similar|quando for o caso|quando cabivel|proced[êe]ncia|apresenta[çc][ãa]o|nome comercial|certificado)/.test(n)) return false;
  if (/(marca|especificac|indicac|qualidade)/.test(n) && n.split(' ').length > 3) return false;
  return true;
}

// ---------------------------------------------------------------------------
// LAYOUT DOM / Extrato de Ata: "Lote L - Item N: <desc> marca/modelo: <MARCA>
//   Quantidade: <q> preco Unitario: r$ <V>"  (tolerante ao lixo de encoding �)
// ---------------------------------------------------------------------------
function parseDom(texto) {
  const out = [];
  if (!/marca\s*\/?\s*modelo\s*:/i.test(texto) || !/pre[çc]o\s+unit/i.test(texto)) return out;
  // marca = grupo temperado: consome ate encontrar �, fim de linha, ou um rotulo seguinte
  const re = /(?:Lote\s*\d+\s*[-–]\s*)?Item\s*(\d{1,4})\s*[:\-][\s\S]{0,500}?marca\s*\/?\s*modelo\s*:\s*((?:(?!\s*(?:�|Quantidade|Qtde|Quant\b|pre[çc]o|Valor\b|Un\b))[^\n]){1,50})[\s�]*(?:Quantidade\s*:\s*[\d.,�]+)?[\s\S]{0,60}?pre[çc]o\s*Unit[áa]rio\s*:\s*r\$\s*([\d.]*\d,\d{2})/gi;
  let m;
  while ((m = re.exec(texto))) {
    out.push({ numero: parseInt(m[1], 10), marcaRaw: m[2].trim(), valorUnit: parseBRL(m[3]) });
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
export function parse(texto, itensApi) {
  const result = [];
  if (!texto || !Array.isArray(itensApi) || itensApi.length === 0) return result;

  const rows = parseDom(texto);
  if (rows.length === 0) return result;

  // ancora por PRECO: cada linha DOM casa com o item da API cujo unit_homologado bate.
  // (protege contra bundles do DOM mal-atribuidos ao processo — item N do DOM != item N da API)
  const apiByPrice = itensApi
    .map(it => ({ it, u: apiUnit(it.unit_homologado) }))
    .filter(x => x.u != null && x.u > 0);

  const usados = new Set();
  for (const r of rows) {
    if (!isRealBrand(r.marcaRaw)) continue;
    if (r.valorUnit == null) continue;

    // 1) tenta casar por PRECO (robusto)
    let alvo = apiByPrice.find(x => !usados.has(x.it.numero) && moneyEq(r.valorUnit, x.u));
    let confianca = 'alta';
    // 2) fallback: mesmo numero E preco compativel (nunca so numero — DOM renumera)
    if (!alvo) {
      const cand = apiByPrice.find(x => x.it.numero === r.numero && !usados.has(x.it.numero));
      if (cand && moneyEq(r.valorUnit, cand.u)) { alvo = cand; confianca = 'alta'; }
    }
    if (!alvo) continue; // preco nao casa nenhum item homologado -> descarta (bundle alheio)

    const marca = trimMarca(r.marcaRaw);
    // guarda anti-vazamento: marca nao pode ser pedaco da propria descricao do item
    const marcaN = normLower(marca);
    const descN = normLower(alvo.it.descricao || '');
    if (marcaN && descN.includes(marcaN)) continue;

    usados.add(alvo.it.numero);
    result.push({
      numero: alvo.it.numero,
      marca,
      modelo: null,
      valorUnit: r.valorUnit,
      confianca,
      template: 'estado_sc',
    });
  }
  return result;
}

export default { parse };
