// LEITOR DA DISPUTA — COMPRASBR (AZ), "Ata de Realização do Pregão Eletrônico" / "…da Compra Direta Eletrônica".
//
// Lido em atas reais (2025). Por LOTE a ata traz:
//   <n> Val. Ref. Total: T Item: i Quant.: q Unidade: u Val. Ref.: v <descrição>   (um ou mais itens)
//   Propostas Iniciais Fornecedor (apelido) Valor  Licitante 01 25,9800 Licitante 02 25,9300 …
//   Eventos do Lote … Lances <data> <hora> Declaro iniciada a fase de LANCES. Licitante 04 Último Lance 18,0000 Licitante 03 Último Lance 13,8500 …
//   Habilitação … Habilitado o licitante <NOME> pelo motivo: … Inabilitado o licitante <NOME> pelo motivo: …
//   Adjudicação … Declaro adjudicado o pregão do lote N para o licitante <NOME> com o valor de R$ V.
//
// ⚠️ A AZ ANONIMIZA os licitantes na ata ("Licitante 04"): só o ADJUDICATÁRIO é nomeado, e os habilitados/
// inabilitados aparecem por nome sem o apelido. Então o que se afirma aqui é:
//   · quantos disputaram, a proposta inicial e o ÚLTIMO lance de cada apelido (identidade = alias, ni = null);
//   · o vencedor por nome e valor (a fila casa o nome/valor com item_resultado_sc — o CNPJ vem de lá);
//   · habilitado/inabilitado por NOME (sem apelido → não se liga à proposta; fica como situação do processo).
// Na compra direta o texto é um LOG de eventos ("Valor da proposta inicial do <NOME> CPNJ/CPF <ni> é de R$ V") —
// aí o licitante vem NOMEADO e com CNPJ; lê-se por evento.
// ⚠️ Texto guardado é truncado em 200.000 chars: ata grande perde a cauda (o que existir dela é lido).
const NBSP = String.fromCharCode(160);
const norm = (s) => String(s || "").split(NBSP).join(" ").replace(/\s+/g, " ");
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

const CAB_LOTE = /(?:^|\s)(\d{1,4})\s+Val\.\s*Ref\.\s*Total:\s*([\d.]+,\d{2})\s+Item:/g;
const ITEM = /Item:\s*(\d{1,5})\s+Quant\.:\s*([\d.]+(?:,\d+)?)\s+Unidade:\s*([^]{1,40}?)\s+Val\.\s*Ref\.:\s*([\d.]+,\d{2,4})\s+([\s\S]{2,1200}?)(?=\s+Item:\s*\d|\s+Propostas Iniciais|\s+Eventos do Lote|$)/g;
const PROP_INI = /Licitante\s+(\d{1,3})\s+([\d.]+,\d{2,4})(?=\s+Licitante\s+\d|\s+Eventos|\s|$)/g;
const ULT_LANCE = /Licitante\s+(\d{1,3})\s+[ÚU]ltimo Lance\s+([\d.]+,\d{2,4})/g;
const ADJ = /adjudicado o preg[ãa]o do lote\s+(\d{1,4})\s+para o licitante\s+([\s\S]{3,160}?)\s+com o valor de R\$\s*([\d.]+,\d{2,4})/gi;
const HAB = /(Habilitado|Inabilitado) o licitante\s+([\s\S]{3,160}?)\s+pelo motivo/gi;
// compra direta (log): "Valor da proposta inicial do <NOME> CPNJ/CPF <ni> é de R$ V" · "reajustou o valor do <n> para R$ V" · "Desclassificado o fornecedor <NOME> CPNJ/CPF <ni>"
const CD_PROP = /Valor da proposta inicial d[oa]\s+([\s\S]{3,160}?)\s+CP?NPJ\/CPF\s+(\d{11,14})\s+[ée] de R\$\s*([\d.]+,\d{2,4})/g;
const CD_DESCL = /Desclassificado o fornecedor\s+([\s\S]{3,160}?)\s+CP?NPJ\/CPF(?:\s+[A-Z]+\s+\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2})?\s+(\d{11,14})/g;

export function leDisputaAz(texto) {
  const t = norm(texto);
  const ehAta = /Ata de Realiza[çc][ãa]o d[ao] (?:Preg[ãa]o|Compra Direta|Dispensa|Concorr[êe]ncia)/i.test(t);
  if (!ehAta) return { achou: false, gerador: "az", blocos: [], propostas: [], lances: [] };

  const blocos = [], propostas = [], lances = [];
  const cabs = [...t.matchAll(CAB_LOTE)].map((m) => ({ lote: Number(m[1]), ref_total: num(m[2]), ini: m.index, fim: t.length }));
  for (let i = 0; i + 1 < cabs.length; i++) cabs[i].fim = cabs[i + 1].ini;

  for (const L of cabs) {
    const corpo = t.slice(L.ini, L.fim);
    const itens = [...corpo.matchAll(ITEM)].map((m) => ({ item: Number(m[1]), quantidade: num(m[2]), unidade: norm(m[3]).slice(0, 40), ref: num(m[4]), descricao: norm(m[5]).slice(0, 600) }));
    const ref = `L${L.lote}`;
    const b = { ref, lote: L.lote, item: itens.length === 1 ? itens[0].item : null, nivel: itens.length === 1 ? "item" : "lote", itens_doc: itens.map((i) => i.item),
      descricao: itens.length === 1 ? itens[0].descricao : itens.map((i) => i.descricao).join(" | ").slice(0, 600) };
    const iniProp = corpo.search(/Propostas Iniciais/i);
    const secProp = iniProp >= 0 ? corpo.slice(iniProp, corpo.search(/Eventos do Lote/i) > 0 ? corpo.search(/Eventos do Lote/i) : corpo.length) : "";
    const ultimos = new Map();
    for (const m of corpo.matchAll(ULT_LANCE)) ultimos.set(Number(m[1]), num(m[2]));
    const adj = [...corpo.matchAll(ADJ)].find((m) => Number(m[1]) === L.lote) || [...corpo.matchAll(ADJ)][0];
    const vencNome = adj ? norm(adj[2]).replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "").trim() : null;
    const vencValor = adj ? num(adj[3]) : null;
    const sit = new Map();
    for (const m of corpo.matchAll(HAB)) sit.set(norm(m[2]).replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "").trim().toUpperCase(), /^Habil/i.test(m[1]) ? "Habilitado" : "Inabilitado");
    let n = 0;
    for (const m of secProp.matchAll(PROP_INI)) {
      const alias = `Licitante ${m[1].padStart(2, "0")}`;
      const inicial = num(m[2]);
      const final = ultimos.has(Number(m[1])) ? ultimos.get(Number(m[1])) : inicial;
      // o vencedor é o apelido cujo último lance bate com o valor adjudicado (quando bate um só)
      const ehVenc = vencValor != null && Math.abs(final - vencValor) < 0.005 && [...ultimos.values()].filter((v) => Math.abs(v - vencValor) < 0.005).length === 1;
      propostas.push({
        ref, nivel: b.nivel, descricao: b.descricao,
        ni: null, alias, fornecedor: ehVenc ? vencNome : null,
        me_epp: null, uf: null, marca: null, modelo: null, marca_declarada: false,
        quantidade: itens.length === 1 ? itens[0].quantidade : null,
        valor_inicial: inicial, valor_final: final, valor_total: null,
        base_valor: itens.length === 1 ? "unitario" : "total",
        situacao: ehVenc ? "Adjudicado" : (ehVenc === false && vencNome && sit.get(vencNome.toUpperCase()) && false) || null,
        data_hora: null,
      });
      lances.push({ ref, nivel: b.nivel, descricao: b.descricao, ordem: ++n, data_hora: null, valor: inicial, tipo: "proposta", ni: null, alias, fornecedor: ehVenc ? vencNome : null, situacao: null });
      if (ultimos.has(Number(m[1]))) lances.push({ ref, nivel: b.nivel, descricao: b.descricao, ordem: ++n, data_hora: null, valor: final, tipo: "ultimo_lance", ni: null, alias, fornecedor: ehVenc ? vencNome : null, situacao: null });
    }
    if (n) blocos.push(b);
  }

  // compra direta: log nomeado com CNPJ
  if (!propostas.length && /Compra Direta/i.test(t)) {
    const seq = (/Sequ[êe]ncia:\s*(\d+)\s+Descri[çc][ãa]o:\s*([\s\S]{2,600}?)\s+Valor Estimado/i.exec(t) || []);
    const b = { ref: seq[1] ? `S${seq[1]}` : "S1", lote: null, item: null, nivel: "lote", itens_doc: [], descricao: seq[2] ? norm(seq[2]).slice(0, 600) : null };
    const descl = new Set([...t.matchAll(CD_DESCL)].map((m) => m[2]));
    let n = 0;
    for (const m of t.matchAll(CD_PROP)) {
      const ni = soDigitos(m[2]);
      propostas.push({ ref: b.ref, nivel: "lote", descricao: b.descricao, ni, alias: null, fornecedor: norm(m[1]).slice(0, 160), me_epp: null, uf: null, marca: null, modelo: null, marca_declarada: false,
        quantidade: null, valor_inicial: num(m[3]), valor_final: num(m[3]), valor_total: num(m[3]), base_valor: "total", situacao: descl.has(ni) ? "Desclassificado" : null, data_hora: null });
      lances.push({ ref: b.ref, nivel: "lote", descricao: b.descricao, ordem: ++n, data_hora: null, valor: num(m[3]), tipo: "proposta", ni, alias: null, fornecedor: norm(m[1]).slice(0, 160), situacao: null });
    }
    if (n) blocos.push(b);
  }
  return { achou: propostas.length > 0, gerador: "az", blocos, propostas, lances };
}
