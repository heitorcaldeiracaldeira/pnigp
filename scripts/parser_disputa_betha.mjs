// LEITOR DA DISPUTA — ATA DO ERP BETHA (publicada pela BLL, BNC, Compras.gov e pelo próprio Betha).
//
// A ata de sessão/homologação/adjudicação do Betha traz, POR LOTE:
//   LOTE N - <SITUAÇÃO> - <data hora> <nome do lote>
//   VALORES UNITÁRIOS FINAIS  Item: n Unidade: u Descrição: d Quantidade: q Valor Unit.: v Valor Total: t Marca: m Modelo: x  (só do vencedor)
//   CLASSIFICAÇÃO   Razão Social Num Documento Oferta Inicial Oferta Final Dif.(%) ME
//       <ordem> <RAZÃO SOCIAL> <num> <CNPJ> <oferta inicial> <oferta final> [dif%] <Sim|Não>
//   DESCLASSIFICADOS  (mesmas colunas)      INABILITADOS  (mesmas colunas)
//
// O que isso é: a DISPUTA por lote — cada licitante com CNPJ inteiro, sua oferta INICIAL (proposta) e FINAL (último
// lance ou negociação), se é ME/EPP, e em qual quadro caiu (classificado / desclassificado / inabilitado). Não há
// lance a lance; o parser_betha existente lê os participantes mas SEM dizer de qual lote são (dedup global por CNPJ)
// — aqui o lote é a unidade, porque é nele que a oferta vale.
//
// ⚠️ Os valores são TOTAIS DO LOTE, não unitários. Isso vai declarado (base_valor='total'). A fila casa o lote com os
// itens do PNCP pelos "Item: n" listados no bloco; lote de um item só resolve para o item.
// ⚠️ O rodapé "9 de 88Gerado em: 28/03/2025 …" cai no meio do texto e vaza para dentro do nome — limpar o CAMPO,
// não o texto (a data do rodapé é fronteira em parser_betha; aqui também serve de fronteira de lote).
const NBSP = String.fromCharCode(160);
const norm = (s) => String(s || "").split(NBSP).join(" ").replace(/\s+/g, " ");
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpaCampo = (s) => norm(s).replace(/\d+\s+de\s+\d+\s*Gerado em:.*$/i, "").replace(/Gerado em:.*$/i, "").replace(/\bMUNIC[IÍ]PIO DE\b.*$/i, "").trim();

const LOTE = /LOTE\s+(\d{1,4})\s*-\s*([A-ZÀ-Ú]{3,20}(?:\s+[A-ZÀ-Ú]{3,20})?)\s*-\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)?/g;
const ITEM = /Item:\s*(\d{1,5})\s+Unidade:\s*([^]{1,40}?)\s+Descri[çc][ãa]o:\s*([\s\S]{1,1500}?)\s+Quantidade:\s*([\d.]+(?:,\d+)?)/g;
const QUADRO = /(CLASSIFICA[ÇC][ÃA]O|DESCLASSIFICADOS|INABILITADOS)\s+Raz[ãa]o Social\s+Num\s+Documento\s+Oferta Inicial\s+Oferta Final(?:\s+Dif\.?\s*\(%\))?\s+ME/g;
// participante: <ordem> <nome> <num> <CNPJ ou CPF> <inicial> <final> [dif%] <Sim|Não>
const PART = /(\d{1,3})\s+([\s\S]{3,120}?)\s+(\d{1,5})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2}|\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(?:(-?[\d.]+,\d{1,2})\s+)?(Sim|N[ãa]o)\b/g;

export function leDisputaBetha(texto) {
  const t = norm(texto);
  if (!/VALORES UNIT[ÁA]RIOS FINAIS|Oferta Inicial\s+Oferta Final/i.test(t)) return { achou: false, gerador: "betha", blocos: [], propostas: [], lances: [] };

  const lotes = [...t.matchAll(LOTE)].map((m) => ({ lote: Number(m[1]), situacao_lote: m[2].trim(), data: m[3] || null, ini: m.index, fim: t.length }));
  for (let i = 0; i + 1 < lotes.length; i++) lotes[i].fim = lotes[i + 1].ini;
  // ata sem cabeçalho de lote (documento só de CLASSIFICAÇÃO): um bloco único
  if (!lotes.length) lotes.push({ lote: 1, situacao_lote: null, data: null, ini: 0, fim: t.length, implicito: true });

  const blocos = [], propostas = [];
  for (const L of lotes) {
    const corpo = t.slice(L.ini, L.fim);
    const itens = [...corpo.matchAll(ITEM)].map((m) => ({ item: Number(m[1]), unidade: limpaCampo(m[2]).slice(0, 40), descricao: limpaCampo(m[3]).slice(0, 600), quantidade: num(m[4]) }));
    const ref = `L${L.lote}`;
    const b = { ref, lote: L.lote, item: itens.length === 1 ? itens[0].item : null, nivel: "lote", itens_doc: itens.map((i) => i.item),
      descricao: itens.length === 1 ? itens[0].descricao : itens.map((i) => i.descricao).join(" | ").slice(0, 600), situacao_lote: L.situacao_lote };
    // quadros: cada um vai até o próximo quadro ou o fim do lote
    const quadros = [...corpo.matchAll(QUADRO)].map((m) => ({ nome: m[1].toUpperCase(), ini: m.index + m[0].length, fim: corpo.length }));
    for (let i = 0; i + 1 < quadros.length; i++) quadros[i].fim = quadros[i + 1].ini - quadros[i + 1].nome.length - 60;
    let n = 0;
    for (const Q of quadros) {
      const situacao = /^CLASSIFICA/.test(Q.nome) ? "Classificado" : /^DESCLASS/.test(Q.nome) ? "Desclassificado" : "Inabilitado";
      for (const m of corpo.slice(Q.ini, Q.fim).matchAll(PART)) {
        const nome = limpaCampo(m[2]).replace(/^(Sim|N[ãa]o)\b\s*/i, "").replace(/^[\d.,]+\s+/, "").trim();
        propostas.push({
          ref, nivel: "lote", descricao: b.descricao,
          ni: soDigitos(m[4]), alias: null, fornecedor: nome.slice(0, 160) || null,
          ordem: Number(m[1]), me_epp: /sim/i.test(m[8]), uf: null,
          marca: null, modelo: null, marca_declarada: false, quantidade: null,
          valor_inicial: num(m[5]), valor_final: num(m[6]), valor_total: num(m[6]), base_valor: "total",
          situacao, data_hora: null,
        });
        n++;
      }
    }
    if (n || itens.length) blocos.push(b);
  }
  // sem quadro de classificação em lote nenhum → não há disputa a afirmar
  const lances = [];
  return { achou: propostas.length > 0, gerador: "betha", blocos, propostas, lances };
}
