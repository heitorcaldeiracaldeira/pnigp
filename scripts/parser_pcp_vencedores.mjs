// LEITOR DO QUADRO DE VENCEDORES DO PORTAL DE COMPRAS PÚBLICAS — dirigido pelo CABEÇALHO do documento.
//
// ═══ O QUE A FORMAÇÃO DA ATA ENSINOU (05/ago/2026) ═══
// O quadro não tem um formato só. Olhando a ata INTEIRA, e não o bloco isolado, aparecem dois layouts com
// ordens de coluna diferentes — e um deles nem tem coluna de fornecedor:
//
//   A (4.214 docs · 3.878 processos):
//     Código | Produto | Fornecedor | Modelo | Marca/ Fabricante | Valor de Referência | Quantidade | Valor Total
//
//   B (2.956 docs · 2.687 processos) — AGRUPADO POR FORNECEDOR:
//     GABRIEL KUBIAKI - Tipo: ME - LC123: Sim - Documento 23.153.864/0001-49 - Endereço: ...
//     Lote | Item | Produto | Modelo | Marca/ Fabricante | Quantidade | Melhor Lance | Valor Total
//
// Em B o fornecedor é CABEÇALHO DE GRUPO, com o CNPJ escrito por extenso — e a tabela não o repete em cada
// linha. Um parser que procure o nome do vencedor dentro da linha nunca fecha a borda esquerda ali. Foi esse
// o erro que quatro rodadas de emenda não resolveram: era um parser de ordem fixa contra dois formatos.
//
// ═══ O INVARIANTE QUE SALVA ═══
// Nos dois layouts, MARCA É O ÚLTIMO CAMPO DE TEXTO ANTES DO TRIO NUMÉRICO que fecha o registro. O que muda
// é o começo da linha (Código, ou Lote+Item) e a presença do fornecedor no meio. Então: descobre-se a ordem
// LENDO O CABEÇALHO do próprio documento — ele está escrito lá —, segmenta-se pelo trio terminador, e a
// marca sai da borda direita, que é a borda confiável.
//
// ═══ TRÊS ESTADOS ═══
//   'marca'                → campo preenchido e valor conferido com o PNCP
//   'sem_marca_declarada'  → o campo EXISTE na ata e veio N/C. Serviço não tem marca: isso é informação.
//   'candidato'            → leu, mas sem valor conferido. Não se afirma.
//   'linha_nao_lida'       → não deu para recortar. Declarado, nunca inventado.

const VAZIO = /^(n\/?c|n\.?c\.?|nao|n[ãa]o informad[oa]|nao se aplica|n\/a|s\/m|sem marca|-{1,3}|\.{1,3}|)$/i;
const FIM_BLOCO = /(Declara[çc][õo]es Obrigat[óo]rias|Documentos Anexados|Intenç[õo]es de Recurso)/i;

const normLeve = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9 ,.%()\/-]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

function valorDoTexto(s) {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,4})$/);
  if (m) return Number(m[1].replace(/\./g, "") + "." + m[2].slice(0, 2));
  const d = t.replace(/\D/g, "");
  return d.length < 3 ? null : Number(d.slice(0, -2) + "." + d.slice(-2));
}
function bateValor(txt, valor) {
  const a = valorDoTexto(txt), b = Number(valor);
  if (a == null || !Number.isFinite(b) || b === 0) return false;
  return Math.abs(a - b) <= 0.02 || Math.abs(a - b) / b <= 0.001;
}

// O trio que FECHA cada registro. Duas coisas aprendidas medindo:
//  · sem âncora de fim de string — sobra texto depois, porque o corte é no fim do trio anterior;
//  · CASAS DECIMAIS LIVRES nas três posições. A ordem muda com o layout: em A é
//    <Valor de Referência 2 casas> <Quantidade 4 casas> <Valor Total 2 casas>; em B é
//    <Quantidade 4 casas> <Melhor Lance 2> <Valor Total 2>. Exigir 2 casas na primeira posição fazia o
//    layout B não casar NUNCA — 14 documentos da amostra com zero de tudo, o que parecia falha do parser
//    e era só o terminador escrito para o layout errado.
// Entre os três campos NÃO há só espaço: no layout B vem a UNIDADE DE MEDIDA e o símbolo da moeda.
//   "... PAVIMENTACAO 1,0000 UN 230.000,00 230.000,00"
//   "... N/C N/C 1,00 UND R 227.850,00 R R 227.850,00"      ← o "R$" perde o cifrão na extração do PDF
//   "... N/C N/C 15.517 ESTUDANTE R 0,01 R R 155,17"        ← e a quantidade pode vir sem casa decimal
// Exigir adjacência fazia o layout B não casar nunca. O separador aceita, entre um número e outro, até duas
// palavras curtas (unidade, "R", "R$") e o percentual entre parênteses.
const SEP = "(?:\\s+(?:R\\$?|[A-Z]{1,12}|\\([\\d.,]+\\s*%\\))){0,2}\\s+";
const NUM = "[\\d.]+(?:,\\d{1,4})?";
const RE_TRIO = new RegExp(`(${NUM},\\d{1,4}|${NUM})${SEP}(${NUM})${SEP}(${NUM},\\d{1,4})`);

/**
 * LÉXICO DAS MARCAS JÁ CONHECIDAS — a base ensinando o parser.
 * Sai de item_marca_sc (o cru dos outros extratores) e da tabela conferida. Filtra o que não é marca:
 * texto longo demais (é descrição), só dígitos (é código), e os rótulos de ausência (PROPRIO, N/C, SEM MARCA)
 * — estes últimos têm tratamento próprio como 'sem_marca_declarada' e não podem virar marca válida.
 */
export async function montaLexicoMarcas(db, { minOcorrencias = 2 } = {}) {
  const { rows } = await db.query(`
    SELECT upper(trim(marca)) m, count(*) n FROM (
      SELECT marca FROM item_marca_sc WHERE marca IS NOT NULL
      UNION ALL
      SELECT marca FROM app.item_marca_conferida_sc WHERE marca IS NOT NULL
    ) x GROUP BY 1 HAVING count(*) >= $1`, [minOcorrencias]);
  const RUIM = /^(PROPRIO|PROPRIA|PROPRIA\/PROPRIO|N\/?C|NAO|NAO SE APLICA|SEM MARCA|S\/M|N\/A|DIVERSOS|VARIOS|MARCA PROPRIA|GENERICO|NACIONAL)$/i;
  const lex = new Set();
  for (const r of rows) {
    const m = String(r.m || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 .\/-]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
    if (m.length < 2 || m.length > 40) continue;
    if (/^[\d.,\/-]+$/.test(m)) continue;
    if (RUIM.test(m)) continue;
    lex.add(m);
  }
  return lex;
}

/** o bloco do quadro dentro da ata */
export function achaBlocoVencedores(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const i = t.search(/\bVencedores\b/i);
  if (i < 0) return null;
  const resto = t.slice(i);
  if (!/Marca\s*\/\s*Fabricante/i.test(resto.slice(0, 1200))) return null;
  const f = resto.slice(1).search(FIM_BLOCO);
  return f > 0 ? resto.slice(0, f + 1) : resto;
}

/** LÊ O CABEÇALHO e devolve a ordem declarada dos campos. É o documento que diz, não o código que supõe. */
export function detectaLayout(bloco) {
  const b = normLeve(bloco).slice(0, 1500);
  if (/CODIGO\s+PRODUTO\s+FORNECEDOR\s+MODELO\s+MARCA/.test(b))
    return { id: "A", agrupado: false, campos: ["codigo", "produto", "fornecedor", "modelo", "marca"] };
  if (/LOTE\s+ITEM\s+PRODUTO\s+MODELO\s+MARCA/.test(b))
    return { id: "B", agrupado: true, campos: ["lote", "item", "produto", "modelo", "marca"] };
  if (/ITEM\s+PRODUTO\s+MODELO\s+MARCA/.test(b))
    return { id: "C", agrupado: true, campos: ["item", "produto", "modelo", "marca"] };
  return { id: "D", agrupado: false, campos: null };
}

/** grupos por fornecedor: "NOME - Tipo: X - LC123: Y - Documento 00.000.000/0000-00 - ..." */
function achaGrupos(bloco) {
  const re = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^-]{3,90}?)\s*-\s*Tipo:\s*[^-]{1,30}-[^-]*?Documento\s+([\d./-]{14,20})/gi;
  const gs = []; let m;
  while ((m = re.exec(bloco)) !== null) gs.push({ nome: m[1].trim(), cnpj: soDigitos(m[2]), ini: m.index });
  return gs;
}

/**
 * @param texto            texto da ata
 * @param itensDoProcesso  [{numero, valor, fornecedor, cnpj}] — lista oficial (itens_sc + item_resultado_sc)
 */
export function leVencedoresPcp(texto, itensDoProcesso = [], opts = {}) {
  const lexico = opts.lexico || null;   // Set de marcas conhecidas, já normalizadas (ver montaLexicoMarcas)
  const bloco = achaBlocoVencedores(texto);
  const resumo = { marca: 0, candidato: 0, sem_marca_declarada: 0, linha_nao_lida: 0, fora_do_processo: 0 };
  if (!bloco) return { achou_bloco: false, layout: null, itens: [], resumo };

  const layout = detectaLayout(bloco);
  const porItem = new Map();
  for (const v of itensDoProcesso) if (v && v.numero != null) porItem.set(Number(v.numero), v);
  const porCnpj = new Map();
  for (const v of itensDoProcesso) if (v && v.cnpj) porCnpj.set(soDigitos(v.cnpj), v);

  const corpo = normLeve(bloco);
  const grupos = layout.agrupado ? achaGrupos(bloco) : [];
  const cnpjEm = (pos) => {                      // de que grupo esta posição faz parte
    let atual = null;
    for (const g of grupos) { if (g.ini <= pos) atual = g; else break; }
    return atual;
  };

  // segmenta pelo TERMINADOR: cada trio numérico fecha um registro
  const segs = []; const re = new RegExp(RE_TRIO.source, "g");
  let de = 0, m;
  while ((m = re.exec(corpo)) !== null) {
    segs.push({ texto: corpo.slice(de, m.index).trim(), trio: m, pos: m.index });
    de = m.index + m[0].length;
    if (segs.length > 3000) break;
  }

  const itens = [];
  for (const s of segs) {
    // O CÓDIGO NÃO ABRE O SEGMENTO. O corte é feito no FIM do trio anterior, então o segmento começa com o
    // resto da linha passada (endereço do fornecedor, sobra de descrição) e só depois vem o código do item.
    // Procura-se então TODO candidato "número seguido de texto" dentro do segmento e fica-se com o ÚLTIMO que
    // seja um código REAL do processo — o último porque é o que está colado no início da linha deste registro.
    let codigo = null, posCod = -1;
    for (const c of s.texto.matchAll(/\b0*(\d{1,5})\s+(?=[A-Z])/g)) {
      const n = Number(c[1]);
      if (porItem.has(n)) { codigo = n; posCod = c.index; }
    }
    if (codigo == null) { resumo.fora_do_processo++; continue; }
    const oficial = porItem.get(codigo);
    // o registro é o que vem DEPOIS do código; o antes é sobra da linha anterior
    s.texto = s.texto.slice(posCod).trim();

    // FORNECEDOR: coluna na linha (A) ou cabeçalho do grupo (B) — no B vem com CNPJ, que é âncora forte
    const g = layout.agrupado ? cnpjEm(s.pos) : null;
    const fornecedor = g ? g.nome : (oficial.fornecedor || null);
    const cnpj = g ? g.cnpj : (oficial.cnpj ? soDigitos(oficial.cnpj) : null);

    // ═══ BORDA ESQUERDA: cada layout tem a sua, e é o que define onde Modelo+Marca começam ═══
    // A: o FORNECEDOR está na linha, entre Produto e Modelo. Sabendo quem venceu (item_resultado_sc), o nome
    //    dele é a fronteira: o que vem depois é Modelo + Marca. Foi assim que saíram FIAT/ARGO TREKKING e
    //    3M/5N11 corretos; perdi isso ao reescrever pegando "último token", e as marcas viraram LTDA e OIL.
    // B: não há fornecedor na linha (ele é cabeçalho do grupo). A fronteira é a DESCRIÇÃO DO PRODUTO, que o
    //    PNCP tem em itens_sc.descricao — consome-se o produto e sobra Modelo + Marca.
    let miolo = s.texto;
    let bordaEsq = "nenhuma";
    const cortaApos = (alvo) => {
      if (!alvo) return false;
      // a descrição do PNCP vem prefixada de "Lote N - " nos processos por lote, enquanto a ata escreve
      // "0001 LOTE 01 0001 <descrição>". O prefixo derrubava a comparação logo no primeiro caractere.
      const a = normLeve(String(alvo).replace(/^\s*lote\s+\d+\s*[-–]\s*/i, ""));
      for (const tam of [a.length, 60, 40, 28, 20]) {
        const pref = a.slice(0, Math.min(tam, a.length));
        if (pref.length < 12) break;
        const p = miolo.indexOf(pref);
        if (p >= 0) { miolo = miolo.slice(p + pref.length).trim(); return true; }
      }
      return false;
    };
    // CASCATA DE CANDIDATOS. Medido em 05/ago/2026: a descrição ENRIQUECIDA sozinha rende METADE da descrição
    // literal da API (14,2% contra 41,8%) — e não é falta de dado, a cobertura dela é de 96% dos itens. O
    // motivo é de propósito: o enriquecimento REESCREVE a descrição a partir do TR e do edital, ficando mais
    // completo e mais correto, porém DIFERENTE do que o portal imprimiu na ata. Para casar com a ata vale o
    // literal. Mas a enriquecida ainda serve de segunda tentativa, onde o literal não casar.
    const candidatos = layout.id === "A"
      ? [oficial.fornecedor, oficial.fornecedor_alt]
      : [oficial.descricao, oficial.descricao_enriquecida];
    for (const c of candidatos) {
      if (!c) continue;
      if (cortaApos(c)) { bordaEsq = layout.id === "A" ? "fornecedor" : "produto"; break; }
    }
    // sem borda esquerda, o miolo ainda contém produto/fornecedor — não dá para afirmar campo
    if (bordaEsq === "nenhuma") {
      resumo.linha_nao_lida++;
      itens.push({ codigo, status: "linha_nao_lida", motivo: "borda esquerda nao encontrada", layout: layout.id });
      continue;
    }

    // MARCA: último campo de texto antes do trio — o invariante dos dois layouts
    const toks = miolo.split(" ").filter(Boolean);
    if (toks.length < 1) { resumo.linha_nao_lida++; continue; }
    const cauda = toks.slice(-4).join(" ");
    if (toks.slice(-2).every((t) => /^(N|C|NC|NA|N\/C)$/i.test(t)) || VAZIO.test(toks[toks.length - 1])) {
      resumo.sem_marca_declarada++;
      itens.push({ codigo, fornecedor, cnpj, marca: null, status: "sem_marca_declarada", layout: layout.id });
      continue;
    }
    // ═══ MODELO x MARCA: pelo LÉXICO, não por contagem de tokens ═══
    // Com a borda esquerda fechada sobram poucos tokens, mas dividi-los ao meio erra sempre que a marca tem
    // mais de uma palavra: saía "/ TCL" em vez de TCL, e "PEFC24B2NCCB ELGIN" com o código do modelo colado.
    // A base já sabe o que é marca — são 240 mil linhas extraídas por outros extratores. Testa-se então o
    // SUFIXO mais longo que exista no léxico: se "REI DA MESA" está lá, a marca são as três palavras, e o
    // que sobra à esquerda é modelo. É reconhecimento, não corte cego.
    // Sem léxico, cai no meio-a-meio de antes — o parser continua funcionando, só com menos precisão.
    let marca = null, modelo = null, viaLexico = false;
    if (lexico && lexico.size) {
      for (let k = Math.min(4, toks.length); k >= 1; k--) {
        const cand = toks.slice(-k).join(" ");
        if (lexico.has(cand)) { marca = cand; modelo = toks.slice(0, -k).join(" ") || null; viaLexico = true; break; }
      }
    }
    if (!marca) {
      const meio = Math.ceil(toks.length / 2);
      marca = toks.slice(meio).join(" ") || toks[toks.length - 1];
      modelo = toks.slice(0, meio).join(" ") || null;
    }
    if (!marca || marca.length > 40 || /^[\d.,]+$/.test(marca)) {
      resumo.linha_nao_lida++;
      itens.push({ codigo, status: "linha_nao_lida", motivo: "cauda improvavel: " + cauda.slice(0, 50), layout: layout.id });
      continue;
    }
    // ÂNCORA DE VALOR: qual das três posições é o valor depende do layout, então testa-se as três.
    // Não é frouxidão: o valor do PNCP é um número específico, e bater com qualquer uma das colunas do
    // registro já prova que o recorte pegou a linha certa.
    const confere = oficial.valor != null &&
      [s.trio[1], s.trio[2], s.trio[3]].some((v) => bateValor(v, oficial.valor));
    // ÂNCORA DE CNPJ: no layout B, o grupo diz de quem é a linha — confere com o vencedor oficial
    const cnpjBate = cnpj && oficial.cnpj && cnpj === soDigitos(oficial.cnpj);
    const st = (confere || cnpjBate) ? "marca" : "candidato";
    resumo[st]++;
    itens.push({ codigo, fornecedor, cnpj, modelo, marca, status: st, layout: layout.id, via_lexico: viaLexico,
                 ancora: [confere ? "valor" : null, cnpjBate ? "cnpj" : null].filter(Boolean).join("+") || "nenhuma" });
  }
  return { achou_bloco: true, layout: layout.id, grupos: grupos.length, itens, resumo };
}
