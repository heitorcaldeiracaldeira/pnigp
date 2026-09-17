// LEITOR DA DISPUTA — LICITAR DIGITAL. Reaproveita parseAtaLicitarDigital (parser_licitar_digital.mjs), que já
// devolve TODAS as propostas de TODOS os fornecedores no layout "ATA DE PROPOSTAS ENVIADAS" (e o quadro de
// habilitados no layout "FORNECEDORES HABILITADOS"), cada uma com CNPJ, marca/fabricante/modelo, quantidade,
// unitário e avaliação. Aqui só se traduz para o contrato da fila de disputa:
//   · ref = assinatura da descrição (é a identidade real do item nesse gerador: o "Comprador N" reinicia por lote)
//   · valor_inicial = unitário proposto; valor_final = idem (a ata de propostas não traz lance)
//   · situacao = Classificado/Desclassificado quando a ata avalia; null quando não avalia
// ⛔ O layout "habilitados" lista só quem venceu/habilitou — não é a disputa inteira; entra marcado (layout).
import { parseAtaLicitarDigital } from "./parser_licitar_digital.mjs";
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

export function leDisputaLicitar(texto) {
  let regs;
  try { regs = parseAtaLicitarDigital(texto); } catch { regs = []; }
  if (!regs?.length) return { achou: false, gerador: "licitar_digital", blocos: [], propostas: [], lances: [] };
  const blocos = new Map(), propostas = [];
  for (const r of regs) {
    if (!r.cnpjFornecedor) continue;   // sem identidade não se afirma
    const ref = String(r.item).slice(0, 60);
    if (!blocos.has(ref)) blocos.set(ref, { ref, lote: r.numeroLote, item: r.codigo, nivel: "item", descricao: r.descricao ? String(r.descricao).slice(0, 600) : null });
    propostas.push({
      ref, nivel: "item", descricao: r.descricao ? String(r.descricao).slice(0, 600) : null,
      ni: soDigitos(r.cnpjFornecedor), alias: null, fornecedor: r.fornecedor ? String(r.fornecedor).slice(0, 160) : null,
      me_epp: null, uf: null,
      marca: r.marca ? String(r.marca).slice(0, 80) : null, modelo: r.modelo ? String(r.modelo).slice(0, 120) : null,
      fabricante: r.fabricante || null, marca_declarada: !!r.marca,
      quantidade: r.quantidade || null, valor_inicial: r.valorUnitario || null, valor_final: r.valorUnitario || null,
      valor_total: r.valorTotal || null, base_valor: "unitario",
      situacao: r.classificado === true ? "Classificado" : r.classificado === false ? "Desclassificado" : null,
      data_hora: null, layout: r.layout,
    });
  }
  return { achou: propostas.length > 0, gerador: "licitar_digital", blocos: [...blocos.values()], propostas, lances: [] };
}
