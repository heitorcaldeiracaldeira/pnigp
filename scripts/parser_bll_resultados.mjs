// LEITOR DOS DOCUMENTOS DE RESULTADO DA BLL — ancorado em CNPJ + valor.
//
// ═══ O UNIVERSO, e o que fica de fora ═══
// Dos documentos dos processos cujo portal_real é BLL, a maioria dos que contêm a palavra "Marca" é EDITAL
// (edital_*.pdf, EDITAL_PE_*, ~600 documentos). Ali a marca é referência de especificação, não a do
// vencedor — o art. 41 da Lei 14.133 veda a indicação de marca justamente nesse lugar. Lê-los envenenaria
// a base, e foi o mesmo erro que o Compras.gov ensinou.
// Os documentos DA PLATAFORMA têm nome próprio e é por eles que este leitor se guia:
//   VencedoresProcesso*   ~474  a lista de vencedores; traz marca, valor e CNPJ na MESMA linha do item
//   AtaHomologacao        ~330  marca e valor no item; o CNPJ está na tabela de classificação do topo
//   AtaAdjudicacao        ~270  idem
//   AtaSessaoFinal        ~337  idem (inclui lotes DESERTO, onde a marca vem vazia — e isso é informação)
//   PropostasProcesso     ~368  FICA DE FORA: é o campo de TODOS os licitantes, a marca é do perdedor.
//                               (só 19 desses documentos sequer trazem o rótulo `Marca:`)
//
// ═══ O FORMATO ═══
//   Item: 1 Descrição: X Quantidade: 1 Val. Ref.: 2.081.454,13 Unidade: UNIDADE Total Item: 1.745.000,00
//   Marca: Obra Modelo: Valor Unit.: 1.745.000,00 Quant.: 1 Total: 1.745.000,00
//   LOTE 1 Num: 409 Lance: 1.745.000,00 WEST ENGENHARIA LTDA 31.252.609/0001-81 1.745.000,00
//
// Ao contrário da AZ, aqui o rótulo vem ANTES do valor — ordem normal. E "Marca: Modelo:" com nada entre os
// dois significa marca vazia, que é informação sobre a compra e não falha de leitura.
//
// ═══ AS DUAS ARMADILHAS ═══
// 1. O "s" MINÚSCULO VIRA ESPAÇO nesses PDFs: "Proce o" é Processo, "De crição" é Descrição. Os campos que
//    interessam (Marca, Modelo, Valor Unit., Lance, Quantidade, Unidade) não têm s minúsculo e escapam —
//    mas o rótulo Descrição não, e por isso não serve de delimitador.
// 2. "Total Item: 1.745.000,00" TAMBÉM casa /Item:\s*\d/i — o mesmo marcador fantasma que partia os
//    registros da AZ ao meio. A trava é a mesma: não pode vir depois de "total", e o número que segue não
//    pode ser um valor monetário.

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const VAZIO = /^(n\/?c|n\.?c\.?|nao|nao informad[oa]|nao se aplica|n\/?a|s\/m|sem marca|prop|propri[ao]s?|marca propria|serv|servicos?|produtos?|generic[ao]s?|divers[ao]s?|obra s?|engenharia|locacao|mao de obra|deserto|fracassado|-{1,3}|\.*|)$/i;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
// ═══ O CAMPO COMPOSTO POR BARRA SE AVALIA PARTE A PARTE ═══
// "NÃO SE APLICA/SERVIÇOS" passava por marca porque a regra ancorada em ^...$ não reconhece o todo, embora
// reconheça cada metade. O documento aí não declarou marca nenhuma — declarou duas vezes que não há.
// Só é marca se ALGUMA parte for marca.
const ehVazio = (s) => {
  const partes = limpa(semAcento(s)).split(/\s*[\/|]\s*/);
  return partes.every((p) => VAZIO.test(p));
};

const RE_DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{4}|\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
const valorDe = (s) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
const perto = (a, b) => a != null && b != null && Number(b) !== 0 && (Math.abs(a - Number(b)) <= 0.02 || Math.abs(a - Number(b)) / Math.abs(Number(b)) <= 0.005);
const dinheiros = (s) => { const o = []; for (const m of String(s || "").matchAll(RE_DINHEIRO)) { const v = valorDe(m[0]); if (v != null && v > 0) o.push(v); } return o; };

const RE_ITEM = /(?<!total\s)\bItem:\s*(\d{1,7})(?![\d.,]*[.,]\d)/gi;
const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

/** os documentos que este leitor aceita — pelo nome que a plataforma dá ao arquivo */
export const RE_TITULO_BLL = /^(vencedoresprocesso|atahomologacao|ataadjudicacao|atasessaofinal)/i;

/**
 * A tabela de classificação do topo das atas: "1 DUDA IMÓVEIS LTDA 950 78.519.519/0001-78 7.500,00 7.500,00"
 * Dá o CNPJ do vencedor nas famílias que não o repetem na linha do item.
 */
export function achaClassificacao(t) {
  const re = /(\d{1,3})\s+([A-Za-zÀ-ÿ0-9][^\d]{3,70}?)\s+(\d{2,7})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/g;
  const out = []; let m;
  while ((m = re.exec(t)) !== null) {
    out.push({ pos: Number(m[1]), nome: limpa(m[2]), cnpj: soDigitos(m[4]), inicial: valorDe(m[5]), final: valorDe(m[6]) });
  }
  return out;
}

/**
 * @param texto  documento de resultado da BLL
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

    // ═══ A MARCA, em ordem normal ═══
    // "Marca: Obra Modelo:" -> Obra. "Marca: Modelo:" -> vazia, e vazia é resposta.
    const mMarca = trecho.match(/Marca\s*:\s*([\s\S]{0,60}?)\s*(?:Modelo\s*:|Valor\s*Unit|Lance\s*:|Quant|$)/i);
    if (!mMarca) { resumo.linha_nao_lida++; out.push({ status: "linha_nao_lida", motivo: "registro do item sem o rotulo Marca:" }); continue; }
    const marca = limpa(mMarca[1]).slice(0, 40);
    const mModelo = trecho.match(/Modelo\s*:\s*([\s\S]{0,60}?)\s*(?:Valor\s*Unit|Lance\s*:|Quant|Marca\s*:|$)/i);

    // ═══ O CNPJ DO VENCEDOR: na própria linha (VencedoresProcesso) ou na classificação (Atas) ═══
    RE_CNPJ.lastIndex = 0;
    const noTrecho = trecho.match(RE_CNPJ);
    let cnpj = noTrecho ? soDigitos(noTrecho[0]) : null;
    let origemCnpj = cnpj ? "linha do item" : null;

    // valores do registro: o rotulado primeiro, depois qualquer número, porque o PNCP é quem valida
    const rotulados = [];
    for (const re of [/Valor\s*Unit\.?\s*:\s*([\d.]+,\d{2,4})/i, /Lance\s*:\s*([\d.]+,\d{2,4})/i, /Val\.?\s*Ref\.?\s*:\s*([\d.]+,\d{2,4})/i]) {
      const x = trecho.match(re); if (x) { const v = valorDe(x[1]); if (v != null) rotulados.push(v); }
    }
    const candidatos = [...new Set([...rotulados, ...dinheiros(trecho)])].filter((v) => v > 0);

    // sem CNPJ na linha: a classificação diz quem ganhou. Um só classificado, é ele; vários, casa pela
    // oferta final, que nessas atas é o mesmo número do valor unitário do item.
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
