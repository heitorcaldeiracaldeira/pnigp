// LEITOR DO "RESULTADOS" DA COMPRASBR (AZ) — escrito a partir da leitura INTEGRAL dos 1.425 documentos.
//
// ═══ AS GRAMÁTICAS, medidas em 05/ago/2026 lendo cada documento do começo ao fim (não por amostra) ═══
//   1.051 (73,8%)  inline SEM valor no item — o valor mora no bloco do LOTE
//     320 (22,5%)  inline COM "Valor unitário"/"Valor total item" — mas com os valores TROCADOS
//      12 (0,8%)   ata de julgamento de amostra:  "Análise do Item 27: ... Marca: Colonial"
//       7 (0,5%)   parecer técnico:               "Item 06 - CORDELETE DE RESGATE Marca: ARP FIRE"
//      35 (2,4%)   colunar e cauda
//   As duas primeiras somam 96,3% e compartilham o mesmo esqueleto, então o leitor é um só, com o valor
//   resolvido por aritmética em vez de por rótulo. As duas seguintes são leitores curtos e separados.
//
// ═══ AS TRÊS ARMADILHAS QUE ESTE ARQUIVO EVITA ═══
//
// 1. O RÓTULO VEM DEPOIS DO VALOR, COLADO. "PRÓPRIAMarca:" significa marca = PRÓPRIA. A extração do PDF junta
//    o conteúdo de uma célula com o rótulo da célula seguinte, então o valor fica À ESQUERDA do rótulo que o
//    nomeia. Ler "o que vem depois de Marca:" devolve o MODELO.
//
// 2. O RÓTULO DO VALOR MENTE. Medido: "Valor unitário: 99.132,61Valor total item:0,0708" com Quantidade
//    1.400.000 — e 1.400.000 x 0,0708 = 99.120, que é o total. O que está escrito como unitário é o total e
//    vice-versa. Por isso NÃO se lê o valor pelo rótulo: colhem-se todos os números do registro e a
//    QUANTIDADE decide qual é o unitário (unit x qtd = total). A aritmética não depende do rótulo estar certo.
//    No lote, o mesmo: "Itens do lote: 1 114,5000131,4000 82.440,00Valor total:" são dois números de 4 casas
//    COLADOS (114,5000 e 131,4000) mais o total. Confere pela quantidade em todos os casos vistos:
//    720 x 114,50 = 82.440 · 1.500 x 0,90 = 1.350 · 3.000 x 29,00 = 87.000 · 6.000 x 7,75 = 46.500.
//
// 3. NÃO SE CASA PELO NÚMERO DO ITEM. Medido: 6.400 processos da base têm ID no lugar do número em
//    itens_sc.numero, e 5.224 deles são da AZ. A ata diz "Item: 1" e o banco guarda 1.511.995. NÃO é erro do
//    nosso ingest: a API do PNCP entrega `numeroItem` e nós gravamos fielmente — quem publica ID no campo do
//    número é o remetente. Espelho fiel, dado torto na origem. Então a chave tem de ser outra.
//
// ═══ A ÂNCORA, em três camadas ═══
//   CNPJ  — o cabeçalho do grupo traz o CNPJ do vencedor; restringe o universo aos itens daquele fornecedor.
//   VALOR — dentro desse universo, o valor unitário identifica QUAL item. Casa contra o homologado e, na
//           falta dele, contra o estimado (unit_estimado, preenchido em 100% dos itens da AZ).
//   ORDEM — só quando o valor empata ou falta. É a camada frágil, e o resultado sai marcado com a âncora que
//           o sustentou: só vira "marca" o que teve valor; com ordem sozinha, sai "candidato".

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// "PRÓPRIA"/"PRÓPRIO" é o que a AZ escreve quando o objeto é serviço e não há marca a declarar — é campo
// vazio, não marca. Sem tirar o acento antes, PRÓPRIA passava por marca e entrava na base como se fosse uma.
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/a|s\/m|sem marca|propri[ao]s?|marca propria|servicos?|produtos?|generic[ao]s?|divers[ao]s?|-{1,3}|\.*|)$/i;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
const ehVazio = (s) => VAZIO.test(limpa(semAcento(s)));

// ═══ O TOKENIZADOR DO NÚMERO, e a cola de 4 casas ═══
// A AZ imprime os valores do lote COLADOS: "4,69007,0800" são 4,6900 e 7,0800 — dois números de 4 casas.
// A versão anterior usava um `(?!\d)` para não parar no meio de um número; o efeito foi o oposto: em
// "4,6900|7,0800" o lookahead barrava a parada correta, o motor recuava e casava "69007,0800" = 69.007,08,
// um número que não existe em lugar nenhum. Foi isso que produziu o diagnóstico falso de "os valores da ata
// não batem com o PNCP": o 4,69 do PNCP estava na ata o tempo todo, eu é que o destruía ao ler.
// A regra certa é de ordem, não de lookahead: tenta 4 casas primeiro (a forma do valor unitário na AZ) e
// só depois 2 casas (a forma dos totais). Assim "4,6900" fecha em 4 dígitos e a leitura recomeça em "7,0800".
const RE_DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{4}|\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
const num = (s) => { const t = String(s).replace(/\./g, "").replace(",", "."); const v = Number(t); return Number.isFinite(v) ? v : null; };
const quantia = (s) => { const t = String(s || "").trim().replace(/\.(?=\d{3}\b)/g, "").replace(",", "."); const v = Number(t); return Number.isFinite(v) ? v : null; };
const perto = (a, b, tol = 0.02) => a != null && b != null && (Math.abs(a - Number(b)) <= tol || (Number(b) !== 0 && Math.abs(a - Number(b)) / Math.abs(Number(b)) <= 0.005));

const dinheiros = (s) => { const out = []; for (const m of String(s || "").matchAll(RE_DINHEIRO)) { const v = num(m[0]); if (v != null) out.push(v); } return out; };

export function achaGruposAz(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const re = /FORNECEDOR\s+(.{3,90}?)\s*CNPJ\/CPF:\s*([\d./-]{11,20})/gi;
  const gs = []; let m;
  while ((m = re.exec(t)) !== null) gs.push({ nome: limpa(m[1]), cnpj: soDigitos(m[2]), ini: m.index });
  return gs;
}

/** Blocos de lote: "N Valor Inicial: ... Valor final: ...Itens do lote: K <números> Valor total:" */
function achaLotes(t) {
  const out = [];
  for (const m of t.matchAll(/Itens do lote:\s*(\d+)/gi)) {
    const ini = Math.max(0, m.index - 200);
    const resto = t.slice(m.index);
    const ate = resto.search(/(?<!total\s)\bItem:\s*\d/i);
    const cabec = t.slice(ini, m.index + (ate > 0 ? ate : 200));
    out.push({ ini: m.index, qtdItens: Number(m[1]), valores: dinheiros(cabec.slice(cabec.indexOf("Itens do lote"))) });
  }
  return out;
}

/**
 * @param texto  documento "Resultados" da AZ
 * @param itens  [{numero, cnpj_fornecedor, valor, valor_ref, unidade}] do PNCP
 */
export function leResultadosAz(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0, sem_fornecedor: 0 };
  if (!/Marca\s*:/i.test(t)) return { achou: false, itens: [], resumo };

  const grupos = achaGruposAz(t);
  // ═══ DOCUMENTO SEM BLOCO DE VENCEDOR ═══
  // Medido: 9 documentos dos 1.425 (485 itens) não são ata de resultado — são a relação de itens do edital,
  // com "Val. Ref." e sem nenhum FORNECEDOR. Não há vencedor a quem atribuir marca. Isso é um fato do
  // documento, dito UMA vez; emitir 485 falhas por item inventaria um problema de leitura que não existe.
  if (!grupos.length) return { achou: false, motivo: "documento sem bloco de vencedor (relacao de itens, nao ata de resultado)", itens: [], resumo };

  const lotes = achaLotes(t);
  const doGrupo = (pos) => { let g = null; for (const x of grupos) { if (x.ini <= pos) g = x; else break; } return g; };
  const doLote = (pos) => { let l = null; for (const x of lotes) { if (x.ini <= pos) l = x; else break; } return l; };

  // universo por fornecedor: os itens que ELE venceu, na ordem do PNCP
  const porForn = new Map();
  for (const i of itens) {
    const c = soDigitos(i.cnpj_fornecedor || i.cnpj);
    if (!c) continue;
    if (!porForn.has(c)) porForn.set(c, []);
    porForn.get(c).push(i);
  }
  for (const lista of porForn.values()) lista.sort((a, b) => Number(a.numero) - Number(b.numero));
  const usados = new Set();
  const chave = (i) => `${i.numero}`;

  // ═══ O MARCADOR DE ITEM, sem os fantasmas ═══
  // "Valor total item:9.585,92" também casa /Item:\s*\d/i — o \d pega o "9" do valor. Cada item real gerava
  // um marcador extra, que partia o registro ao meio e devolvia linha_nao_lida. Medido no 2024/73: os itens
  // #3, #5, #7, #9... todos os ímpares eram esse fantasma. Duas travas: não pode vir depois de "total ",
  // e o número não pode ser um valor monetário (dígitos seguidos de . ou , e mais dígitos).
  const marcos = [...t.matchAll(/(?<!total\s)\bItem:\s*(\d{1,7})(?![\d.,]*[.,]\d)/gi)];
  const out = [];
  const posNoGrupo = new Map();

  for (let k = 0; k < marcos.length; k++) {
    const m = marcos[k];
    const trecho = t.slice(m.index, marcos[k + 1] ? marcos[k + 1].index : Math.min(t.length, m.index + 1200));
    const g = doGrupo(m.index);
    if (!g) { resumo.sem_fornecedor++; out.push({ status: "linha_nao_lida", motivo: "item fora de qualquer bloco de fornecedor" }); continue; }

    // ═══ LER A MARCA PELO VÃO ENTRE RÓTULOS, com a UNIDADE como âncora ═══
    // A ordem é fixa: Item › Unidade › Marca › Modelo › Quantidade. O vão entre `Unidade:` e `Marca:`
    // carrega DOIS valores colados — o da unidade e o da marca:
    //     "Unidade: HRS PROPRIOMarca:" → unidade=HRS, marca=PROPRIO
    //     "Unidade: UN Marca:"         → unidade=UN,  marca=VAZIA
    // Sem separar os dois, o campo da marca herda a unidade — foi assim que saíram UN, KG, M² e SV como
    // "marca" no primeiro teste, o mesmo lixo que contaminou a base antiga e nos levou a apagá-la.
    const vaoMarca = trecho.match(/Unidade\s*:\s*([\s\S]{0,120}?)\s*Marca\s*:/i);
    if (!vaoMarca) { resumo.linha_nao_lida++; out.push({ status: "linha_nao_lida", motivo: "sem o par Unidade:/Marca:" }); continue; }
    const mModelo = trecho.match(/Marca\s*:\s*([\s\S]{0,80}?)\s*Modelo\s*:/i);

    // ═══ O VALOR, POR ARITMÉTICA E NÃO POR RÓTULO ═══
    // Colhe todo número do registro; se o lote tem UM item só, os números do lote também são desse item.
    // A quantidade separa unitário de total: unit x qtd = total. Quando a conta fecha entre dois números do
    // registro, o menor deles é o unitário — e é ele que vai à âncora.
    const l = doLote(m.index);
    const mQtd = trecho.match(/Quantidade\s*:\s*([\d.,]+)/i);
    const qtd = mQtd ? quantia(mQtd[1]) : null;
    const doItem = dinheiros(trecho);
    const doLoteVals = l && l.qtdItens === 1 ? l.valores : [];
    const candidatos = [...new Set([...doItem, ...doLoteVals])].filter((v) => v > 0);

    let unitarios = candidatos;
    if (qtd && qtd > 0 && candidatos.length > 1) {
      const provados = candidatos.filter((v) => candidatos.some((o) => o !== v && perto(v * qtd, o, Math.max(0.05, o * 0.01))));
      if (provados.length) unitarios = provados;                          // a conta fechou: são unitários
    }

    // ÂNCORA 1: CNPJ restringe o universo. 2: valor identifica o item. 3: ordem, só se preciso.
    const universo = porForn.get(g.cnpj) || [];
    const idx = (posNoGrupo.get(g.cnpj) || 0); posNoGrupo.set(g.cnpj, idx + 1);
    let alvo = null, ancora = "nenhuma", valorUsado = null;
    for (const [campo, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (alvo) break;
      for (const v of unitarios) {
        const casam = universo.filter((i) => perto(v, i[campo]) && !usados.has(chave(i)));
        if (casam.length === 1) { alvo = casam[0]; ancora = `cnpj+${nome}`; valorUsado = v; break; }
        if (casam.length > 1) { alvo = casam[idx < casam.length ? idx : 0]; ancora = `cnpj+${nome}+ordem`; valorUsado = v; break; }
      }
    }
    if (!alvo && universo.length) { alvo = universo[idx] || null; if (alvo) ancora = "cnpj+ordem"; }
    if (alvo) usados.add(chave(alvo));

    // subtrai a unidade do vão; o que sobra é a marca
    const vao = limpa(vaoMarca[1]);
    const unid = limpa(alvo?.unidade || "");
    let marca = vao;
    if (unid && semAcento(vao).toLowerCase().startsWith(semAcento(unid).toLowerCase())) {
      marca = limpa(vao.slice(unid.length));
    } else {
      // sem unidade conhecida (ou divergente), o primeiro token curto do vão é quase sempre a unidade
      const toks = vao.split(" ");
      marca = toks.length > 1 && toks[0].length <= 12 ? limpa(toks.slice(1).join(" ")) : vao;
    }

    // pontuação órfã na borda: a ata escreve "COOPERFLEX /" quando a segunda marca do par ficou em branco
    marca = limpa(marca.replace(/^[\s/,;.:-]+/, "").replace(/[\s/,;.:-]+$/, ""));

    const base = {
      item_pncp: alvo ? Number(alvo.numero) : null, fornecedor: g.nome, cnpj: g.cnpj,
      ancora, valor_ata: valorUsado, unidade: unid || null,
    };
    if (ehVazio(marca)) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    // só é marca com o item identificado por CNPJ+valor; ordem sozinha não sustenta afirmação
    const st = alvo && ancora.includes("valor") ? "marca" : "candidato";
    resumo[st]++;
    out.push({ ...base, marca, modelo: mModelo ? limpa(mModelo[1]).slice(0, 80) : null, status: st });
  }
  return { achou: true, grupos: grupos.length, itens: out, resumo };
}
