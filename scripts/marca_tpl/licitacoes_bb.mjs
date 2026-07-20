// Parser DETERMINISTICO de MARCA — celula: plataforma='Licitações-E BB' (Banco do Brasil, Licitações-e)
//   591 processos SC. Documentos no PNCP: apenas tipo_documento_id 2 (edital/TR/proposta) e 16 (ata).
//
// >>> ACHADO CENTRAL (engenharia reversa de 60 docs + varredura dos 853 docs com texto da celula):
//     A MARCA DO VENCEDOR NAO ESTA NOS PDFs desta plataforma. Ela e digitada pelo proponente DENTRO do
//     "Sistema Licitações-e" do Banco do Brasil e NAO e exportada para os anexos publicados no PNCP.
//     Varios editais dizem isso com todas as letras:
//       "Descrição resumida e indicação da MARCA e MODELO ... a ser lançado pela proponente no Sistema
//        Licitações-e" (83807586000128, 83807586000128/2026/1).
//
//     O que aparece nos documentos:
//       - tipo 2 (688 docs): editais/TRs. "marca" surge so como PROSA JURIDICA ("poderá autorizar a troca
//         de marca", "caso o TR exija determinada marca ou modelo", "marca do fornecedor na etiqueta"),
//         como INSTRUCAO ("lançar a marca no Sistema") ou como TEMPLATE DE PROPOSTA EM BRANCO
//         ("Marca:________ Preço unitário: R$______"). Nenhum valor de marca preenchido.
//       - tipo 16 (165 docs): "Ata do Processo ... Comissão de Licitações ... Resumo do processo:" —
//         ata NARRATIVA gerada pela plataforma (lotes, vencedor por VALOR, fornecedor). SEM coluna de marca.
//
//     Colunas "MARCA" que existem no cabecalho aparecem VAZIAS nos dados:
//       - CASAN "... Quantidade MARCA [modelo] Preço Unitário ..." -> celula MARCA em branco (brita/pedra).
//       - Porto S.Francisco "... QTD MARCA/ MODELO VALOR UNIT ..." -> celula em branco (form de proposta).
//
// >>> CONCLUSAO HONESTA: esta celula NAO traz marca ao PNCP por documento. Rendimento real ~0%.
//     A marca desta plataforma so seria recuperavel via a 2a API de Consulta do PNCP (campos de item) ou
//     scraping do proprio portal Licitações-e — fora do escopo "texto do documento".
//
// Este parser existe para (a) fechar a celula deterministicamente e (b) CAPTURAR marca SE algum dia um
// anexo trouxer a coluna MARCA/MODELO efetivamente PREENCHIDA (proposta digitalizada). Ele ancora SEMPRE
// no unit_homologado (API), casa por itensApi.numero, DESCARTA quando nao casa, e aplica anti-falso-
// positivo agressivo. Nos 60+ docs observados ele retorna [] (correto: nao ha marca no documento).
// Zero rede / zero LLM.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Ausencia de marca / rotulos / genericos — NUNCA e marca de fabricante
const LIXO = new Set([
  "propria", "proprio", "marca propria", "sem marca", "s marca", "nao aplicavel", "n aplicavel",
  "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas", "varias", "varios",
  "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional", "importado", "referencia",
  "conforme edital", "a definir", "objeto", "servico", "servicos", "nao", "sim", "und", "unid",
]);
// unidades de medida (podem preceder/seguir a celula de marca)
const UNITS = new Set([
  "unidade", "und", "un", "unid", "uni", "pc", "pca", "peca", "pecas", "caixa", "cx", "litro", "lt", "l",
  "kg", "g", "mg", "m", "m2", "m3", "metro", "metros", "ml", "par", "pares", "pacote", "pct", "fardo",
  "fd", "resma", "galao", "gl", "frasco", "fr", "conjunto", "cj", "cjto", "kit", "rolo", "saco", "ton",
  "sc", "balde", "bd", "lata", "tubo", "tb", "barra", "folha", "fl", "dz", "duzia", "milheiro", "to",
  "ampola", "comprimido", "capsula", "envelope", "bloco", "bobina", "grama", "hora", "vidro", "bisnaga",
  "tonelada", "km", "cento", "jogo", "jg", "display", "blister", "pote", "pt", "m³", "m²",
]);
// sufixos de nome de EMPRESA (fornecedor, nao marca de produto)
const EMPRESA_RE = /\b(ltda|eireli|epp|s\/?a|industria|comercio|comercial|distribuidora|representac|import|export|cnpj|cpf|mineracao|britagem|transpor)\b/i;
// PROSA juridica de edital/TR onde "marca" e falso-positivo
const PROSA_RE = /(troca de (modelo|marca)|substitu|admitida|admite|vedad|preferencia|determinada marca|marca de refer|a ser lan[cç]ad|no sistema|licitac|proponente|será alterada|poder[aá] ser|caso o|quando for o caso|etiqueta|rastreab|nome do fabricante)/i;

function ehLixo(nm) {
  if (!nm || nm.length < 2 || nm.length > 40) return true;
  if (/^\d+$/.test(nm)) return true;
  if (LIXO.has(nm)) return true;
  if (nm.split(" ").every((w) => LIXO.has(w) || UNITS.has(w))) return true;
  return false;
}

// formas do valor no PDF (2 e 4 casas, com/sem milhar)
function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`, `${cp},${dec}00`, `${int},${dec}00`])];
}

// Assinaturas de cabecalho de coluna MARCA nos anexos desta celula.
function detectaTemplate(texto) {
  const t = texto;
  // CASAN: "... Unidade Quantidade MARCA [modelo] Preço Unitário ..."
  if (/Quantidade\s+MARCA\s*\[modelo\]\s+Pre[cç]o/i.test(t)) return "casan_marca_modelo";
  // Porto/planilha de proposta: "... QTD MARCA/ MODELO VALOR UNIT ..."
  if (/QTD\s+MARCA\/\s*MODELO\s+VALOR\s+UNIT/i.test(t)) return "coluna_marca_modelo";
  return "outro";
}

// Extracao ANCORADA no valor: acha a forma do unit_homologado no texto e le a celula de marca
// imediatamente ANTES do valor (coluna Marca fica entre Qtd e Preco Unitario). Se a celula estiver
// vazia (caso real em 100% dos docs observados) ou for lixo/prosa/empresa -> nao emite (correto).
function parseColuna(texto, itensApi) {
  const out = [];
  const usados = new Set();
  for (const it of itensApi) {
    const formas = formasValor(it.unit_homologado);
    let achou = null;
    for (const f of formas) {
      let from = 0, pos;
      while ((pos = texto.indexOf(f, from)) >= 0) {
        from = pos + f.length;
        if (usados.has(pos)) continue;
        // janela imediatamente antes do valor (a celula de marca): ate 40 chars
        const janela = texto.slice(Math.max(0, pos - 42), pos);
        // rejeita se a janela e prosa juridica
        if (PROSA_RE.test(texto.slice(Math.max(0, pos - 120), pos + 40))) continue;
        // candidato = ultimo grupo alfabetico (a marca cola no valor) apos remover unidade/qtd
        const mtok = janela.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ&.\-\/ ]{1,30})\s+(?:[\d.,]+\s+)?$/);
        if (!mtok) continue;
        let toks = mtok[1].trim().split(/\s+/);
        while (toks.length > 1 && UNITS.has(norm(toks[0]))) toks.shift();
        while (toks.length > 1 && UNITS.has(norm(toks[toks.length - 1]))) toks.pop();
        let marca = toks.join(" ").replace(/[.,;:\-–\s]+$/, "").replace(/^[.,;:\-–\s]+/, "").trim();
        const nm = norm(marca);
        if (ehLixo(nm)) continue;
        if (EMPRESA_RE.test(marca)) continue;
        if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\-\/ ]{2,}$/.test(marca)) continue; // sem digitos = marca limpa
        achou = { pos, marca };
        break;
      }
      if (achou) break;
    }
    if (!achou) continue;              // nao casou -> DESCARTA (nunca chuta)
    usados.add(achou.pos);
    out.push({ numero: it.numero, marca: achou.marca.slice(0, 60), modelo: null, valorUnit: Number(it.unit_homologado), confianca: "media", template: "licitacoes_bb" });
  }
  return out;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const tpl = detectaTemplate(texto);
  if (tpl === "casan_marca_modelo" || tpl === "coluna_marca_modelo") return parseColuna(texto, itensApi);
  // demais docs (editais/TR = prosa; atas narrativas = sem coluna): marca ausente no documento
  return [];
}

export { detectaTemplate };
