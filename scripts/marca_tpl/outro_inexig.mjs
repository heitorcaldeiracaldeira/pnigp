// PARSER DETERMINÍSTICO DE MARCA — célula outro_inexig
//   slug: outro_inexig · gerador 'outro' · modalidade Inexigibilidade (modalidade_id=9) · tipos doc 1,16,20
//
// ACHADO DA ENGENHARIA REVERSA (ver _amostra_outro_inexig.mjs / _diag_modmarca.mjs):
//   Inexigibilidade (art. 74 Lei 14.133) = contratação DIRETA de fornecedor único. No portal 'outro'
//   (sistemas municipais diversos) os documentos tipo 1/16/20 são, na esmagadora maioria, PROSA:
//   Termo de Referência, Contrato, Autorização, Ratificação. Predominam SERVIÇOS e bens exclusivos
//   (grupos de dança, terapia, energia, cursos, publicações, saúde) — casos SEM marca de produto.
//   A palavra "marca" aparece quase só como FALSO POSITIVO:
//     · "Comarca de X" (foro)              · "data marcada"
//     · art.74 §1 "vedada a preferência por marca específica"
//     · prosa de nota fiscal: "indicações referentes a: marca, fabricante, modelo…"
//     · descrição de sistema: "filtros: … Marca, CNPJ…"
//   TEMPLATES de tabela encontrados NÃO têm coluna de marca:
//     · "Item Produto Quantidade Unidade Preço Unit. Máximo …"   (ex.: editora/livros)
//     · "ITEM ESPECIFICAÇÃO CATSER UNIDADE … VALOR UNITÁRIO"     (ex.: energia)
//   Existe um template de PROPOSTA com rótulo "Modelo/Marca:" mas o campo vem VAZIO (rótulo seguido
//   direto do próximo rótulo "Código Compra"): é um formulário em branco, não traz valor de marca.
//
// CONSEQUÊNCIA: nesta célula a marca determinística tem rendimento estruturalmente BAIXO. O parser
//   só devolve marca quando há um RÓTULO explícito ("Marca:" / "Modelo/Marca:") com VALOR real
//   ancorado na linha do item (unit_homologado). Nunca infere marca de prosa. Melhor 0 do que lixo.
//
//   export function parse(texto, itensApi) -> [{numero, marca, modelo, valorUnit, confianca, template}]
//   Zero rede / zero LLM.

// ---------- utilitários ----------
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// formas do valor no PDF: "1.234,56" (com milhar) e "1234,56" (sem)
export function formasValor(v) {
  const n = Number(v); if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`])];
}

// tokens que NUNCA são marca de produto (ausência de marca / rótulos / genéricos)
const LIXO = new Set(["propria", "proprio", "sem marca", "s marca", "nao possui", "nao ha", "n a", "na", "n d", "nd",
  "generico", "diversos", "varias", "varios", "sem", "outros", "outra", "modelo", "marca", "fabricante",
  "nacional", "importado", "conforme edital", "a definir", "objeto", "servico", "servicos", "codigo",
  "codigo compra", "compra", "quantidade", "unidade", "valor", "total", "item", "preco", "especificacao",
  "descricao", "produto", "catser", "catmat", "und", "un", "kg", "unit", "cnpj", "e mail", "banco", "agencia"]);

// prosa jurídica / contexto de falso-positivo em torno da palavra "marca"
const CTX_FALSO = /comarca|data marcada|marcad[ao]|prefer[eê]ncia por marca|vedad[ao]|indica[cç][aã]o de marca|referentes? a\s*:?\s*marca|filtros?\s*:|marca,\s*(fabricante|qualidade|proced[eê]ncia)|marca\s+espec[ií]fica|marca\s+pr[oó]pria|marcas?\s+e\s+especifica/i;

// extrai valor de marca a partir de um rótulo explícito na janela do item
function marcaPorRotulo(win) {
  // rótulos aceitos: "Marca", "Modelo/Marca", "Marca/Modelo", "Marca do produto", "Fabricante"
  const re = /\b(?:modelo\s*\/\s*)?(?:marca(?:\s*\/\s*modelo)?(?:\s+do\s+produto)?|fabricante)\s*[:\-–]\s*([^\n;|]{1,45})/gi;
  let m;
  while ((m = re.exec(win)) !== null) {
    // rejeita se o gatilho está em contexto de prosa/falso-positivo (janela local)
    const local = win.slice(Math.max(0, m.index - 40), m.index + 8);
    if (CTX_FALSO.test(local)) continue;
    let v = m[1]
      .replace(/\b(modelo|model|mod\.?|refer[eê]ncia|ref\.?|c[oó]digo(?:\s+compra)?|cod\.?|valor|qtd|quant|unid|unidade|un\b|r\$|pre[çc]o|marca|fabricante|total|item)\b.*$/i, "")
      .replace(/[.,;:\-–\s]+$/, "").replace(/^[\s.:\-–]+/, "").trim();
    const nv = norm(v);
    if (!nv || nv.length < 2 || nv.length > 40) continue;
    if (LIXO.has(nv)) continue;
    if (/^\d+$/.test(nv)) continue;                       // só número não é marca
    if (nv.split(" ").every((w) => LIXO.has(w))) continue; // tudo lixo
    if (CTX_FALSO.test(v)) continue;
    return v.slice(0, 60);
  }
  return null;
}

// extrai marca de uma COLUNA (cabeçalho tem 'marca' entre especificação e preço); só se o layout tiver a coluna.
// Nesta célula os cabeçalhos observados NÃO têm coluna de marca, então esta rota fica desligada por padrão
// e só dispara se detectarmos um cabeçalho com 'MARCA' como campo de tabela na vizinhança.
function temColunaMarca(texto) {
  return /(especifica[cç][aã]o|descri[cç][aã]o|produto)[^\n]{0,60}\bmarca\b[^\n]{0,40}(pre[cç]o|valor|unit)/i.test(texto);
}

export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  const big = String(texto);
  const coluna = temColunaMarca(big);

  for (const it of itensApi) {
    const numero = it.numero;
    const unit = it.unit_homologado ?? it.valorUnit ?? it.unit;
    const cnpjV = it.cnpj_fornecedor ? String(it.cnpj_fornecedor).replace(/\D/g, "") : null;

    // ÂNCORA: localiza a ocorrência do valor unitário homologado que mais parece a linha do item
    let bestPos = -1, bestSc = -1;
    for (const fv of formasValor(unit)) {
      let pos = big.indexOf(fv);
      while (pos >= 0) {
        const ctx = big.slice(Math.max(0, pos - 400), pos + 80);
        let sc = 0;
        if (cnpjV && cnpjV.length >= 8 && ctx.replace(/\D/g, "").includes(cnpjV)) sc += 10;
        if (new RegExp(`(^|[^\\d])0*${numero}([^\\d]|$)`).test(big.slice(Math.max(0, pos - 260), pos))) sc += 2;
        if (it.quantidade > 0 && new RegExp(`(^|[^\\d])${it.quantidade}([^\\d]|$)`).test(ctx)) sc += 1;
        if (/\bmarca\b/i.test(ctx) && !CTX_FALSO.test(ctx)) sc += 1;
        if (sc > bestSc) { bestSc = sc; bestPos = pos; }
        if (bestSc >= 12) break;
        pos = big.indexOf(fv, pos + 1);
      }
      if (bestSc >= 12) break;
    }
    // sem valor no doc → não há como ancorar; se houver 1 único item e 1 rótulo de marca no doc todo,
    // ainda tentamos (fallback single-item), senão descarta.
    let win = null;
    if (bestPos >= 0) {
      win = big.slice(Math.max(0, bestPos - 300), bestPos + 40);
    } else if (itensApi.length === 1) {
      win = big; // doc de item único: a janela é o doc inteiro (raro ter rótulo real, mas não pendura em item errado pois só há 1)
    } else {
      continue; // multi-item sem âncora → NÃO atribui (evita marca no item errado)
    }

    // exige confirmação mínima quando ancorou por valor em doc multi-item
    if (bestPos >= 0 && itensApi.length > 1 && bestSc < 2) continue;

    const marca = marcaPorRotulo(win);
    if (!marca) continue;

    // confiança: alta se ancorou por valor com sinal forte OU há coluna de marca; média caso contrário
    const confianca = (bestSc >= 10 || (bestSc >= 2 && coluna)) ? "alta" : "media";
    out.push({
      numero,
      marca,
      modelo: null,
      valorUnit: unit != null ? Number(unit) : null,
      confianca,
      template: coluna ? "coluna-marca" : "rotulo-marca",
    });
  }
  return out;
}

export default { parse };
