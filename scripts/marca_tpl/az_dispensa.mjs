// PARSER DETERMINÍSTICO DE MARCA — célula: az_dispensa
//   portal (gerador): az   ·   modalidade: Dispensa (modalidade_id=8)   ·   tipos de documento: 1,16,20
//
// DECIFRAÇÃO DO TEMPLATE (engenharia reversa de 60 exemplares):
//   Os docs desta célula são o lado do AVISO da compra direta — "Aviso de Contratação Direta" /
//   "Aviso de Dispensa Eletrônica", quase todos no modelo federal da AGU ("Câmara Nacional de Modelos
//   de Licitações e Contratos da Consultoria-Geral da União") ou em avisos municipais equivalentes.
//   Esses documentos são PUBLICADOS ANTES de o vencedor ser conhecido. A tabela de itens que trazem é a
//   ESPECIFICAÇÃO + PREÇO ESTIMADO (pesquisa de preços), com cabeçalhos como:
//       "Item Objeto Marca/ modelo Unidade de medida Quantidade ... Valor unitário Subtotal"  (coluna Marca VAZIA)
//       "DESCRIÇÃO QUANT UNI VALOR UNIT. VALOR TOTAL"                                          (sem coluna marca)
//       "Item Quant. Un. Descrição Cotação Máxima Unitária Cotação Máxima Total"               (sem coluna marca)
//       "... TMAT Descrição UF Qtd Valor (Mediana) Orçamento Valor TT"                         (sem coluna marca)
//   → NÃO existe coluna de marca do VENCEDOR preenchida. As ocorrências do token "marca" são, na esmagadora
//     maioria, PROSA JURÍDICA do modelo ("a marca do produto, quando for o caso, e o preço", vedação do
//     art. 41, "data marcada", "Comarca") ou marcas de REFERÊNCIA embutidas na descrição do objeto
//     ("Modelo de referência: ...Epson...Kodak", "manutenção de veículo trator marca John Deere") — que
//     são o objeto sendo comprado/consertado, NÃO o produto do vencedor.
//   → Medição: dos 158 itens homologados dos 60 docs, só 10 têm o unit_homologado presente no texto, e mesmo
//     esses caem no PREÇO ESTIMADO, sem marca de vencedor ao lado. Zero marcas de vencedor extraíveis.
//
// A marca do vencedor de uma DISPENSA vive no Termo/Proposta vencedora (outro tipo de documento), não neste
// conjunto de aviso. Por isso este parser é de ALTA PRECISÃO e recall ~0 nesta célula: só emite marca quando
// há um rótulo "Marca:" preenchido (proposta anexada) OU uma coluna "Marca" real com valor plausível, ancorado
// no item, e sempre rejeitando prosa/vedação/modelo-de-referência. Nunca pendura marca no item errado.
//
// export function parse(texto, itensApi) -> [{numero, marca, modelo|null, valorUnit|null, confianca, template}]
// Zero rede / zero LLM.

const TEMPLATE = "az/aviso-contratacao-direta";

// ---- LIXO: nunca é marca de produto do vencedor ----
const LIXO = new Set(["propria","proprio","sem marca","s marca","nao possui","na","nd","generico","diversos",
  "varias","varios","sem","outros","outra","modelo","marca","fabricante","nacional","importado","conforme edital",
  "a definir","objeto","servico","servicos","referencia","de referencia","qualquer","similar","equivalente",
  "quando for o caso","do produto","nao se aplica","na o","xxxxxxxxxxxxxxxx"]);

// trechos de PROSA que, se aparecem na janela do "marca", denunciam falso positivo (vedação/modelo/prazo)
const PROSA = /(quando for o caso|do produto,? quando|se aplic|vedada a identifica|n[ãa]o ser[áa] admitida|indica[çc][ãa]o de marca|marca pr[óo]pria|data marcada|comarca|modelo[s]? de refer[êe]ncia|refer[êe]ncia:|coincidir com o nome|mesma marca dos produtos|marca e modelo do produto|marca do produto)/i;

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

// formas do valor no PDF: "1.234,56" e "1234,56"
function formasValor(v) {
  const n = Number(v); if (!Number.isFinite(n) || n <= 0) return [];
  const [i, dec] = n.toFixed(2).split(".");
  const cp = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${i},${dec}`])];
}

function marcaValida(v) {
  const nv = norm(v);
  if (!nv || nv.length < 2 || nv.length > 40) return false;
  if (LIXO.has(nv)) return false;
  if (/^\d+$/.test(nv)) return false;                       // só número não é marca
  if (/^x{3,}$/i.test(v.trim())) return false;              // placeholder xxxx
  if (nv.split(" ").every((w) => LIXO.has(w))) return false;
  return true;
}

// Extrai marca de um rótulo "Marca:"/"Marca -"/"Marca/Fabricante:" dentro da janela do item.
// Só aceita valor preenchido, para no próximo campo, e rejeita prosa.
function marcaDoRotulo(win) {
  const re = /\bmarca(?:\s*[\/-]\s*fabricante)?\s*[:\-–]\s*([^\n;|]{1,45})/gi;
  let m;
  while ((m = re.exec(win)) !== null) {
    const pre = win.slice(Math.max(0, m.index - 30), m.index + 60);
    if (PROSA.test(pre)) continue;                          // "a marca do produto, quando for o caso" etc.
    let v = m[1]
      .replace(/\b(modelo|model|mod\.?|refer[êe]ncia|ref\.?|c[óo]digo|cod\.?|valor|qtd|quant|unid|unidade|un\b|r\$|pre[çc]o|fabricante|procedencia)\b.*$/i, "")
      .replace(/[.,;:\-–\s]+$/, "").replace(/^[\s.:\-–]+/, "").trim();
    if (v && marcaValida(v)) return v.slice(0, 60);
  }
  return null;
}

export function parse(texto, itensApi) {
  const out = [];
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  const big = String(texto);

  for (const it of itensApi) {
    const numero = it.numero;
    const uh = Number(it.unit_homologado);
    const cnpjV = it.cnpj_fornecedor ? String(it.cnpj_fornecedor).replace(/\D/g, "") : null;

    // ÂNCORA: localizar a linha do item pelo unit_homologado (mais específico) confirmado por CNPJ/nº do item.
    let bestPos = -1, bestSc = -1;
    for (const fv of formasValor(uh)) {
      let pos = big.indexOf(fv);
      while (pos >= 0) {
        const ctx = big.slice(Math.max(0, pos - 500), pos + 120);
        let sc = 0;
        if (cnpjV && ctx.replace(/\D/g, "").includes(cnpjV)) sc += 10;            // CNPJ do vencedor → linha certa
        if (numero != null && new RegExp(`(^|\\D)0*${numero}(\\D)`).test(big.slice(Math.max(0, pos - 300), pos))) sc += 2;
        if (it.quantidade > 0 && new RegExp(`\\b${it.quantidade}\\b`).test(ctx)) sc += 1;
        if (/\bmarca\b/i.test(ctx)) sc += 1;
        if (sc > bestSc) { bestSc = sc; bestPos = pos; }
        if (bestSc >= 12) break;
        pos = big.indexOf(fv, pos + 1);
      }
      if (bestSc >= 12) break;
    }
    // Sem âncora confiável NÃO atribui marca (não pendura no item errado). Exige valor casado + nº/CNPJ.
    if (bestPos < 0 || bestSc < 2) continue;

    // Janela curta por item (a marca do vencedor, quando existe, fica ANTES do valor unitário).
    const win = big.slice(Math.max(0, bestPos - 300), bestPos + 40);

    const marca = marcaDoRotulo(win);
    if (marca) out.push({ numero, marca, modelo: null, valorUnit: uh || null, confianca: "media", template: TEMPLATE });
    // Nenhuma coluna de marca de vencedor preenchida existe neste template → nada além do rótulo é emitido.
  }
  return out;
}

export default { parse, TEMPLATE };
