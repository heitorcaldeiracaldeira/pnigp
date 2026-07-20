// PARSER DETERMINÍSTICO — "Pública" (id: publica) — Termo de Homologação e Adjudicação gerado pelo sistema de
// Compras da plataforma Betha ("Sistema: Compras", assinatura "verificador-assinaturas.plataforma.betha.cloud").
// Roteado por arquivo_texto_sc.gerador='outro' + o texto trazer o TERMO DE HOMOLOGAÇÃO com tabela "Participante:".
// NÃO pela plataforma do PNCP ([[mapa_atas_plataformas]]): quem publica é o consórcio/ERP, não quem rodou a sessão.
//
// COBERTURA = "vencedor": o Termo lista, POR PARTICIPANTE (o vencedor de cada item já adjudicado), a tabela de itens
//   com quantidade + valor unitário + valor total + MARCA do vencedor. NÃO há proposta por concorrente, NÃO há
//   modelo (o sistema só emite o campo "Marca:"). Marca só aparece em compras de PRODUTO — em SERVIÇO/consulta/
//   transporte o sistema grava "Marca: N/C" ou não emite o campo (fiel à fonte). Ver notas.
//
// ESTRUTURA REAL (lida do documento, whitespace já normalizado):
//   TERMO DE HOMOLOGAÇÃO E ADJUDICAÇÃO DE PROCESSO LICITATÓRIO ... <objeto> ...
//   Participante: BRUNO R. C. KALINOVSKI LTDA (37.368.433/0001-04)
//   UnidadeItem Especificação Qtd. Valor TotalValor Unitário         <- CABEÇALHO da tabela (colado pelo PDF)
//   1 CARRINHO DE BEBÊ. <spec...> 20,000 UN 419,00 8.380,00 Marca: COSCO
//   2 BEBÊ CONFORTO. <spec...> 2,000 UN 275,00 550,00 Marca: TUTTTI BABY
//   Total do Participante: 8.930,00
//   Participante: GESUL COMERCIAL LTDA (14.711.959/0001-40) ...
//   Total Geral: 11.368,95
//
// ⚠️ ARMADILHAS medidas no texto real:
//  1. A QUANTIDADE tem SEMPRE 3 casas decimais ("20,000", "1.100,000") e os VALORES têm 2 ("419,00"). Essa diferença
//     (`,\d{3}` vs `,\d{2}`) é a âncora que separa a coluna de qtd das colunas de valor no PDF achatado.
//  2. A ORDEM das colunas de valor é ENGANOSA: o cabeçalho diz "Valor Total" antes de "Valor Unitário", mas o dado
//     vem UNITÁRIO e depois TOTAL. Não confiar no rótulo — desambiguar por ARITMÉTICA (qtd × unit ≈ total).
//  3. O RODAPÉ do PDF ("Sistema: Compras - Usuário: X. Emissão: ... Protocolo: <uuid>  Página: 2 / 2") se intromete
//     NO MEIO da tabela entre uma página e outra e vaza para dentro da descrição/marca se não for removido antes.
//  4. Descrição costuma vir DUPLICADA ("NOME. <spec> - NOME. <spec>") — inofensivo p/ casamento por descrição.
//  5. Muitos docs que casam o filtro NÃO são o Termo (DFD, parecer jurídico citam "termo de homologa"/"julgamento de
//     propostas" de passagem). Guarda: só extrai se houver "Participante:" + o cabeçalho da tabela. Senão, [].
import { normalizaMarca } from "./mapa_atas_plataformas.mjs";

const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => s.replace(/\s+/g, "");

// rodapé de página que se intromete no meio da tabela (armadilha 3). Removido ANTES de casar as linhas.
const RODAPE = /Sistema:\s*Compras\s*-\s*Usu[áa]rio:[\s\S]*?Protocolo:\s*[0-9a-f-]{8,}/gi;
const PAGINA = /P[áa]gina:\s*\d+\s*\/\s*\d+/gi;

// cabeçalho da tabela de itens — âncora p/ começar a leitura DEPOIS dele (evita casar os dígitos do CNPJ como item).
const CAB = /Especifica[çc][ãa]o\s+Qtd\.?\s+Valor\s*Total\s*Valor\s*Unit[áa]rio/i;

// participante: "Participante: <NOME> [ (<CNPJ>) ]" — ancorado no CABEÇALHO da tabela, NÃO no CNPJ.
// ⚠️ medido: o CNPJ NEM SEMPRE vem entre parênteses. Formas reais: "Participante: FULANO LTDA (12.345.678/0001-90)",
// "Participante: 37.809.515 WILLIAN R. CARVALHO" (raiz do CNPJ ANTES do nome, sem os 6 díg finais → não vira CNPJ
// válido), e "Participante: BZILLI CONSULTORIA LTDA" (CNPJ só na descrição). Exigir "(CNPJ)" descartava ~40% dos
// docs (serviços/saúde). Por isso o nome vai de "Participante:" até o cabeçalho, e o CNPJ é EXTRAÍDO do trecho.
// ⚠️ o rótulo "Total do Participante:" também contém "Participante:"; o (?<!do ) descarta esse participante-fantasma.
const PART = /(?<!do )Participante:\s*([\s\S]{1,180}?)\s*(?=Unidade\s*Item\b|UnidadeItem|Especifica[çc][ãa]o\s+Qtd)/gi;
const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2}|\b\d{14}\b/;   // CNPJ COMPLETO (14 díg); raiz de 8 díg não conta

// separa nome × cnpj do trecho capturado do participante
function partNomeCnpj(raw) {
  const c = String(raw).match(CNPJ_RE);
  const cnpj = c ? limpaCnpj(c[0]) : null;
  const nome = String(raw)
    .replace(/\(([^)]*)\)/g, " ")                       // solta o parentético (costuma ser o CNPJ)
    .replace(/\bCNPJ\b|\bCPF\b/gi, " ")
    .replace(CNPJ_RE, " ")
    .replace(/^\s*[\d.\-/]{2,}\s+/, "")                  // raiz de CNPJ colada ANTES do nome ("37.809.515 WILLIAN…")
    .replace(/\s+/g, " ").replace(/[.,;\-]+$/, "").trim();
  return { nome: nome.slice(0, 160) || null, cnpj };
}
// resíduo que porventura vaze para o campo marca (o lookahead do ROW pode parar em "…Participante:" e arrastar
// "Total do" antes dele). Corta no primeiro delimitador estrutural. Defense-in-depth, barato.
function limpaMarca(s) {
  let m = String(s || "")
    // corta em "Total do/Geral" e "Participante:" mesmo SEM espaço à esquerda: quando o "Marca:" vem VAZIO e colado
    // ao rodapé do participante, o `\s*` do ROW come o espaço e a captura arrasta "Total do" (medido). `(^|\s)` pega.
    .replace(/(^|\s)Total\s+(do|geral)\b[\s\S]*$/i, "")
    .replace(/(^|\s)Participante:[\s\S]*$/i, "")
    .replace(/\s+\d{1,3}\s+[A-ZÀ-Ú].*$/, "")   // próximo item que porventura tenha colado
    .trim();
  // sanidade: marca real é curta (COSCO, TUTTTI BABY, GALZERANO, SEBRAE). Em docs "sujos" onde o PDF intercalou as
  // colunas de valor NO MEIO da descrição (medido: locação de esculturas), o campo "Marca:" arrasta a descrição do
  // próximo item. Rejeita: começa por dígito, é longa demais, ou tem palavras demais → devolve "" (vira null).
  if (/^\d/.test(m) || m.length > 40 || m.split(/\s+/).length > 5) return "";
  return m;
}

// linha de item: <n> <desc lazy> <qtd (3 casas)> <unidade> <v1> <v2> [Marca: <marca>]
//  · qtd `\d[\d.]*,\d{3}(?!\d)` = 3 casas decimais (armadilha 1); valores `[\d.]+,\d{2}(?!\d)` = 2 casas.
//  · Marca opcional e lazy, fechada pelo lookahead: próximo item / "Total do Participante" / "Total Geral" / fim.
const ROW = /(\d{1,3})\s+([\s\S]*?)\s+(\d[\d.]*,\d{3})(?!\d)\s+(\S{1,14})\s+([\d.]+,\d{2})(?!\d)\s+([\d.]+,\d{2})(?!\d)(?:\s*Marca:\s*([\s\S]*?))?(?=\s+\d{1,3}\s|\s+Total\s+do\s+Participante|\s+Total\s+Geral|\s+Participante:|$)/g;

// desambigua unitário × total pela aritmética (qtd × unit ≈ total). Tolerância p/ arredondamento do PDF.
function unitTotal(qtd, a, b) {
  const bate = (u, t) => t > 0 && Math.abs(qtd * u - t) <= Math.max(0.05 * t, 0.5);
  if (bate(a, b)) return { unit: a, total: b };
  if (bate(b, a)) return { unit: b, total: a };
  return { unit: a, total: b }; // ordem observada no documento: unitário antes de total
}

// limpa a descrição: tira o rótulo "Marca:" que porventura tenha vazado e colapsa espaços; mantém a duplicata.
function limpaDesc(s) {
  return String(s || "").replace(/\s*Marca:\s*[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
}

export function parseAtaPublica(texto) {
  let t = String(texto || "").replace(/\s+/g, " ");
  // guarda de formato: precisa ser o Termo com tabela por participante (senão é DFD/parecer que só cita o termo).
  if (!/Participante:/i.test(t) || !CAB.test(t)) return [];
  // armadilha 3: rodapé/página fora ANTES de fatiar (some do meio da tabela).
  t = t.replace(RODAPE, " ").replace(PAGINA, " ").replace(/\s+/g, " ");

  // fronteiras de cada participante (o match TERMINA no cabeçalho da tabela graças ao lookahead)
  const parts = [];
  for (const m of t.matchAll(PART)) {
    const { nome, cnpj } = partNomeCnpj(m[1]);
    parts.push({ nome, cnpj, ini: m.index });
  }
  if (!parts.length) return [];
  const fimGeral = (() => { const g = t.search(/Total\s+Geral:/i); return g > 0 ? g : t.length; })();
  for (let i = 0; i < parts.length; i++) {
    parts[i].fim = i + 1 < parts.length ? parts[i + 1].ini : Math.max(parts[i].ini + 1, fimGeral);
  }

  const out = [];
  for (const p of parts) {
    const bloco0 = t.slice(p.ini, p.fim);
    const hc = CAB.exec(bloco0); CAB.lastIndex = 0;   // corta a partir do FIM do cabeçalho (evita casar CNPJ como item)
    if (!hc) continue;
    const bloco = bloco0.slice(hc.index + hc[0].length);
    ROW.lastIndex = 0;
    for (const m of bloco.matchAll(ROW)) {
      const qtd = num(m[3]);
      const { unit, total } = unitTotal(qtd, num(m[5]), num(m[6]));
      const desc = limpaDesc(m[2]);
      if (!desc) continue;
      out.push({
        codigo: parseInt(m[1], 10),   // nº do item DENTRO do termo (candidato; casar por descrição p/ o numeroItem do PNCP)
        numero: parseInt(m[1], 10),
        item: parseInt(m[1], 10),     // chave p/ casaItens() de parser_az.mjs
        lote: null,
        descricao: desc.slice(0, 500),
        unidade: m[4].trim().slice(0, 20),
        cnpjFornecedor: p.cnpj,
        fornecedor: p.nome || null,
        marca: normalizaMarca(limpaMarca(m[7])),   // "N/C"/"Própria"/vazio → null; limpaMarca tira resíduo estrutural
        modelo: null,                                  // o layout não emite modelo
        quantidade: qtd,
        valorUnitario: unit,
        valorTotal: total,
        classificado: true,   // o Termo lista apenas o adjudicatário (vencedor) de cada item
        vencedor: true,
      });
    }
  }
  return out;
}

export default parseAtaPublica;