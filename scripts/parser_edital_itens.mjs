// LEITOR DA ESPECIFICAÇÃO DO ITEM NO EDITAL — o cabeçalho de cada edital ESTABELECE o modelo daquele edital.
//
// ═══ POR QUE ESTE LEITOR NÃO TEM UM MODELO EMBUTIDO ═══
// Não existe padrão legal para o quadro de itens do edital. A Lei 14.133 obriga a PUBLICAR o edital, não a
// formatá-lo — cada órgão e cada ERP monta a tabela como quer, com as colunas na ordem que quiser.
// Medido em 06/ago/2026, nos DOIS documentos do MESMO processo (2026/85):
//     termo de referência:  ITEM  UNID  QTD  DESCRIÇÃO  VALOR UNITÁRIO  VALOR TOTAL   → descrição é a 4ª
//     edital:               Item  Especificação  UN  Quant.  Preço Unitário R$        → descrição é a 2ª
// Qualquer regex de posição fixa erra num dos dois. É exatamente o defeito do enriquecimento atual, que
// deixou 117.364 descrições começando com números, 102.376 com maioria de dígitos e 34.517 com dotação
// orçamentária no lugar da especificação — e ainda assim rotuladas como confiança "alta".
//
// Então o leitor faz o contrário de assumir: ele LÊ o cabeçalho, DESCOBRE ali a ordem das colunas, e essa
// ordem — o modelo daquele edital — sai no resultado para ser registrada. Documento novo, cabeçalho novo,
// ordem nova, e o mesmo leitor funciona porque não decorou nada.
//
// ═══ O QUE NÃO VARIA É O ESPELHO ═══
// numero, unidade, quantidade e unit_estimado são os mesmos para todo edital de todo órgão. São eles que
// cercam a célula da descrição e provam que a linha lida é a linha certa. A fronteira vem de FORA do
// documento — foi a lição que fez o leitor do termo municipal funcionar onde o de contrato falhou.
//
// ═══ E QUANDO NÃO HÁ QUADRO, NÃO SE LÊ ═══
// Medido: em muitos editais o valor do item aparece dentro de uma CLÁUSULA, não de uma tabela —
//   "5.1. Valor unitário de R$ 5.879,00 (cinco mil oitocentos e setenta e nove reais)"
// Ancorar pelo valor ali cai no meio de texto jurídico. É de onde vem o lixo de recorte. Sem cabeçalho
// reconhecido, a resposta é `sem_quadro` — dizer que não leu, e não inventar uma descrição.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
const chave = (s) => semAcento(limpa(s)).toLowerCase().replace(/[^a-z0-9]/g, "");

// ═══ O VOCABULÁRIO DAS COLUNAS ═══
// Cada papel tem vários nomes, porque cada órgão escreve o seu. A ordem interna importa: os padrões mais
// específicos vêm antes, senão "valor" casaria "valor unitário" e "valor total" com o mesmo papel.
const PAPEIS = [
  ["valor_total", /^(valor|preco|pr)?\s*(total|global)(doitem|item)?(r\$?)?$/],
  ["valor_unit", /^(valor|preco|pr|vl)\s*(unit\w*|medio|estimado|referencia|maximo|unitr\$?)?(r\$?)?$/],
  ["quantidade", /^(qtd\w*|quant\w*|qtde)$/],
  ["unidade", /^(un|und|unid\w*|unidmedida|unidadedemedida|unidadefornecimento|unidfornecimento)$/],
  ["descricao", /^(descricao\w*|especificacao\w*|espec\w*|objeto|produto|discriminacao|item\w*descricao|materialservico|material)$/],
  ["numero", /^(item|itens|n|no|num\w*|seq|lote|codigo|cod)$/],
];
function papelDe(celula) {
  const c = chave(celula);
  if (!c) return null;
  for (const [papel, re] of PAPEIS) if (re.test(c)) return papel;
  return null;
}

// candidatos a linha de cabeçalho: uma sequência de rótulos curtos, sem números longos, com ao menos
// DESCRIÇÃO e um VALOR — as duas colunas sem as quais não há o que ler nem como ancorar.
const RE_CABECALHO = /((?:[A-Za-zÀ-ÿ$.º°\/]{1,22}[ .]{1,3}){3,14})/g;

/**
 * Lê a linha de cabeçalho e ESTABELECE o modelo do edital: quais colunas existem e em que ordem.
 * @returns {{pos:number, bruto:string, colunas:string[]}|null}
 */
export function estabeleceModelo(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  RE_CABECALHO.lastIndex = 0;
  let melhor = null;
  for (const m of t.matchAll(RE_CABECALHO)) {
    const celulas = m[1].trim().split(/\s+/).filter(Boolean);
    if (celulas.length < 3) continue;
    // agrupa celulas vizinhas que formam um rotulo composto ("VALOR UNITARIO", "UNID MEDIDA")
    const papeis = [];
    for (let i = 0; i < celulas.length; i++) {
      const par = i + 1 < celulas.length ? papelDe(celulas[i] + celulas[i + 1]) : null;
      const solo = papelDe(celulas[i]);
      if (par && (!solo || par !== "numero")) { papeis.push(par); i++; }
      else if (solo) papeis.push(solo);
      else papeis.push(null);
    }
    const achados = papeis.filter(Boolean);
    const distintos = new Set(achados);
    // exige DESCRIÇÃO e algum VALOR: sem descrição não há o que ler; sem valor não há como ancorar
    if (!distintos.has("descricao")) continue;
    if (!distintos.has("valor_unit") && !distintos.has("valor_total")) continue;
    const nota = distintos.size * 10 - papeis.filter((p) => p === null).length;
    if (!melhor || nota > melhor.nota) melhor = { pos: m.index, bruto: limpa(m[1]).slice(0, 160), colunas: papeis, nota };
  }
  if (!melhor) return null;
  return { pos: melhor.pos, bruto: melhor.bruto, colunas: melhor.colunas };
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const grafias = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return [];
  const o = new Set();
  for (const c of [2, 3, 4]) o.add(n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }));
  if (Number.isInteger(n)) { o.add(String(n)); o.add(n.toLocaleString("pt-BR")); }
  return [...o];
};
const CHEIRO_DE_DOTACAO = /\b\d\s+\d\s+\d{2}\s+\d{2}\s+\d{2}\b|dotacao|elemento de despesa|ficha n|\b\d{10,}\b/i;

/**
 * @param texto  edital ou termo de referência
 * @param itens  [{numero, unidade, quantidade, valor_ref}] do PNCP  (valor_ref = unit_estimado)
 */
export function leItensEdital(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { descricao: 0, sem_quadro: 0, linha_nao_lida: 0, candidato: 0 };
  const modelo = estabeleceModelo(t);
  if (!modelo) {
    resumo.sem_quadro = itens.length;
    return { achou: false, motivo: "sem cabecalho de quadro de itens", modelo: null, itens: [], resumo };
  }
  // a descrição fica entre a coluna anterior e a seguinte: é a fronteira dos DOIS lados
  const iDesc = modelo.colunas.indexOf("descricao");
  const antes = modelo.colunas.slice(0, iDesc).filter(Boolean).pop() || null;
  const depois = modelo.colunas.slice(iDesc + 1).find(Boolean) || null;

  const out = [];
  const usados = new Set();
  for (const i of itens) {
    // âncora: o valor estimado localiza a LINHA dentro do quadro (só depois do cabeçalho)
    let pos = -1;
    for (const g of grafias(i.valor_ref)) {
      let p = modelo.pos;
      while ((p = t.indexOf(g, p + 1)) !== -1) { if (!usados.has(p)) { pos = p; break; } }
      if (pos >= 0) break;
    }
    if (pos < 0) { resumo.linha_nao_lida++; out.push({ item_pncp: Number(i.numero), status: "linha_nao_lida", motivo: "valor do item nao aparece depois do cabecalho" }); continue; }
    usados.add(pos);

    let bruto = t.slice(Math.max(modelo.pos, pos - 700), pos);
    let ancora = "valor_ref";

    // corta pela DIREITA o que a coluna seguinte à descrição consome
    if (depois === "quantidade" && i.quantidade != null) {
      for (const g of grafias(i.quantidade)) {
        const re = new RegExp(`\\s${esc(g)}\\s*$`);
        if (re.test(bruto)) { bruto = bruto.replace(re, ""); ancora += "+quantidade"; break; }
      }
    }
    // corta pela ESQUERDA na última ocorrência da coluna anterior (unidade ou quantidade)
    const alvoEsq = antes === "unidade" ? i.unidade : antes === "quantidade" ? i.quantidade : null;
    if (alvoEsq != null && String(alvoEsq).trim()) {
      const cands = antes === "unidade"
        ? [limpa(i.unidade), limpa(String(i.unidade).replace(/^(.*?)\s*\(([^)]+)\)$/, "$1")), limpa(String(i.unidade).replace(/^.*\(([^)]+)\)$/, "$1"))]
        : grafias(i.quantidade);
      for (const c of cands.filter(Boolean)) {
        const todas = [...bruto.matchAll(new RegExp(`\\b${esc(c)}\\b\\s*`, "gi"))];
        if (!todas.length) continue;
        const m = todas[todas.length - 1];
        bruto = bruto.slice(m.index + m[0].length);
        ancora += `+${antes}`;
        break;
      }
    }

    const desc = limpa(bruto);
    const base = { item_pncp: Number(i.numero), ancora, modelo: modelo.bruto };
    // sem as duas fronteiras não é célula, é recorte por proximidade — que é a origem do lixo
    const temFronteira = ancora.includes("+");
    if (!desc || desc.length < 8) { resumo.linha_nao_lida++; out.push({ ...base, status: "linha_nao_lida", motivo: "celula vazia" }); continue; }
    if (CHEIRO_DE_DOTACAO.test(desc)) { resumo.candidato++; out.push({ ...base, descricao: null, status: "candidato", motivo: "recorte com cara de dotacao orcamentaria", recorte: desc.slice(-60) }); continue; }
    if (!temFronteira) { resumo.candidato++; out.push({ ...base, descricao: null, status: "candidato", motivo: "sem fronteira: nenhuma coluna vizinha confirmada" }); continue; }
    resumo.descricao++;
    out.push({ ...base, descricao: desc.slice(-600), status: "descricao" });
  }
  return { achou: true, modelo, itens: out, resumo };
}
