// LEITOR DA DISPUTA — COMPRAS.GOV (Comprasnet 4.0), "Relatório - Termo de julgamento e habilitação" / "Ata de Julgamento".
//
// Lido em relatórios reais (UASG municipais de SC, 2023–2026). Por ITEM o relatório traz:
//   Item N - <descrição> Quantidade: Q [Valor estimado: R$ V (unitário) Unidade de fornecimento: U … Situação: …]
//   Propostas do Item N … Fornecedor Valor ofertado Situação
//     <CNPJ> - <NOME> … R$ <ofertado> … [situação] … [Marca/Fabricante: <m> Modelo/versão: <x>] Valor proposta: R$ <inicial>
//     Valor negociado: <Não Realizado|R$ …> Quantidade ofertada: <q> [R$ <total> (total)]
//   Lances do Item N Data/hora Participante Lance
//     <dd/mm/aaaa> [às] <hh:mm:ss> <CNPJ> R$ <valor>   (histórico inteiro, inclusive etapa fechada)
//   Mensagens do chat do Item N …
//
// ═══ TRÊS GERAÇÕES DO MESMO RELATÓRIO (medidas na base) ═══
//  2025+ : "<ID> - <nome> Benefício Me/Epp: Sim R$ v (unitário) Fornecedor … R$ t (total) habilitado Programa de integridade …
//           UF endereço: SC [Marca/Fabricante: … Modelo/versão: …] Valor proposta: R$ v (unitário) Valor negociado: … Quantidade ofertada: q R$ t (total)"
//  2024  : "<ID> - <nome> R$ v Proposta … desclassificada Porte MeEpp/Equiparada: Sim (D) Marca/Fabricante: … Valor proposta: R$ v
//           Valor negociado: Não informado Quantidade ofertada: q"
//  2023  : "<ID> - <nome> Não R$ v [Descrição detalhada: … Marca/Fabricante: … Modelo/versão: …] [Fornecedor habilitado]"
//
// O que vale aqui: TODO licitante tem CNPJ inteiro na própria linha (âncora forte, sem heurística de nome); a
// proposta INICIAL e o valor OFERTADO final vêm separados; a SITUAÇÃO é escrita em duas células achatadas
// ("Fornecedor … habilitado", "Proposta … desclassificada"). O nome QUEBRA e as palavras "Proposta"/"Fornecedor"
// da coluna Situação se intercalam nele — por isso a leitura é por FATIA: cada fatia começa num "<ID> - " e vai
// até o próximo; dentro dela, cada campo se lê pelo próprio rótulo, sem depender da ordem.
// Pessoa física aparece com CPF MASCARADO ("***.034.***-*1") — sem identidade; vai como alias, não como ni.
// O NÚMERO do item é o do Compras.gov, que alimenta o PNCP — é a chave natural; a descrição vai junto para a
// fila conferir (casaItens) e recusar o casamento quando o número não bater.
const NBSP = String.fromCharCode(160);
const norm = (s) => String(s || "").split(NBSP).join(" ").replace(/\s+/g, " ");
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

// cabeçalho de página que se intromete: "26/03/2026 16:21 1 de 4 UASG 988057 PREGÃO 90013/2026" e, na versão 2023,
// "22/06/2023 10:02 1 de 6 Relatório de Julgamento dos Itens da Licitação (…) SEI … / pg. 1 Uasg 453230 Pregão 198/2023"
const CAB_PAGINA = /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \d+ de \d+[\s\S]{0,220}?(?:UASG|Uasg) \d+ (?:PREG[ÃA]O|Preg[ãa]o|DISPENSA|Dispensa|CONCORR[ÊE]NCIA|Concorr[êe]ncia|INEXIGIBILIDADE|Inexigibilidade)[^\d]{0,30}\d+\/\d{4}/g;
const ID_SRC = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\*{3}\.\d{3}\.\*{3}-\*?\d{1,2}|\d{3}\.\d{3}\.\d{3}-\d{2})/.source;

const ITEM = /Item\s+(\d{1,4})\s*-\s*([\s\S]{2,1500}?)\s+Quantidade:\s*([\d.,]+)(?:\s+Valor estimado:\s*R\$\s*([\d.]+,\d{2,4}))?/g;
const SEC_PROP = /Propostas do Item\s+(\d{1,4})\b/g;
const SEC_LANCE = /Lances do Item\s+(\d{1,4})\b/g;
const FIM_ITEM = /Mensagens do chat do Item\s+\d+|Item\s+\d{1,4}\s*-\s|Propostas do Item\s+\d+|Lances do Item\s+\d+/;
const INICIO_PROP = new RegExp(ID_SRC + /\s*-\s/.source, "g");
const LINHA_LANCE = new RegExp(/(\d{2}\/\d{2}\/\d{4})\s+(?:[àa]s\s+)?(\d{2}:\d{2}:\d{2})\s+/.source + ID_SRC + /\s+R\$\s*([\d.]+,\d{2,4})/.source, "g");
const SIT_RE = /\b(desclassificad[ao]|inabilitad[ao]|adjudicad[ao]|homologad[ao]|habilitad[ao]|cancelad[ao]|recusad[ao])\b/i;

function lePropostaFatia(idRaw, fatia) {
  const ni = /\*/.test(idRaw) ? null : soDigitos(idRaw);
  // nome = do início até o primeiro "R$" (ou o Sim/Não que o precede na versão 2023), sem as células intercaladas
  const corte = fatia.search(/\s(?:Sim|N[ãa]o)\s+R\$|\sR\$\s|\sBenef[íi]cio Me\/Epp:/i);
  const nome = norm(corte > 0 ? fatia.slice(0, corte) : fatia.slice(0, 160))
    .replace(/\b(Proposta|Fornecedor|desclassificada|adjudicada|habilitado|inabilitado)\b/gi, " ")
    .replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "").replace(/\s+/g, " ").trim();
  const ofertado = (/R\$\s*([\d.]+,\d{2,4})/.exec(fatia) || [])[1];
  const me = (/(?:Benef[íi]cio Me\/Epp|Porte MeEpp\/Equiparadas?):\s*(Sim|N[ãa]o)/i.exec(fatia) || /\s(Sim|N[ãa]o)\s+R\$/i.exec(fatia) || [])[1];
  const semDesc = fatia.replace(/Descri[çc][ãa]o detalhada:[\s\S]*?(?=Marca\/Fabricante:|$)/i, " ");
  const sit = (SIT_RE.exec(semDesc) || [])[1];
  const situacao = !sit ? null : /^desclass/i.test(sit) ? "Desclassificado" : /^inabil/i.test(sit) ? "Inabilitado"
    : /^habil/i.test(sit) ? "Habilitado" : /^adjud/i.test(sit) ? "Adjudicado" : /^homolog/i.test(sit) ? "Homologado" : sit;
  const uf = (/UF endere[çc]o:\s*([A-Z]{2})\b/i.exec(fatia) || [])[1] || null;
  const marca = (/Marca\/Fabricante:\s*([\s\S]{1,80}?)\s+Modelo\/vers[ãa]o:/i.exec(fatia) || [])[1] || null;
  const modelo = (/Modelo\/vers[ãa]o:\s*([\s\S]{1,120}?)(?=\s+Valor proposta:|\s+Valor negociado:|\s+Quantidade ofertada:|\s+Fornecedor habilitado|$)/i.exec(fatia) || [])[1] || null;
  const inicial = (/Valor proposta:\s*R\$\s*([\d.]+,\d{2,4})/i.exec(fatia) || [])[1];
  const negociado = (/Valor negociado:\s*R\$\s*([\d.]+,\d{2,4})/i.exec(fatia) || [])[1];
  const qtd = (/Quantidade ofertada:\s*([\d.,]+)/i.exec(fatia) || [])[1];
  const total = (/Quantidade ofertada:\s*[\d.,]+\s+R\$\s*([\d.]+,\d{2,4})\s*\(total\)/i.exec(fatia) || [])[1];
  if (!ofertado) return null;
  return {
    ni, alias: ni ? null : idRaw, fornecedor: nome.slice(0, 160) || null,
    me_epp: me ? /sim/i.test(me) : null, uf,
    marca: marca ? norm(marca).slice(0, 80) : null, modelo: modelo ? norm(modelo).slice(0, 120) : null, marca_declarada: !!marca,
    quantidade: qtd ? num(qtd) : null, valor_inicial: inicial ? num(inicial) : num(ofertado),
    valor_final: negociado ? num(negociado) : num(ofertado), valor_total: total ? num(total) : null,
    situacao, data_hora: null,
  };
}

export function leDisputaComprasGov(texto) {
  const t = norm(texto).replace(CAB_PAGINA, " ").replace(/\s+/g, " ");
  if (!/Propostas do Item|Lances do Item/i.test(t)) return { achou: false, gerador: "comprasgov", blocos: [], propostas: [], lances: [] };

  // itens declarados (número → descrição, quantidade, estimado)
  const itens = new Map();
  for (const m of t.matchAll(ITEM)) {
    const n = Number(m[1]);
    if (!itens.has(n)) itens.set(n, { ref: String(n), item: n, nivel: "item", descricao: norm(m[2]).slice(0, 600), quantidade: num(m[3]), estimado: m[4] ? num(m[4]) : null });
  }
  const propostas = [], lances = [], blocos = new Map();
  const bloco = (n) => { if (!blocos.has(n)) blocos.set(n, itens.get(n) || { ref: String(n), item: n, nivel: "item", descricao: null }); return blocos.get(n); };

  for (const s of t.matchAll(SEC_PROP)) {
    const n = Number(s[1]); const b = bloco(n);
    const ini = s.index + s[0].length;
    const resto = t.slice(ini); const f = resto.search(FIM_ITEM);
    const corpo = f > 0 ? resto.slice(0, f) : resto;
    const inicios = [...corpo.matchAll(INICIO_PROP)];
    for (let i = 0; i < inicios.length; i++) {
      const m = inicios[i];
      const fatia = corpo.slice(m.index + m[0].length, i + 1 < inicios.length ? inicios[i + 1].index : corpo.length);
      const p = lePropostaFatia(m[1], fatia);
      if (p) propostas.push({ ref: b.ref, nivel: "item", descricao: b.descricao, ...p });
    }
  }
  for (const s of t.matchAll(SEC_LANCE)) {
    const n = Number(s[1]); const b = bloco(n);
    const ini = s.index + s[0].length;
    const resto = t.slice(ini); const f = resto.search(FIM_ITEM);
    const corpo = f > 0 ? resto.slice(0, f) : resto;
    let ordem = 0;
    for (const m of corpo.matchAll(LINHA_LANCE)) {
      const ni = /\*/.test(m[3]) ? null : soDigitos(m[3]);
      lances.push({ ref: b.ref, nivel: "item", descricao: b.descricao, ordem: ++ordem, data_hora: `${m[1]} ${m[2]}`, valor: num(m[4]), tipo: "lance", ni, alias: ni ? null : m[3], fornecedor: null, situacao: null });
    }
  }
  // nome do licitante nos lances = o da proposta do mesmo CNPJ
  const nomes = new Map(); for (const p of propostas) if (p.ni && p.fornecedor) nomes.set(p.ni, p.fornecedor);
  for (const l of lances) if (l.ni) l.fornecedor = nomes.get(l.ni) || null;

  return { achou: propostas.length > 0 || lances.length > 0, gerador: "comprasgov", blocos: [...blocos.values()], propostas, lances };
}
