// LEITOR DE TERMO DE HOMOLOGAÇÃO / ADJUDICAÇÃO / JULGAMENTO — ancorado em CNPJ + valor.
//
// ═══ POR QUE ESTE LEITOR NÃO SE CHAMA "COMPRAS.GOV" ═══
// Lendo na íntegra todos os documentos dos processos cujo portal_real é Compras.gov, o que se vê é que o
// Compras.gov NÃO publica ata de resultado no PNCP. Dos documentos com um rótulo `Marca:` de verdade, a
// maioria é EDITAL e TERMO DE REFERÊNCIA — onde a marca é referência de especificação e não a do vencedor
// (e o art. 41 da Lei 14.133 veda justamente a indicação de marca ali). Lê-los envenenaria a base.
// O que carrega a marca do vencedor são ~107 documentos com nome próprio: "Relatório - Termo de homologação",
// "Termo de julgamento e habilitação", "Ata de Julgamento", "Termo de Homologação".
// E esses documentos NÃO são do portal: são gerados pelo ERP do próprio órgão (o de Lages é Betha clássico,
// "TERMO DE HOMOLOGAÇÃO E ADJUDICAÇÃO DE PROCESSO LICITATÓRIO ... Nr. Proce o") ou digitados em Word pela
// Câmara. Pela lei local x modalidade x gerador, aqui o gerador é o ÓRGÃO. Por isso o leitor é do TIPO DE
// DOCUMENTO, não do portal — e serve a qualquer portal cujo órgão anexe o seu próprio termo.
//
// ═══ OS TRÊS LAYOUTS, lidos por inteiro ═══
//   A) quadro com colunas (Caçador):  "18214 - FGS COMERCIAL LTDA (39.988.022/0001-47)" e depois
//      "UN MARCA: EXTANG MODELO/VER SÃO: ABC 100 115,0 0 11.500, 00"
//   B) termo do ERP (Lages):          "VIA PAVIMENTACOES E SERVICOS LTDA  1 - <objeto> - Marca: PROPRIA
//      UN 1,000 353.000,0000 R$ 353.000,00"
//   C) termo em texto (Câmara de Itajaí): "02 100 Un. CADEIRA DIRETOR ... Marca: Plaxmetal Modelo: Brizza
//      R$ 1.135,00 R$ 113.500,00"   e a variante "MARCA: FONT LIFE R$ 9,66 R$ 14.490,00"
//
// ═══ DOIS DEFEITOS DE EXTRAÇÃO QUE O LEITOR TEM DE ABSORVER ═══
// 1. O "s" MINÚSCULO VIRA ESPAÇO. "Proce o" é "Processo", "E tado" é "Estado", "empre a" é "empresa" —
//    a fonte do PDF mapeia o glifo do s minúsculo para espaço. O S MAIÚSCULO sobrevive, e marca costuma vir
//    em maiúscula, então o campo que nos interessa escapa. Fica registrado porque afeta qualquer leitura de
//    texto corrido desses documentos, não só a marca.
// 2. A QUEBRA DE COLUNA PARTE O TOKEN AO MEIO. "MARC A:", "115,0 0", "11.500, 00", "FORÇ A" — o PDF quebra
//    a célula e a extração insere espaço dentro da palavra e dentro do número. Por isso tanto o rótulo
//    quanto o número são casados com espaço tolerado no meio.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/a|s\/m|sem marca|propri[ao]s?|marca propria|servicos?|produtos?|generic[ao]s?|divers[ao]s?|fracassado|deserto|-{1,3}|\.*|)$/i;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
const ehVazio = (s) => VAZIO.test(limpa(semAcento(s)));

// número tolerante à quebra de coluna: "115,0 0" e "11.500, 00" são um número só
const RE_DINHEIRO = /\d{1,3}(?:\.\s?\d{3})*\s?,\s?\d\s?\d(?:\s?\d\s?\d)?/g;
const valorDe = (s) => { const v = Number(String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
const perto = (a, b) => a != null && b != null && Number(b) !== 0 && (Math.abs(a - Number(b)) <= 0.02 || Math.abs(a - Number(b)) / Math.abs(Number(b)) <= 0.005);

// rótulos tolerantes à quebra de coluna: "MARC A:", "FABRICA NTE:" e "M ARCA :" contam
const RE_MARCA = /M\s?A\s?R\s?C\s?A\s?S?\s*[:\/]/gi;
const RE_FABRIC = /F\s?A\s?B\s?R\s?I\s?C\s?A\s?N\s?T\s?E\s*[:\/]/i;
// o que ENCERRA o valor de um campo: o rótulo seguinte, o R$, um número, ou fim da janela
const RE_FIM_CAMPO = /\s*(?:M\s?O\s?D\s?E\s?L\s?O|F\s?A\s?B\s?R\s?I\s?C\s?A\s?N\s?T\s?E|M\s?A\s?R\s?C\s?A|VERS[ÃA]O|R\$|\d)/i;

// ═══ MARCA E FABRICANTE SÃO CAMPOS DIFERENTES, E O ÓRGÃO ESCOLHE QUAL PREENCHE ═══
// Medido: nesses termos o campo `Marca:` vem VAZIO e a marca real está em `Fabricante:` —
// "Marca: Fabricante: BECKMAN COULTER Modelo/Versão: ...". Fundir os dois num campo só apagaria a
// diferença entre o que o documento diz e o que nós inferimos. Cada um é lido no seu nome, e o resultado
// declara de qual campo veio (`origem`), para que o produto decida — nós não decidimos por ele.
function leCampo(depois, reFim) {
  const corte = depois.search(reFim);
  // corte === 0 significa CAMPO VAZIO (o rótulo seguinte vem colado), não "não encontrei". Tratar zero como
  // ausência era o defeito: o leitor engolia "FABRICANTE: BECKMAN COULTER MODELO/VERSÃO:" inteiro como marca.
  const bruto = corte >= 0 ? depois.slice(0, corte) : depois.slice(0, 40);
  let v = limpa(bruto).slice(0, 40);
  v = limpa(v.replace(UNIDADES, ""));
  return limpa(v.replace(/^[\s/,;.:-]+/, "").replace(/[\s/,;.:-]+$/, ""));
}
const UNIDADES = /\b(un|und|unid|unidade|pc|pç|peca|peça|cx|caixa|kg|g|l|lt|litro|ml|m|m2|m3|mt|metro|par|kit|fardo|pacote|pct|bombona|rolo|resma|frasco|galao|saco|dz|duzia|hr|hrs|hora|serv|servico|km|ton|amp|comp|env)\b\.?\s*$/i;

const dinheiros = (s) => { const o = []; for (const m of String(s || "").matchAll(RE_DINHEIRO)) { const v = valorDe(m[0]); if (v != null && v > 0) o.push(v); } return o; };

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// LEITOR B — "Relatório - Termo de julgamento e habilitação" (Compras.gov)
//
// Este documento NÃO é uma lista de vencedores: é o julgamento inteiro, com TODAS as propostas de TODOS os
// licitantes, cada uma com a sua própria Marca/Fabricante. Medido: 7.572 rótulos de marca para 3.527 itens
// no PNCP — a maioria das marcas é de PERDEDOR. Um leitor que varre rótulos de marca em ordem atribui a
// marca do perdedor ao item, que é exatamente o erro que a regra "a marca está na linha do vencedor" existe
// para impedir.
//
// A linha da proposta tem esta forma (o "s" minúsculo cai na extração, daí "Propo ta" e "ver ão"):
//   21.642.402/0001-60 - TITA UNIFORMES LTDA  Porte MeEpp/Equiparada: Sim (D) R$ 20,0000
//   Fornecedor habilitado  Marca/Fabricante: PRÓPRIA  Modelo/ver ão: PRÓPRIA  Valor propo ta: R$ 48,0000
//
// A saída é não tentar deduzir o vencedor do texto: NÓS JÁ SABEMOS QUEM GANHOU, pelo espelho do PNCP.
// O leitor é dirigido pelo ITEM: para cada item, procura a linha cujo CNPJ é o do vencedor e cujo lance
// bate com o valor homologado. Dupla âncora por construção, e o perdedor fica de fora sem precisar de
// heurística nenhuma.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// A linha começa no CNPJ e vai até o próximo CNPJ. Exigir um rótulo fixo depois do nome (era `Porte`)
// descartava 102 dos 209 documentos, porque cada órgão imprime a linha com um encadeamento diferente.
// O CNPJ é o único elemento que toda linha tem — é ele que delimita.
const RE_LINHA_PROPOSTA = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*-?\s*([^\d:]{0,90}?)(?=\s*(?:Porte|Marca|Fornecedor|R\$|CNPJ|\d))/g;
const RE_MARCA_FABRIC = /M\s?a\s?r\s?c\s?a\s*\/?\s*F?a?b?r?i?c?a?n?t?e?\s*[:\/]/i;

/** todas as linhas de proposta do relatório, cada uma com seu CNPJ, sua marca e seus valores */
export function achaPropostas(t) {
  const marcos = [...t.matchAll(RE_LINHA_PROPOSTA)];
  const linhas = [];
  for (let k = 0; k < marcos.length; k++) {
    const m = marcos[k];
    const fim = marcos[k + 1] ? marcos[k + 1].index : Math.min(t.length, m.index + 600);
    const corpo = t.slice(m.index, fim);
    const mm = corpo.match(RE_MARCA_FABRIC);
    linhas.push({
      cnpj: soDigitos(m[1]), nome: limpa(m[2]).slice(0, 80), ini: m.index,
      marca: mm ? leCampo(corpo.slice(mm.index + mm[0].length), RE_FIM_CAMPO) : null,
      valores: [...new Set(dinheiros(corpo))],
    });
  }
  return linhas;
}

/**
 * Dirigido pelo ITEM: para cada item do PNCP, acha a linha do vencedor daquele item.
 * @param texto  relatório de julgamento
 * @param itens  [{numero, cnpj_fornecedor, valor, valor_ref}] do PNCP
 */
export function leRelatorioJulgamento(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  const linhas = achaPropostas(t);
  if (!linhas.length) return { achou: false, motivo: "sem linha de proposta", itens: [], resumo };

  const porCnpj = new Map();
  for (const l of linhas) { if (!porCnpj.has(l.cnpj)) porCnpj.set(l.cnpj, []); porCnpj.get(l.cnpj).push(l); }

  const usadas = new Set();
  const out = [];
  for (const i of itens) {
    const cnpj = soDigitos(i.cnpj_fornecedor || i.cnpj);
    if (!cnpj) continue;                                   // item sem vencedor no espelho: nada a casar
    // ═══ O MESMO CNPJ APARECE DUAS VEZES, E SÓ UMA DELAS TEM A MARCA ═══
    // O relatório cita o vencedor na frase-resumo ("a TITA UNIFORMES LTDA, CNPJ 21.642.402/0001-60, melhor
    // lance: R$ 20,0000") e de novo na linha da proposta, que é onde estão Marca/Fabricante e Modelo.
    // As duas casam CNPJ e casam o valor; pegar a primeira que aparece pega justamente a que não tem marca.
    // Por isso as linhas COM rótulo de marca são tentadas antes — não é preferência estética, é a única
    // das duas que responde à pergunta.
    const cands = (porCnpj.get(cnpj) || []).filter((l) => !usadas.has(l.ini))
      .sort((a, b) => (a.marca === null ? 1 : 0) - (b.marca === null ? 1 : 0));
    if (!cands.length) { resumo.linha_nao_lida++; out.push({ item_pncp: Number(i.numero), cnpj, status: "linha_nao_lida", motivo: "vencedor do PNCP nao tem linha de proposta no documento" }); continue; }

    // entre as linhas daquele vencedor, a do ITEM é a que traz o valor homologado
    let linha = null, ancora = "cnpj", valorUsado = null;
    for (const [campo, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (linha) break;
      for (const l of cands) {
        const v = l.valores.find((x) => perto(x, i[campo]));
        if (v == null) continue;
        linha = l; valorUsado = v; ancora = `cnpj+${nome}`; break;
      }
    }
    if (!linha) { linha = cands[0]; ancora = "cnpj+ordem"; }
    usadas.add(linha.ini);

    const base = { item_pncp: Number(i.numero), fornecedor: linha.nome, cnpj, ancora, valor_ata: valorUsado };
    // "não achei o rótulo" e "o rótulo está lá e vem vazio" são coisas diferentes, e só a segunda é
    // informação sobre a compra. Confundi-las inflaria sem_marca_declarada com as minhas próprias falhas
    // de leitura — foi o que aconteceu ao afrouxar o recorte da linha: 1.389 "campos vazios" onde muitos
    // eram apenas linha sem o rótulo.
    if (linha.marca === null) { resumo.linha_nao_lida++; out.push({ ...base, marca: null, status: "linha_nao_lida", motivo: "linha da proposta sem rotulo de marca" }); continue; }
    if (ehVazio(linha.marca)) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    const st = ancora.includes("valor") ? "marca" : "candidato";
    resumo[st]++;
    out.push({ ...base, marca: linha.marca, origem: "marca/fabricante", status: st });
  }
  return { achou: true, propostas: linhas.length, itens: out, resumo };
}

/** escolhe o leitor pela assinatura do documento */
export function leResultadoOrgao(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  if (/M\s?a\s?r\s?c\s?a\s*\/\s*F\s?a\s?b\s?r\s?i\s?c\s?a\s?n\s?t\s?e/i.test(t) && /Valor\s+propo\s?\w*ta|Porte\s+MeEpp/i.test(t))
    return { ...leRelatorioJulgamento(texto, itens), leitor: "relatorio_julgamento" };
  return { ...leTermoHomologacao(texto, itens), leitor: "termo_homologacao" };
}

/** blocos de fornecedor: uma linha com nome e CNPJ. O CNPJ é o que restringe o universo. */
export function achaFornecedores(t) {
  const re = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{4,80}?)\s*[\(\-–]?\s*(?:CNPJ\s*n?[ºo°]?\s*:?\s*)?(\d{2}\.?\s?\d{3}\.?\s?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2})/g;
  const gs = []; let m;
  while ((m = re.exec(t)) !== null) {
    const cnpj = soDigitos(m[2]);
    if (cnpj.length !== 14) continue;
    gs.push({ nome: limpa(m[1]).replace(/^\d+\s*-\s*/, "").slice(0, 80), cnpj, ini: m.index });
  }
  return gs;
}

/**
 * @param texto  termo de homologação / adjudicação / julgamento
 * @param itens  [{numero, cnpj_fornecedor, valor, valor_ref, unidade}] do PNCP
 */
export function leTermoHomologacao(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  RE_MARCA.lastIndex = 0;
  if (!RE_MARCA.test(t)) return { achou: false, motivo: "sem rotulo de marca", itens: [], resumo };

  const porForn = new Map();
  for (const i of itens) {
    const c = soDigitos(i.cnpj_fornecedor || i.cnpj);
    if (!c) continue;
    if (!porForn.has(c)) porForn.set(c, []);
    porForn.get(c).push(i);
  }
  for (const lista of porForn.values()) lista.sort((a, b) => Number(a.numero) - Number(b.numero));
  // quando o documento não traz CNPJ do vencedor (layout B), o universo é o processo inteiro
  const todos = itens.slice().sort((a, b) => Number(a.numero) - Number(b.numero));

  // ═══ SÓ É FORNECEDOR QUEM GANHOU ALGO NESTE PROCESSO ═══
  // O termo é papel timbrado do órgão: o cabeçalho traz o CNPJ da PREFEITURA ("PREFEITURA DO MUNICÍPIO DE
  // LAGES CNPJ: 82.777.301/0001-90"), e ele aparece ANTES de tudo. Sem esta trava, todo item do documento
  // era atribuído ao órgão como se fosse o vencedor, o universo saía vazio e a âncora de valor nunca corria
  // — foram 6.021 itens presos numa âncora "cnpj" que não apontava para lugar nenhum.
  // A trava não depende de saber quem é o órgão: um bloco só conta se aquele CNPJ consta como vencedor de
  // algum item no PNCP. É o próprio espelho decidindo, não uma lista nossa.
  const forns = achaFornecedores(t).filter((f) => porForn.has(f.cnpj));
  const doForn = (pos) => { let g = null; for (const x of forns) { if (x.ini <= pos) g = x; else break; } return g; };
  const usados = new Set();

  const out = [];
  const posNoForn = new Map();
  RE_MARCA.lastIndex = 0;
  let m;
  while ((m = RE_MARCA.exec(t)) !== null) {
    const depois = t.slice(m.index + m[0].length, m.index + m[0].length + 220);
    const marca = leCampo(depois, RE_FIM_CAMPO);
    // o fabricante, quando existe, vem logo depois e é a marca real nos termos que deixam `Marca:` vazia
    const mFab = depois.match(RE_FABRIC);
    const fabricante = mFab ? leCampo(depois.slice(mFab.index + mFab[0].length), RE_FIM_CAMPO) : null;

    const g = doForn(m.index);
    const universo = g ? (porForn.get(g.cnpj) || []) : todos;
    const idx = posNoForn.get(g ? g.cnpj : "*") || 0; posNoForn.set(g ? g.cnpj : "*", idx + 1);

    // todos os números depois da marca são candidatos; o PNCP valida qual é o unitário
    const candidatos = [...new Set(dinheiros(depois))];
    let alvo = null, ancora = g ? "cnpj" : "nenhuma", valorUsado = null;
    for (const [campo, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (alvo) break;
      for (const v of candidatos) {
        const casam = universo.filter((i) => perto(v, i[campo]) && !usados.has(String(i.numero)));
        if (!casam.length) continue;
        alvo = casam[0]; valorUsado = v;
        ancora = `${g ? "cnpj+" : ""}${nome}${casam.length > 1 ? "+ordem" : ""}`;
        break;
      }
    }
    if (!alvo && universo.length) { alvo = universo[idx] || null; if (alvo) ancora = g ? "cnpj+ordem" : "ordem"; }
    if (alvo) usados.add(String(alvo.numero));

    const base = {
      item_pncp: alvo ? Number(alvo.numero) : null, fornecedor: g?.nome || null, cnpj: g?.cnpj || null,
      ancora, valor_ata: valorUsado, fabricante: ehVazio(fabricante) ? null : fabricante,
    };
    // qual campo o documento realmente preencheu
    const valor = !ehVazio(marca) ? { v: marca, origem: "marca" }
      : !ehVazio(fabricante) ? { v: fabricante, origem: "fabricante" } : null;
    if (!valor) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    // só afirma marca com o item identificado por valor; ordem sozinha não sustenta
    const st = alvo && ancora.includes("valor") ? "marca" : "candidato";
    resumo[st]++;
    if (st === "marca" && valor.origem === "fabricante") resumo.marca_por_fabricante = (resumo.marca_por_fabricante || 0) + 1;
    out.push({ ...base, marca: valor.v, origem: valor.origem, status: st });
  }
  return { achou: true, fornecedores: forns.length, itens: out, resumo };
}
