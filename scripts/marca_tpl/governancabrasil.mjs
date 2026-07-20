// Parser DETERMINISTICO de MARCA — celula: plataforma ILIKE 'Governançabrasil%' (~6.148 processos).
//
// ENGENHARIA REVERSA (amostra de 60 + varredura de assinaturas em toda a celula, 5.941 processos com
// item homologado / 40.621 itens). CONCLUSAO HONESTA: a Governançabrasil NAO publica no PNCP uma coluna
// estruturada de MARCA do vencedor. O template GERADO dominante da plataforma e o "PEDIDO DE EMPENHO /
// AUTORIZACAO DE FORNECIMENTO" (2.088 processos, assinatura "IV - ITEM(S) ... Discriminacao Pr. Unitario
// Total do Item" + rodape "IMPORTANTE I - O numero deste pedido..."). Nesse template a coluna e uma
// DISCRIMINACAO em texto livre que ECOA a descricao do item — SEM coluna de marca. A marca so aparece
// quando o comprador a DIGITOU inline na discriminacao (~8 processos) ou em documentos HETEROGENEOS
// anexados (proposta de fornecedor com coluna "ITEM MARCA MODELO..." ~2 proc; leilao de bens ~5 proc).
// Cobertura real de marca do vencedor na celula: ~0,4% dos processos. Ver relatorio.
//
// TEMPLATES que este parser extrai (todos ALTA PRECISAO, ancorados ao unit_homologado, descarta se nao casa):
//   A) AF_INLINE  — "IV - ITEM(S)". Marca escrita inline na linha do item, ANTES do preco unitario:
//        "... MOTOBOMBA SUBMERSIVEL, MARCA FAMAC, MODELO FBS20/2. 3.980,00 3.980,00"
//        "... Jogo de cartas UNO: original, marca Mattel games, material ... 27,90 4,43"
//      Ancora: o valor unit (unit_homologado) aparece logo APOS a marca na MESMA linha. Anti-FP: descarta
//      "marca do/da/de <...>", "que marca", "marca de referencia/fabricacao/qualidade", "marca do veiculo"
//      (prosa de justificativa/observacao, que fica FORA da linha do item, depois do preco).
//   B) MARCA_LABEL — rotulo "Marca: <X>" / "Marca/Modelo: <X>/<Y>" (proposta de fornecedor anexada),
//      ancorado a um preco unitario proximo. EXCLUI contexto de LEILAO ("VALOR MINIMO PARA VENDA",
//      "arrematante", "leiloeiro", "DEBITOS:") — nesses o "MARCA:" e do bem sendo VENDIDO, nao comprado.
//   C) PROPOSTA_COL — cabecalho "ITEM MARCA MODELO ESPECIFICACAO ... VALOR UN"; marca = token(s) apos o
//      numero do item, ancorado ao preco no fim da linha.
//
// Zero rede / zero LLM. node --check ok.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// tokens que NUNCA sao marca de fabricante (prosa / ausencia / rotulo / generico)
const STOP = new Set([
  "do", "da", "de", "dos", "das", "o", "a", "os", "as", "e", "ou", "no", "na", "em", "para", "por", "com", "sem",
  "que", "qual", "quando", "caso", "conforme", "referencia", "fabricacao", "fabricante", "veiculo", "veiculos",
  "produto", "produtos", "qualidade", "propria", "proprio", "oficialmente", "oficial", "registrada", "propriedade",
  "d agua", "dagua", "agua", "comercial", "generica", "generico", "nacional", "importado", "modelo", "marca",
  "sera", "admitida", "admitido", "vedada", "vedado", "indicacao", "cor", "tamanho", "material", "tipo",
  "um", "uma", "seu", "sua", "este", "esta", "esse", "essa", "aquele", "mesma", "mesmo",
]);
// sufixos de nome de EMPRESA (nao e marca de produto)
const EMPRESA_RE = /\b(ltda|eireli|epp|s\/?a|industria|comercio|comercial|distribuidora|representac|import|export)\b/i;
const LEILAO_RE = /(valor\s+m[ií]nimo\s+para\s+venda|arrematante|leiloeir|d[ée]bitos\s*:|\bleil[ãa]o\b|renavam)/i;

function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`, `${cp},${dec}00`, `${int},${dec}00`])];
}

// limpa marca capturada: tira pontuacao das bordas, corta em delimitadores, valida
function limpaMarca(raw) {
  if (!raw) return null;
  let m = raw.replace(/^[\s,;:.\-–/]+/, "").replace(/[\s,;:.\-–/]+$/, "").trim();
  // corta se comeca a virar spec ("material", "cor", numeros longos)
  m = m.split(/\s+(?:material|cor|tamanho|dimens|medindo|composic|conforme|ref\b)/i)[0].trim();
  if (!m) return null;
  const toks = m.split(/\s+/).slice(0, 3);
  const nm = norm(toks[0]);
  if (!nm || nm.length < 2 || nm.length > 24) return null;
  if (STOP.has(nm)) return null;
  if (/^\d+$/.test(nm)) return null;
  if (EMPRESA_RE.test(m)) return null;
  // exige que o 1o token pareca marca (letra inicial, sem ser so pontuacao)
  if (!/^[A-Za-zÀ-ÿ0-9][\wÀ-ÿ.&/-]*$/.test(toks[0])) return null;
  const out = toks.join(" ").replace(/[\s,;:.\-–/]+$/, "").trim();
  return out.length >= 2 && out.length <= 40 ? out : null;
}

function detecta(texto) {
  const t = texto;
  const af = /IV\s*-\s*ITEM/.test(t) && /Discrimina/i.test(t);
  const prop = /ITEM\s+MARCA\s+MODELO/i.test(t);
  const label = /Marca\s*\/?\s*(?:Modelo)?\s*:\s*[A-Z0-9]/.test(t) && !LEILAO_RE.test(t);
  return { af, prop, label };
}

// ————— TEMPLATE A: AF_INLINE —————
// Para cada item, acha o preco unit; olha a JANELA imediatamente ANTES do preco (mesma linha do item) por
// "marca <X>" e opcional "modelo <Y>". Descarta se a palavra apos "marca" for stopword (prosa).
function parseAF(texto, itensApi) {
  const out = [];
  const usados = new Set();
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    let best = null;
    for (const f of formas) {
      let from = 0, pos;
      while ((pos = texto.indexOf(f, from)) >= 0) {
        from = pos + f.length;
        // a proxima "coluna" apos o preco unit deve ser um numero (valor total) — confirma que e linha de item
        const after = texto.slice(pos + f.length, pos + f.length + 14);
        if (!/^\s*[R$\s]*\d/.test(after)) continue;
        let win = texto.slice(Math.max(0, pos - 240), pos);           // cauda da linha, antes do preco
        // corta o inicio da janela no ULTIMO preco anterior (fronteira de linha) p/ nao vazar da linha de cima.
        // preco = \d,\d{2} com fronteira (a quantidade "N,0000" tem 4 casas e NAO casa).
        const pm = [...win.matchAll(/\d[\d.]*,\d{2}\b/g)];
        if (pm.length) win = win.slice(pm[pm.length - 1].index + pm[pm.length - 1][0].length);
        const winBase = Math.max(0, pos - 240) + (texto.slice(Math.max(0, pos - 240), pos).length - win.length);
        // ultima ocorrencia de "marca <X>" na janela (a mais proxima do preco)
        const re = /\bmarca\s+([A-Za-zÀ-ÿ0-9][^\n]{0,40}?)(?=\s+modelo\b|,|\.|;|\s{2,}|\s*\d[\d.]*,\d{2}\b|$)/gi;
        let mm, cap = null, capPos = -1;
        while ((mm = re.exec(win)) !== null) { cap = mm[1]; capPos = mm.index; }
        if (cap === null) continue;
        const marca = limpaMarca(cap);
        if (!marca) continue;
        // modelo opcional logo apos
        let modelo = null;
        const tail = win.slice(capPos);
        const md = tail.match(/\bmodelo\s+([A-Za-z0-9][\wÀ-ÿ.\-/]{0,20})/i);
        if (md) modelo = md[1].replace(/[.,;]+$/, "");
        const gap = pos - (winBase + capPos);                          // dist marca->preco (menor = melhor)
        if (!best || gap < best.gap) best = { marca, modelo, gap, key: `${pos}` };
      }
    }
    if (!best) continue;                        // nao casou -> descarta
    if (usados.has(best.key)) continue;
    usados.add(best.key);
    out.push({ numero: it.numero, marca: best.marca.slice(0, 60), modelo: best.modelo, valorUnit: Number(it.unit_homologado), confianca: "alta", template: "governancabrasil" });
  }
  return out;
}

// ————— TEMPLATE B: MARCA_LABEL (proposta anexa) — exclui leilao —————
function parseLabel(texto, itensApi) {
  if (LEILAO_RE.test(texto)) return [];
  // coleta rotulos "Marca: X" e "Marca/Modelo: X / Y" com sua posicao
  const labels = [];
  const re = /Marca\s*\/?\s*(Modelo)?\s*:\s*([A-Za-zÀ-ÿ0-9][^\n/]{1,30})(?:\/\s*([^\n]{1,30}))?/gi;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const marca = limpaMarca(m[2]);
    if (!marca) continue;
    labels.push({ pos: m.index, marca, modelo: m[3] ? m[3].trim().slice(0, 30) : null });
  }
  if (!labels.length) return [];
  const out = [];
  const usados = new Set();
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    let best = null;
    for (const f of formas) {
      let from = 0, pos;
      while ((pos = texto.indexOf(f, from)) >= 0) {
        from = pos + f.length;
        for (const L of labels) {
          const d = Math.abs(L.pos - pos);
          if (d <= 400 && (!best || d < best.d)) best = { ...L, d };
        }
      }
    }
    if (!best) continue;
    if (usados.has(best.pos)) continue;
    usados.add(best.pos);
    out.push({ numero: it.numero, marca: best.marca.slice(0, 60), modelo: best.modelo, valorUnit: Number(it.unit_homologado), confianca: "media", template: "governancabrasil" });
  }
  return out;
}

// ————— TEMPLATE C: PROPOSTA_COL "ITEM MARCA MODELO ESPECIFICACAO ... VALOR UN" —————
function parseProposta(texto, itensApi) {
  const hdr = texto.search(/ITEM\s+MARCA\s+MODELO/i);
  if (hdr < 0) return [];
  const body = texto.slice(hdr);
  const out = [];
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    let best = null;
    for (const f of formas) {
      // linha: "<num> <MARCA> <resto...> <valorUn>"; captura o token de marca apos o numero do item
      const re = new RegExp(`(?:^|\\s)${it.numero}\\s+([^\\n]{1,40}?)\\s+[^\\n]*?R?\\$?\\s*${f.replace(/[.$]/g, m => "\\" + m)}\\b`, "m");
      const mm = body.match(re);
      if (!mm) continue;
      const marca = limpaMarca(mm[1]);
      if (!marca) continue;
      best = marca; break;
    }
    if (!best) continue;
    out.push({ numero: it.numero, marca: best.slice(0, 60), modelo: null, valorUnit: Number(it.unit_homologado), confianca: "media", template: "governancabrasil" });
  }
  return out;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const d = detecta(texto);
  const seen = new Map();
  const push = (arr) => { for (const r of arr) if (!seen.has(r.numero)) seen.set(r.numero, r); };
  if (d.af) push(parseAF(texto, itensApi));         // vein primario (compras reais)
  if (d.prop) push(parseProposta(texto, itensApi));
  if (d.label) push(parseLabel(texto, itensApi));
  return [...seen.values()];
}

export { detecta, limpaMarca, formasValor };
