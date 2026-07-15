// PARSER DETERMINÍSTICO — ATA NATIVA DO BETHA (AtaSessaoFinal/AtaTotal gerados pelo próprio Betha, NÃO pelo Portal).
// Rotear por arquivo_texto_sc.gerador='betha' — a `plataforma` do PNCP é só quem PUBLICOU ([[mapa_atas_plataformas]]).
//
// COBERTURA = "vencedor" (confirmado lendo o documento, 2026-07-15): o Betha dá
//   (a) MARCA por ITEM, mas só do VENCEDOR do lote — não há proposta de marca por concorrente;
//   (b) OFERTAS por LOTE (inicial → final) de cada participante — é sinal de DISPUTA, não lance-a-lance.
// Por isso NÃO grava propostas por item: seria inventar granularidade que o documento não tem.
//
// Estrutura (texto com espaços normalizados):
//   CLASSIFICAÇÃO: "<ordem> <RAZÃO SOCIAL> <num> <CNPJ> <oferta inicial> <oferta final> [dif%] <Sim|Não>"
//   VALORES UNITÁRIOS FINAIS: "Item: N Unidade: U Descrição: D Quantidade: Q Valor Unit.: V Valor Total: T Marca: M Modelo: X"
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => s.replace(/\s+/g, "");
// RODAPÉ de página do Betha ("9 de 88Gerado em: 28/03/2025 16:10:00 MUNICIPIO DE X X-SC") cai no meio do texto e
// vaza p/ dentro de Marca:/Modelo: ("CINTO ARANHA ADULTO 9 de 88Gerado em:").
// ⚠️ NÃO tirar o rodapé do TEXTO: a data dele é FRONTEIRA do lookahead do ITEM — removê-la custou 680 itens e 510
// marcas (medido). Limpar só o CAMPO, depois de casar. (Mesma lição do ECustomize: o `pre` alimentava 2 coisas.)
const limpaCampo = (s) => String(s || "")
  .replace(/\d+\s+de\s+\d+.*$/is, "").replace(/Gerado em:.*$/is, "").replace(/P[áa]gina\s+\d+.*$/is, "")
  .replace(/\bMUNIC[IÍ]PIO DE\b.*$/is, "").replace(/\bMUNICIPIO DE\b.*$/is, "").trim();

// participante do lote. Âncoras fortes: CNPJ + 2 valores + ME(Sim/Não). Nome limitado a 80 chars (sem (.*?) solto:
// gap ilimitado dá backtracking catastrófico e trava o node — lição do parser do ECustomize).
const PART = /(\d{1,3})\s+(.{3,80}?)\s+(\d{1,4})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(?:([\d.]+,\d{1,2})\s+)?(Sim|N[ãa]o)\b/g;
// item com marca. Descrição limitada a 2000 chars (idem).
const ITEM = /Item:\s*(\d+)\s+Unidade:\s*(.{1,40}?)\s+Descri[çc][ãa]o:\s*([\s\S]{1,2000}?)\s+Quantidade:\s*([\d.]+(?:,\d+)?)\s+Valor\s*Unit\.?:\s*([\d.]+,\d{2})\s+Valor\s*Total:\s*([\d.]+,\d{2})\s+Marca:\s*([^]{0,60}?)\s*Modelo:\s*([^]{0,60}?)(?=\s*Item:|\s*MOVIMENTOS|\s*LOTE\s|\s*\d{2}\/\d{2}\/\d{4}|\s*$)/g;
// cabeçalho do lote: "LOTE 1 - ADJUDICADO <nome>"
const LOTE = /LOTE\s+(\d+)\s*-\s*([A-ZÀ-Ú ]{3,40})/g;

export function parseAtaBetha(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const itens = [], participantes = [];

  for (const m of t.matchAll(ITEM)) {
    const marca = limpaCampo(m[7]).replace(/^[-–]$/, "");
    const modelo = limpaCampo(m[8]);
    itens.push({
      numero: parseInt(m[1], 10),
      unidade: m[2].trim(),
      descricao: limpaCampo(m[3]).slice(0, 600),
      quantidade: num(m[4]),
      valorUnitario: num(m[5]),
      valorTotal: num(m[6]),
      // "Marca: Serviço" = o Betha preenche assim quando é serviço (não é marca de produto) → normaliza p/ null
      marca: !marca || /^servi[çc]o$/i.test(marca) ? null : marca.slice(0, 80),
      modelo: modelo ? modelo.slice(0, 80) : null,
    });
  }
  for (const m of t.matchAll(PART)) {
    const nome = m[2].trim().replace(/^(Sim|N[ãa]o)\b\s*/i, "").replace(/^[\d.,]+\s+/, "");
    participantes.push({
      ordem: parseInt(m[1], 10),
      fornecedor: nome ? nome.slice(0, 160) : null,
      cnpj: limpaCnpj(m[4]),
      ofertaInicial: num(m[5]),
      ofertaFinal: num(m[6]),
      me: /sim/i.test(m[8]),
    });
  }
  // participante repete entre as tabelas (CLASSIFICAÇÃO/DESCLASSIFICADOS/INABILITADOS) → dedup por CNPJ, mantendo a
  // melhor (menor) oferta final. n_licitantes = CNPJs distintos.
  const porCnpj = new Map();
  for (const p of participantes) {
    const c = porCnpj.get(p.cnpj);
    if (!c || (p.ofertaFinal > 0 && p.ofertaFinal < c.ofertaFinal)) porCnpj.set(p.cnpj, p);
  }
  const lotes = [...t.matchAll(LOTE)].map((m) => ({ numero: parseInt(m[1], 10), situacao: m[2].trim() }));
  return { itens, participantes: [...porCnpj.values()], lotes };
}
