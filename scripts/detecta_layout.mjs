// DETECTA O LAYOUT RODANDO OS PARSERS — não por assinatura.
//
// POR QUE: assinatura de texto NÃO prova que o parser lê. Medido 2026-07-15 numa simulação (que evitou a regressão):
//   · a assinatura estrutural do Betha ("Item: N … Marca:") capturava documentos da AZ e os mandava p/ o parser
//     Betha, que extraía 0% — enquanto o parser AZ extraía 91% dos mesmos documentos.
//   · a assinatura do Portal ("Marca/ Fabricante") classificava 347 docs, mas o parser só lia 35% deles.
// Assinatura responde "com o que ele PARECE"; o parser responde "de qual eu CONSIGO extrair". Só a 2ª interessa.
//
// COMO: roda cada parser (todos determinísticos e rápidos: 0,2–2ms/doc) e fica com o que extrai MAIS registros.
// Empate/zero → 'outro' (= ninguém lê; é a fila de trabalho real, não um palpite).
// Custo: ~3 parses por documento. Barato perto de baixar o PDF.
//
// Fica em módulo próprio p/ evitar ciclo de import: os parsers importam `normalizaMarca` de mapa_atas_plataformas.
import { parseAtaAz } from "./parser_az.mjs";
import { parseAtaBetha } from "./parser_betha.mjs";
import { parseAtaEcustomize, parseVencedoresPortal } from "./parser_ecustomize.mjs";

// ordem = desempate quando 2 parsers leem o mesmo doc (raro). Do mais específico p/ o mais genérico.
const CANDIDATOS = [
  { id: "az", fn: (t) => parseAtaAz(t) },
  { id: "portal_compras_publicas", fn: (t) => parseAtaEcustomize(t).filter((r) => r.codigo && (r.fornecedor || r.cnpj)) },
  { id: "betha", fn: (t) => { const r = parseAtaBetha(t); return [...r.itens, ...r.participantes]; } },
  // bloco "Vencedores" do Portal — 2ª tabela, sem CNPJ/data/Sim-Não: o parser de propostas não a lê.
  // Era o MAIOR bloco da fila (2.106 de 7.761). Vem por último: se a tabela de PROPOSTAS existe, ela é melhor
  // (traz TODOS os licitantes); o Vencedores só traz o ganhador.
  { id: "portal_vencedores", fn: (t) => parseVencedoresPortal(t) },
];

/** devolve { gerador, n } — o parser que MAIS extrai; 'outro' se nenhum extrai. */
export function detectaLayout(texto) {
  if (!texto || texto.length < 300) return { gerador: "outro", n: 0 };
  let melhor = { gerador: "outro", n: 0 };
  for (const c of CANDIDATOS) {
    let n = 0;
    try { n = c.fn(texto).length; } catch { n = 0; }
    if (n > melhor.n) melhor = { gerador: c.id, n };
  }
  return melhor;
}
