// LEITOR DOS DOCUMENTOS DE RESULTADO DA PLATAFORMA BLL — ancorado em CNPJ + valor.
//
// A seleção de quais documentos chegam aqui NÃO é deste arquivo: é de gerador_documento.mjs, que reconhece
// o gerador pelo conteúdo. Este leitor trata apenas o layout da própria BLL. Documentos da AZ e termos de
// ERP que aparecem dentro de processos da BLL (263 termos Betha e 129 atas AZ, medidos) vão para os seus
// leitores próprios — o portal não determina o gerador.
//
// ═══ AS DUAS FORMAS DA PLATAFORMA ═══
//
// A) VENCEDORES DO PROCESSO — traz marca, valor e CNPJ do vencedor na MESMA linha do item:
//    Item: 1 De crição: Cimento... Quantidade: 48.000 Val. Ref.: 600,00 Unidade: TONELADA
//    Total Item: 22.699.680,00 Marca: própria Modelo: próprio Valor Unit.: 472,91 Quant.: 1
//    Total: 22.699.680,00 LOTE 1 Num: 512 Lance: 22.699.680,00
//    JR CONSTRUÇÕES E TERRAPLANAGEM LTDA 05.895.635/0001-18 22.699.680,00
//
//    Atenção ao que os rótulos significam aqui, porque não é o óbvio: `Valor Unit.` é o UNITÁRIO
//    (48.000 x 472,91 = 22.699.680) e `Lance` é o TOTAL. Por isso o leitor não confia no rótulo: colhe
//    todos os números do registro e deixa o valor do PNCP dizer qual era o unitário.
//
// B) ATA DE SESSÃO / HOMOLOGAÇÃO / ADJUDICAÇÃO — marca e valor no item, mas SEM o CNPJ ali:
//    [tabela] Razão Social Num Documento Oferta Inicial Oferta Final
//             1 DUDA IMÓVEIS LTDA 950 78.519.519/0001-78 7.500,00 7.500,00
//    LOTE 1 - HOMOLOGADO - data  <objeto>  VALORES UNITÁRIOS FINAIS
//    Item: 1 Unidade: X De crição: Y Quantidade: 12 Valor Unit.: 7.500,00 Valor Total: 90.000,00
//    Marca: locação Modelo: locação
//    O CNPJ vem da tabela de classificação, casado pela oferta final.
//
// Ao contrário da AZ, aqui o rótulo vem ANTES do valor — ordem normal. "Marca: Modelo:" com nada entre os
// dois é marca VAZIA, e vazio é resposta sobre a compra, não falha de leitura.
//
// ═══ ARMADILHAS ═══
// 1. "Total Item: 22.699.680,00" também casa /Item:\s*\d/i — o mesmo marcador fantasma da AZ, que partia o
//    registro ao meio. A trava é a mesma: não pode vir depois de "total", e o número não pode ser monetário.
// 2. O "s" minúsculo vira espaço nesses PDFs ("De crição" = Descrição, "Proce o" = Processo). Os campos que
//    interessam (Marca, Modelo, Valor Unit., Lance, Quantidade, Unidade) não têm s minúsculo e escapam —
//    mas Descrição não serve de delimitador por causa disso.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/?a|s\/m|sem marca|prop|propri[ao]s?|marca propria|serv|servicos?|produtos?|generic[ao]s?|divers[ao]s?|obra s?|engenharia|locacao|mao de obra|deserto|fracassado|-{1,3}|\.*|)$/i;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ═══ O CAMPO COMPOSTO POR BARRA SE AVALIA PARTE A PARTE ═══
// "NÃO SE APLICA/SERVIÇOS" passava por marca porque a regra ancorada em ^...$ não reconhece o todo, embora
// reconheça cada metade. Ali o documento não declarou marca — declarou duas vezes que não há.
const ehVazio = (s) => limpa(semAcento(s)).split(/\s*[\/|]\s*/).every((p) => VAZIO.test(p));

const RE_DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{4}|\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
const valorDe = (s) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
const perto = (a, b) => a != null && b != null && Number(b) !== 0 && (Math.abs(a - Number(b)) <= 0.02 || Math.abs(a - Number(b)) / Math.abs(Number(b)) <= 0.005);
const dinheiros = (s) => { const o = []; for (const m of String(s || "").matchAll(RE_DINHEIRO)) { const v = valorDe(m[0]); if (v != null && v > 0) o.push(v); } return o; };

const RE_ITEM = /(?<!total\s)\bItem:\s*(\d{1,7})(?![\d.,]*[.,]\d)/gi;
const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

/** a tabela de classificação do topo das atas: dá o CNPJ nas formas que não o repetem no item */
export function achaClassificacao(t) {
  const re = /(\d{1,3})\s+([A-Za-zÀ-ÿ0-9][^\d]{3,70}?)\s+(\d{2,7})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/g;
  const out = []; let m;
  while ((m = re.exec(t)) !== null)
    out.push({ pos: Number(m[1]), nome: limpa(m[2]), cnpj: soDigitos(m[4]), inicial: valorDe(m[5]), final: valorDe(m[6]) });
  return out;
}

/**
 * @param texto  documento da plataforma BLL (roteado por gerador_documento.mjs)
 * @param itens  [{numero, cnpj_fornecedor, valor, valor_ref}] do PNCP
 */
export function leResultadosBll(texto, itens = []) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const resumo = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  if (!/Marca\s*:/i.test(t)) return { achou: false, motivo: "sem rotulo de marca", itens: [], resumo };

  const classif = achaClassificacao(t);
  const porCnpj = new Map();
  for (const i of itens) {
    const c = soDigitos(i.cnpj_fornecedor || i.cnpj);
    if (!c) continue;
    if (!porCnpj.has(c)) porCnpj.set(c, []);
    porCnpj.get(c).push(i);
  }
  for (const l of porCnpj.values()) l.sort((a, b) => Number(a.numero) - Number(b.numero));
  const todos = itens.slice().sort((a, b) => Number(a.numero) - Number(b.numero));
  const usados = new Set();

  RE_ITEM.lastIndex = 0;
  const marcos = [...t.matchAll(RE_ITEM)];
  const out = [];
  let ordem = 0;

  for (let k = 0; k < marcos.length; k++) {
    const m = marcos[k];
    const trecho = t.slice(m.index, marcos[k + 1] ? marcos[k + 1].index : Math.min(t.length, m.index + 900));

    const mMarca = trecho.match(/Marca\s*:\s*([\s\S]{0,60}?)\s*(?:Modelo\s*:|Valor\s*Unit|Lance\s*:|Quant|$)/i);
    if (!mMarca) { resumo.linha_nao_lida++; out.push({ status: "linha_nao_lida", motivo: "registro do item sem o rotulo Marca:" }); continue; }
    const marca = limpa(mMarca[1]).slice(0, 40);
    const mModelo = trecho.match(/Modelo\s*:\s*([\s\S]{0,60}?)\s*(?:Valor\s*Unit|Lance\s*:|Quant|Marca\s*:|$)/i);

    // o CNPJ do vencedor: na própria linha (forma A) ou na classificação (forma B)
    RE_CNPJ.lastIndex = 0;
    const noTrecho = trecho.match(RE_CNPJ);
    let cnpj = noTrecho ? soDigitos(noTrecho[0]) : null;
    let origemCnpj = cnpj ? "linha do item" : null;

    const rotulados = [];
    for (const re of [/Valor\s*Unit\.?\s*:\s*([\d.]+,\d{2,4})/i, /Lance\s*:\s*([\d.]+,\d{2,4})/i, /Val\.?\s*Ref\.?\s*:\s*([\d.]+,\d{2,4})/i]) {
      const x = trecho.match(re); if (x) { const v = valorDe(x[1]); if (v != null) rotulados.push(v); }
    }
    const candidatos = [...new Set([...rotulados, ...dinheiros(trecho)])].filter((v) => v > 0);

    if (!cnpj && classif.length) {
      if (classif.length === 1) { cnpj = classif[0].cnpj; origemCnpj = "classificacao (unico)"; }
      else {
        const c = classif.find((x) => candidatos.some((v) => perto(v, x.final)));
        if (c) { cnpj = c.cnpj; origemCnpj = "classificacao (oferta final)"; }
      }
    }

    const universo = cnpj && porCnpj.has(cnpj) ? porCnpj.get(cnpj) : todos;
    const idx = ordem++;
    let alvo = null, ancora = cnpj ? "cnpj" : "nenhuma", valorUsado = null;
    for (const [campo, nome] of [["valor", "valor"], ["valor_ref", "valor_ref"]]) {
      if (alvo) break;
      for (const v of candidatos) {
        const casam = universo.filter((i) => perto(v, i[campo]) && !usados.has(String(i.numero)));
        if (!casam.length) continue;
        alvo = casam[0]; valorUsado = v;
        ancora = `${cnpj ? "cnpj+" : ""}${nome}${casam.length > 1 ? "+ordem" : ""}`;
        break;
      }
    }
    if (!alvo && universo.length) { alvo = universo[idx] || null; if (alvo) ancora = cnpj ? "cnpj+ordem" : "ordem"; }
    if (alvo) usados.add(String(alvo.numero));

    const base = {
      item_pncp: alvo ? Number(alvo.numero) : null, cnpj, origem_cnpj: origemCnpj, ancora, valor_ata: valorUsado,
      modelo: mModelo ? limpa(mModelo[1]).slice(0, 60) || null : null,
    };
    if (ehVazio(marca)) { resumo.sem_marca_declarada++; out.push({ ...base, marca: null, status: "sem_marca_declarada" }); continue; }
    const st = alvo && ancora.includes("valor") ? "marca" : "candidato";
    resumo[st]++;
    out.push({ ...base, marca, status: st });
  }
  return { achou: true, classificados: classif.length, itens: out, resumo };
}
