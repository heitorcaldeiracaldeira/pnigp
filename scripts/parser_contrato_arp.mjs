// LEITOR DE CONTRATO E ATA DE REGISTRO DE PREÇOS — ancorado em valor + quantidade, dirigido pelo ITEM.
//
// ═══ O QUE ESTE DOCUMENTO É, E O QUE ELE NÃO É ═══
// Contrato e ARP são documentos do ÓRGÃO, não do portal — como o termo de homologação. Um leitor aqui
// serve a qualquer portal. Foram encontrados varrendo os documentos que o roteador não reconhecia:
// dos 945 documentos "desconhecido com marca" dos processos da BLL, 529 (56%) eram contrato ou ARP.
//
// ⚠️ ELE É DERIVADA, NÃO ESPELHO. Pela lei do andar 1 x andar 2: a ata de sessão registra o que foi
// homologado; o contrato registra o que foi PACTUADO, e os dois podem divergir por reajuste, repactuação
// ou termo aditivo. Por isso o que sai daqui vem marcado com fonte "contrato" — não se mistura com a
// leitura da ata, e quando as duas existirem a ata é que manda.
//
// ⚠️ PRORROGAÇÃO REPETE O MESMO ITEM. Boa parte desses documentos é "PRORROGAÇÃO DE ARP", que reafirma o
// preço registrado. O mesmo item reaparece a cada prorrogação, então quem consome PRECISA deduplicar por
// (processo, item) — senão a mesma marca é contada várias vezes e o número engorda sozinho.
//
// ═══ EXIGE QUADRO. Medido: dos 174 contratos/ARPs tipados que contêm a palavra "marca", 122 a trazem
// apenas em cláusula de obrigação — "apresentar relação dos materiais usados na execução dos serviços,
// marca/modelo e quantitativo, conforme Anexo A do Edital". Isso não é a marca de nada; é uma exigência
// futura. Sem cabeçalho de quadro com coluna de marca, este leitor recusa o documento.
//
// ═══ AS DUAS FORMAS DA LINHA ═══
//  A) POSICIONAL — a marca fica entre a descrição e os números, sem rótulo:
//     Item/Lote Descrição Marca/Modelo Qtde. Valor Unitário (R$) Valor Total (R$)
//     21 Motoniveladora nova, última série, zero hora... JOHN DEERE 620G 01 1.190.000,00 1.190.000,00
//  B) ROTULADA — a linha traz o rótulo explícito:
//     Item Qtdade Unid. Descrição Marca/Modelo Valor Unit. Valor Total
//     1 5.497,749 CM/CL SERVIÇOS DE PUBLICAÇÃO LEGAL... Marca: Serviço R$ 19,99 R$ 109.900,00
//
// A forma A não tem delimitador à esquerda: onde acaba a descrição e começa a marca é ambíguo no texto.
// O que desfaz a ambiguidade não está no documento, está no espelho — o leitor é dirigido pelo ITEM:
// procura no quadro o VALOR UNITÁRIO daquele item, e a marca é o que vem imediatamente antes da
// quantidade. Quando a quantidade lida bate com a do PNCP, a linha está provada e a marca é afirmada;
// quando não bate, sai como candidato. Duas grandezas independentes conferindo a mesma linha.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/?a|s\/m|sem marca|prop|propri[ao]s?|marca propria|serv|servicos?|produtos?|generic[ao]s?|divers[ao]s?|obra s?|engenharia|locacao|mao de obra|equivalente|similar|conforme edital|conforme tr|referencia|-{1,3}|\.*|)$/i;
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
// vazio se TODAS as partes forem vazias — separadas por barra ("NÃO SE APLICA/SERVIÇOS") ou por espaço
// ("PRÓPRIA PROPRIO", que é o campo marca e o campo modelo, ambos em branco, colados pela extração)
const ehVazio = (s) => {
  const v = limpa(semAcento(s));
  if (!v) return true;
  const porBarra = v.split(/\s*[\/|]\s*/);
  if (porBarra.every((p) => VAZIO.test(p))) return true;
  return v.split(" ").every((p) => VAZIO.test(p));
};
const num = (s) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

// ═══ AS TRÊS TRAVAS DA LEITURA POSICIONAL ═══
// Sem elas a primeira medição devolveu UN, UND, KG, UNIDADE, PAR como "marca" — a coluna de unidade de
// medida sendo lida no lugar da coluna de marca — além de "MODELO VALOR GUILHERME BERGER" (a linha de
// cabeçalho) e "A PARTIR DA DATA DE ENTREGA. EMB" (fim da descrição). É exatamente a contaminação que
// obrigou a apagar a base de marca anterior, e reproduzi-la aqui seria repetir o mesmo erro conhecido.
// Como o recorte posicional é um palpite sobre onde a descrição acaba, a defesa não pode ser o palpite:
// tem de ser recusar tudo que comprovadamente NÃO é marca.

// 1. unidade de medida nunca é marca
const UNIDADE_MEDIDA = /^(un|und|unid|unidade|unidades|pc|pç|pcs|peca|peça|pecas|peças|cx|caixa|caixas|kg|kgs|g|gr|grama|gramas|l|lt|lts|litro|litros|ml|mg|mcg|m|m2|m3|mt|mts|metro|metros|cm|mm|km|par|pares|kit|kits|fardo|fardos|pacote|pacotes|pct|bombona|rolo|rolos|resma|resmas|frasco|frascos|galao|galão|saco|sacos|sc|dz|duzia|dúzia|hr|hrs|h|hora|horas|dia|dias|mes|mês|meses|ano|anos|serv|servico|serviço|ton|tonelada|amp|ampola|comp|comprimido|env|envelope|tubo|lata|latas|balde|bisnaga|barra|jogo|conjunto|cj|vidro|pote|bloco|folha|cento|milheiro|diaria|diária|visita|sessao|sessão|km\/l|cm3)$/i;

// 2. palavra de cabeçalho de tabela nunca é marca — se apareceu, o recorte caiu na linha de título
const PALAVRA_CABECALHO = /\b(marca|modelo|valor|pre[çc]o|unit[áa]rio|total|quant|qtde|qtd|unidade de medida|descri[çc][ãa]o|especifica[çc][ãa]o|item|lote|c[óo]digo)\b/i;

// 3. o que sobrou de uma frase não é marca. Marca é rótulo curto, não oração: sem ponto final no meio,
//    sem preposição solta, poucas palavras.
const CHEIRO_DE_FRASE = /[.;:]|\b(de|da|do|dos|das|para|com|sem|em|por|conforme|ou|e)\b\s*$|^\s*\b(de|da|do|dos|das|para|com|sem|em|por|conforme|ou|e)\b/i;

/** tira unidades de medida grudadas nas pontas: "PADRÃO CONCESSIONÁRIA UND" -> "PADRÃO CONCESSIONÁRIA" */
function tiraUnidades(s) {
  let toks = limpa(s).split(" ");
  while (toks.length && UNIDADE_MEDIDA.test(semAcento(toks[toks.length - 1]))) toks.pop();
  while (toks.length && UNIDADE_MEDIDA.test(semAcento(toks[0]))) toks.shift();
  return toks.join(" ");
}

function marcaPlausivel(s) {
  const v = limpa(s);
  if (!v || v.length < 2 || v.length > 40) return false;
  if (PALAVRA_CABECALHO.test(v)) return false;
  if (CHEIRO_DE_FRASE.test(v)) return false;
  if (v.split(" ").length > 4) return false;          // "JOHN DEERE 620G" cabe; oração não
  if (!/[A-Za-zÀ-ÿ]{2}/.test(v)) return false;        // precisa ter letras de verdade
  // nenhum pedaço pode ser unidade de medida: "KV METRO", "MM CENTO" e "O MT" passavam por não estarem
  // sozinhos, e são duas colunas coladas, não uma marca de duas palavras
  if (v.split(" ").some((tk) => UNIDADE_MEDIDA.test(semAcento(tk)))) return false;
  return true;
}
const perto = (a, b, tol = 0.005) => a != null && b != null && Number(b) !== 0 && (Math.abs(a - Number(b)) <= 0.02 || Math.abs(a - Number(b)) / Math.abs(Number(b)) <= tol);

// o cabeçalho do quadro: precisa nomear a marca E um preço. É a prova de que existe tabela de itens.
const RE_CABECALHO = /M\s?a\s?r\s?c\s?a\s*\/?\s*(?:M\s?o\s?d\s?e\s?l\s?o)?[^.]{0,60}?(?:Valor|Pre[çc]o|Qtde|Quant)|(?:Valor|Pre[çc]o|Qtde|Quant)[^.]{0,60}?M\s?a\s?r\s?c\s?a\s*\/?\s*M\s?o\s?d\s?e\s?l\s?o/i;
const RE_MARCA_ROTULO = /M\s?a\s?r\s?c\s?a\s*\/?\s*(?:M\s?o\s?d\s?e\s?l\s?o)?\s*[:\/]\s*/i;

/** o documento tem quadro de itens com coluna de marca? */
export function temQuadroDeItens(texto) {
  return RE_CABECALHO.test(String(texto || "").replace(/\s+/g, " "));
}

/** formata um número no padrão brasileiro, para procurá-lo no texto do quadro */
function comoTexto(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return [];
  const br = (x, casas) => x.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return [...new Set([br(n, 2), br(n, 3), br(n, 4)])];
}

/**
 * @param texto  contrato ou ata de registro de preços
 * @param itens  [{numero, quantidade, valor, valor_ref, unidade}] do PNCP
 */
export function leContratoArp(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  if (!RE_CABECALHO.test(t)) return { achou: false, motivo: "sem quadro de itens com coluna de marca", itens: [], resumo };

  const out = [];
  const usados = new Set();

  for (const i of itens) {
    // procura a linha pelo VALOR do item — é o que identifica a linha dentro do quadro
    let achouLinha = null, valorUsado = null, campoUsado = null;
    for (const [campo, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (achouLinha) break;
      for (const alvo of comoTexto(i[campo])) {
        let pos = -1;
        while ((pos = t.indexOf(alvo, pos + 1)) !== -1) {
          if (usados.has(pos)) continue;
          achouLinha = pos; valorUsado = Number(i[campo]); campoUsado = nome; break;
        }
        if (achouLinha) break;
      }
    }
    if (achouLinha == null) { resumo.linha_nao_lida++; out.push({ item_pncp: Number(i.numero), status: "linha_nao_lida", motivo: "valor do item nao aparece no quadro" }); continue; }
    usados.add(achouLinha);

    const antes = t.slice(Math.max(0, achouLinha - 200), achouLinha);

    // FORMA B: rótulo explícito. É o caso fácil e o mais confiável.
    let marca = null, forma = null, qtdLida = null;
    const rot = [...antes.matchAll(new RegExp(RE_MARCA_ROTULO.source, "gi"))].pop();
    if (rot) {
      marca = limpa(antes.slice(rot.index + rot[0].length).replace(/R\$\s*$/, "")).slice(0, 40);
      forma = "rotulada";
    } else {
      // FORMA A: posicional. A marca é o que antecede a QUANTIDADE, que antecede o valor.
      // "...garantia mínima de 12 meses JOHN DEERE 620G 01 " -> qtd=01, marca="JOHN DEERE 620G"
      const m = antes.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9®™°.\-\/+ ]{1,38}?)\s+(\d{1,7}(?:[.,]\d{1,4})?)\s*(?:R\$\s*)?$/);
      if (m) { marca = limpa(m[1]); qtdLida = num(m[2]); forma = "posicional"; }
    }
    if (marca == null) { resumo.linha_nao_lida++; out.push({ item_pncp: Number(i.numero), status: "linha_nao_lida", motivo: "linha do quadro sem marca legivel" }); continue; }

    // ═══ A SEGUNDA GRANDEZA: A QUANTIDADE CONFERE A LINHA ═══
    // Na forma posicional o recorte da marca é um palpite sobre onde a descrição acaba. A quantidade lida
    // logo antes do valor é independente do valor, e vem do mesmo espelho — se as duas batem, a linha
    // está provada. Sem isso, o leitor estaria afirmando com base num único número.
    const qtdBate = qtdLida != null && i.quantidade != null && perto(qtdLida, i.quantidade, 0.01);
    const ancora = forma === "rotulada" ? `${campoUsado}+rotulo`
      : qtdBate ? `${campoUsado}+quantidade` : campoUsado;

    const base = { item_pncp: Number(i.numero), ancora, valor_ata: valorUsado, forma, quantidade_lida: qtdLida, fonte: "contrato" };
    marca = tiraUnidades(marca);
    if (ehVazio(marca)) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    // AS TRAVAS VALEM PARA AS DUAS FORMAS. Eu as aplicava só à posicional, e o resultado foi
    // "MODELO VALOR GUILHERME BERGER" aparecendo 53 vezes: o regex do rótulo casa a BARRA do próprio
    // cabeçalho ("Marca / Modelo Valor Unitário") e captura a linha de título inteira. Ter rótulo não
    // prova que se leu um dado — prova só que se achou a palavra.
    if (!marcaPlausivel(marca)) {
      resumo.linha_nao_lida++;
      out.push({ ...base, marca: null, status: "linha_nao_lida", motivo: "recorte posicional nao parece marca", recorte: marca.slice(0, 40) });
      continue;
    }
    // ═══ A FORMA POSICIONAL NUNCA AFIRMA ═══
    // Medido depois das travas: das 62 marcas que sobraram da leitura posicional, a maioria continuou sendo
    // DESCRIÇÃO DE PRODUTO — "BOLO RECHEADO COM FRUTAS", "CARNE SUINA LOMBO FATIADO", "CHUCHU",
    // "REFRIGERADA", "PADRÃO CONCESSIONÁRIA". Só um punhado era marca real (FLEISCHMANN, INCOTRIL).
    // A razão é estrutural e nenhuma trava resolve: nesses quadros a coluna Marca/Modelo vem VAZIA com
    // frequência, e a descrição corre direto até os números. Não existe no texto a fronteira que o recorte
    // precisa. Casar valor e quantidade prova que a LINHA é aquela — não prova onde a marca começa.
    // Então a forma posicional sai sempre como candidato, para revisão, e nunca entra na base como marca.
    const st = forma === "rotulada" ? "marca" : "candidato";
    resumo[st]++;
    out.push({ ...base, marca, status: st });
  }
  return { achou: true, itens: out, resumo };
}
