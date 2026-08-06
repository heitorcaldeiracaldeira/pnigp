// LEITOR DO TERMO DE HOMOLOGAÇÃO MUNICIPAL — coluna de marca POSICIONAL, delimitada pelo espelho.
//
// ═══ ONDE ELE FOI ENCONTRADO ═══
// Nos processos SEM ROTA (portal_real nulo, 120.852 processos — quase todos dispensa, que por lei pode
// correr só no ERP). Dos 949 documentos desses processos que trazem "Total do Fornecedor", 593 caíam em
// "desconhecido": 88% têm a palavra Marca como COLUNA e 84% são termo, mas só 2 trazem o rótulo `Marca:`.
// Nenhum leitor existente os alcançava, porque todos procuram um rótulo.
//
// ═══ O FORMATO ═══
//   Considerando vencedor: 100951 - MARCIO HASCKEL
//   Sem lote  Item Produto Unidade Marca Qtde Valor Unitário Valor Total
//   1 PRESTAÇÃO DE SERVIÇO DE CONTROLE E LIMPEZA DA CAPELA MORTUÁRIA MES 12 R$1.235,00 R$14.820,00
//   Total do Fornecedor: R$14.820,00
//
// ═══ POR QUE AQUI A LEITURA POSICIONAL FUNCIONA, E NO CONTRATO NÃO FUNCIONOU ═══
// No contrato/ARP a marca também era posicional e o leitor teve de ser desligado: a coluna Marca/Modelo vem
// vazia com frequência, a descrição corre direto até os números, e NÃO EXISTE NO TEXTO a fronteira esquerda.
// Aqui existe, e ela vem de fora do documento: a ordem é
//     <descrição>  <UNIDADE>  <MARCA>  <QTDE>  <VALOR UNITÁRIO>  <VALOR TOTAL>
// e nós conhecemos a UNIDADE, a QUANTIDADE e o VALOR pelo PNCP. A marca é exatamente o que sobra entre a
// unidade e a quantidade. Três grandezas do espelho cercando o campo — não é palpite sobre onde a descrição
// acaba, é subtração.
// No exemplo acima a subtração devolve VAZIO ("MES" seguido direto de "12"), e vazio está certo: é serviço,
// não há marca a declarar. É a diferença entre "não li" e "não há", que este projeto trata como central.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/?a|s\/m|sem marca|prop|propri[ao]s?|marca propria|serv|servicos?|produtos?|generic[ao]s?|divers[ao]s?|obras?|engenharia|locacao|mao de obra|similar|equivalente|-{1,3}|\.*|)$/i;
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
const ehVazio = (s) => {
  const v = limpa(semAcento(s));
  if (!v) return true;
  if (v.split(/\s*[\/|]\s*/).every((p) => VAZIO.test(p))) return true;
  return v.split(" ").every((p) => VAZIO.test(p));
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const perto = (a, b, tol = 0.005) => a != null && b != null && Number(b) !== 0
  && (Math.abs(a - Number(b)) <= 0.02 || Math.abs(a - Number(b)) / Math.abs(Number(b)) <= tol);
const numBR = (s) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

/** "UNIDADE (UN)" → ["UNIDADE (UN)", "UNIDADE", "UN"], da mais específica para a mais genérica */
function variantesUnidade(u) {
  const s = limpa(u || "");
  if (!s) return [];
  const out = [s];
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    const nome = limpa(m[1]), sigla = limpa(m[2]);
    if (nome) out.push(nome);
    // a sigla só entra se tiver 2+ caracteres: uma letra solta casaria qualquer palavra da descrição
    if (sigla && sigla.length >= 2 && sigla.toUpperCase() !== nome.toUpperCase()) out.push(sigla);
  }
  return out;
}

/** o mesmo número escrito nas formas que o documento usa (2 e 4 casas, com e sem milhar) */
function grafias(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return [];
  const out = new Set();
  for (const casas of [2, 3, 4]) {
    out.add(n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
    out.add(n.toFixed(casas).replace(".", ","));
  }
  if (Number.isInteger(n)) { out.add(String(n)); out.add(n.toLocaleString("pt-BR")); }
  return [...out];
}

// A MESMA PROVA DO LEITOR DE CONTRATO. Recorte posicional e palpite ate provar o contrario: o que tem
// cheiro de frase, palavra de cabecalho de tabela ou tamanho de paragrafo nao e marca.
const PALAVRA_CABECALHO = /(marca|modelo|valor|pre[çc]o|unit[áa]rio|total|quant|qtde|qtd|descri[çc][ãa]o|especifica[çc][ãa]o|item|lote|fornecedor|c[óo]digo)/i;
const CHEIRO_DE_FRASE = /[;:]|\.\s|(de|da|do|dos|das|para|com|sem|em|por|conforme|ou)\s*$|^\s*(de|da|do|dos|das|para|com|sem|em|por|conforme|ou)/i;
function marcaPlausivel(s) {
  const v = limpa(s);
  if (!v || v.length < 2 || v.length > 40) return false;
  if (PALAVRA_CABECALHO.test(v)) return false;
  if (CHEIRO_DE_FRASE.test(v)) return false;
  if (v.split(" ").length > 4) return false;
  if (!/[A-Za-zÀ-ÿ]{2}/.test(v)) return false;
  return true;
}

/** o documento tem quadro com coluna de marca? (é a condição de entrada) */
export function temColunaMarca(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  return /Unidade\s+Marca\s+(?:Qtde|Quant)/i.test(t) || /\bMarca\b\s+Qtde\b/i.test(t)
    || (/Total do Fornecedor/i.test(t) && /\bMarca\b/i.test(t));
}

/**
 * @param texto  termo de homologação/adjudicação municipal
 * @param itens  [{numero, unidade, quantidade, valor, valor_ref}] do PNCP
 */
export function leTermoMunicipal(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  if (!temColunaMarca(t)) return { achou: false, motivo: "sem quadro com coluna de marca", itens: [], resumo };

  const out = [];
  const usados = new Set();
  for (const i of itens) {
    // acha a linha pelo VALOR UNITÁRIO — é o que identifica a linha dentro do quadro
    let pos = -1, valorUsado = null, campo = null;
    for (const [c, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (pos >= 0) break;
      for (const g of grafias(i[c])) {
        let p = -1;
        while ((p = t.indexOf(g, p + 1)) !== -1) {
          if (usados.has(p)) continue;
          pos = p; valorUsado = Number(i[c]); campo = nome; break;
        }
        if (pos >= 0) break;
      }
    }
    if (pos < 0) { resumo.linha_nao_lida++; out.push({ item_pncp: Number(i.numero), status: "linha_nao_lida", motivo: "valor do item nao aparece no quadro" }); continue; }
    usados.add(pos);

    const antes = t.slice(Math.max(0, pos - 220), pos).replace(/R\$\s*$/, "").trim();

    // ═══ A SUBTRAÇÃO ═══
    // corta a quantidade do fim, depois a unidade do começo do que sobrou. O que resta é a marca.
    let marca = null, ancora = campo, qtdOk = false, unidOk = false;
    let resto = antes;
    if (i.quantidade != null) {
      for (const g of grafias(i.quantidade)) {
        const re = new RegExp(`\\s${esc(g)}\\s*$`);
        if (re.test(resto)) { resto = resto.replace(re, ""); qtdOk = true; break; }
      }
    }
    // ═══ A UNIDADE DO PNCP É COMPOSTA; A DO DOCUMENTO NÃO ═══
    // O espelho grava "UNIDADE (UN)", "MÊS (MÊS)", "CONJUNTO (CJ)", "METROS (MTS)" — nome mais sigla — e o
    // documento escreve só "UNIDADE", "MÊS", "CONJUNTO", "METROS". Comparar a string inteira não casa nunca:
    // foi o que zerou a primeira medição deste leitor (1.348 linhas ancoradas por valor+quantidade e ZERO
    // marcas, porque a fronteira esquerda nunca era encontrada). Tenta-se a forma inteira, depois o nome,
    // depois a sigla — a que casar mais à direita é a que delimita, porque a marca vem DEPOIS da unidade.
    // ⚠️ A ÚLTIMA OCORRÊNCIA, NÃO A PRIMEIRA. A unidade aparece DENTRO da descrição com frequência
    // ("BARRA DE 6 METROS", "PEÇAS DE 1 METRO"), e casar a primeira faz todo o resto da descrição virar
    // "marca" — foi o que produziu ÍCULOS, MÁQUINAS E EQUIPAMENTO e PLETA;- ASPIRAÇÃO NA CABINE na
    // primeira medição. A coluna é a última antes da quantidade, então é a última ocorrência que delimita.
    for (const cand of variantesUnidade(i.unidade)) {
      const re = new RegExp(`\\b${esc(cand)}\\b\\s*`, "gi");
      const todas = [...resto.matchAll(re)];
      if (!todas.length) continue;
      const m = todas[todas.length - 1];
      resto = resto.slice(m.index + m[0].length); unidOk = true; break;
    }
    marca = limpa(resto);                       // o que sobra entre unidade e quantidade
    if (qtdOk) ancora += "+quantidade";
    if (unidOk) ancora += "+unidade";

    const base = { item_pncp: Number(i.numero), ancora, valor_ata: valorUsado, quantidade_ok: qtdOk, unidade_ok: unidOk };
    // sem a unidade reconhecida não há fronteira esquerda: o que sobrou é cauda de descrição, não marca.
    // É a lição do leitor de contrato — recorte sem fronteira não vira afirmação.
    if (!unidOk) { resumo.candidato++; out.push({ ...base, marca: null, status: "candidato", motivo: "unidade do PNCP nao encontrada na linha" }); continue; }
    if (ehVazio(marca)) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    // recorte posicional exige a mesma prova de plausibilidade do leitor de contrato: cauda de descricao
    // nao e marca. Marca e rotulo curto, sem pontuacao de oracao e sem palavra de cabecalho de tabela.
    if (!marcaPlausivel(marca)) {
      resumo.candidato++;
      out.push({ ...base, marca: null, status: "candidato", motivo: "recorte nao parece marca", recorte: marca.slice(0, 40) });
      continue;
    }
    // afirma só com as três grandezas do espelho cercando o campo: valor, quantidade e unidade
    const st = qtdOk ? "marca" : "candidato";
    resumo[st]++;
    out.push({ ...base, marca, status: st });
  }
  return { achou: true, itens: out, resumo };
}
