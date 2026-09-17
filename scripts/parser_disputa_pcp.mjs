// LEITOR DA DISPUTA — PORTAL DE COMPRAS PÚBLICAS (AtaTotal / Ata Final).
//
// O que a ata do PCP carrega sobre a DISPUTA (lido em atas reais de 2025, não suposto):
//   1. "Propostas Enviadas" — por item (ou lote): TODOS os licitantes com CNPJ, data-hora, modelo, marca,
//      quantidade, valor unitário (coluna "Lance"), valor total e LC 123/2006 (Sim/Não = ME/EPP).
//   2. "Validade das Propostas" — roster limpo: <razão social> <CNPJ inteiro> <N> dias.
//   3. "Lances Enviados" — por item/lote: o HISTÓRICO inteiro — data-hora, valor, marcador "(proposta)",
//      "(lance oculto)", CNPJ inteiro, nome e situação (Válido/Inválido/Cancelado…).
//   4. "Classificação Parcial" — Classif. Fornecedor CPF/CNPJ Situação Valor Global (Arrematante/Desclassificado/…).
//
// ═══ POR QUE O PARSER ANTERIOR (parser_ecustomize.REC) RENDIA 1,7% ═══
// Ele ancorava em "<CNPJ inteiro> <data> - <hora>" contíguos. Na ata real o nome do fornecedor QUEBRA em 2–3
// linhas e o extrator de PDF INTERCALA as linhas da célula com as colunas vizinhas:
//   "JR CONSTRUCOES E 05.895.635/0001- 28/11/2025 - N/C N/C 1,00 R$1.349.245,49 R$ 1.349.245,49 Não
//    TERRAPLENAGEM 18 16:52:03 LTDA EPP"
// O CNPJ sai partido (prefixo "…/0001-" na 1ª linha, sufixo "18" na 2ª), a hora cai depois do Sim/Não, e o
// modelo também pode quebrar ("COLEÇÃO SEFE … CAMINHOS E VIVÊNCIAS"). A âncora contígua nunca casa.
//
// ═══ O MÉTODO ═══
// · A IDENTIDADE é o CNPJ; o NOME é atributo. O CNPJ inteiro se reconstrói do prefixo (10 dígitos) + sufixo
//   (2 dígitos que aparecem no rastro depois do Sim/Não) — e se confirma contra o roster de "Validade das
//   Propostas"/"Lances Enviados", onde ele vem inteiro. Nome vem do roster (limpo), nunca do miolo intercalado.
// · A linha da proposta é ancorada pelo que NÃO quebra: prefixo do CNPJ · data · trio numérico com "R$" · Sim/Não.
// · Modelo/marca são o miolo entre a data e a quantidade; a marca é a última unidade (mesma heurística do
//   leitor anterior — é o que dá para afirmar de texto achatado). "N/C" = sem marca declarada.
// · Lances: cada registro tem data-hora + valor + CNPJ inteiro + situação — âncora forte, sem heurística.
// · Item: o cabeçalho do bloco ("LOTE 0001 - ITEM 0002 - <desc>" ou "0001 - <desc>") dá o rótulo e a descrição;
//   quem casa com o item do PNCP é a fila (casaItens pela DESCRIÇÃO — a lição de pnigp-proposta-item-errado).
//   "0001 - LOTE GLOBAL" é disputa por LOTE: os lances valem para o lote, não para um item.
//
// Saída: { achou, gerador:'pcp', blocos:[{ref, rotulo, descricao, nivel}], propostas:[…], lances:[…], roster:Map }
const norm = (s) => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ");
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

// rodapé/cabeçalho de página do Portal — se intromete no meio das tabelas
const RODAPE = /P[áa]gina \d+ de \d+\s*A autenticidade do documento pode ser verificada no site\s*\S+\s*Documento gerado eletronicamente no Portal de Compras P[úu]blicas em \d{2}\/\d{2}\/\d{4} [àa]s \d{2}:\d{2}:\d{2}\.?\s*C[óo]digo verificador:\s*\w+|A autenticidade do documento[\s\S]{0,300}?C[óo]digo verificador:\s*\w+|P[áa]gina \d+ de \d+/gi;

// títulos de seção da ata (fronteiras)
const SECOES = /(Propostas Enviadas|Validade das Propostas|Lances Enviados|Arquivos Enviados pelos Fornecedores|Inten[çc][õo]es de Recurso|Classifica[çc][ãa]o Parcial|Classifica[çc][ãa]o Final|Chat\s+Data|Declara[çc][õo]es Obrigat[óo]rias|Documentos Anexados|Eventos d[oa]|Habilita[çc][ãa]o|Vencedores\s+C[óo]digo|Negocia[çc][õo]es|Troca de Mensagens|Inabilitados|Desclassificados|Documentos Habilita[çc][ãa]o)/g;

function secao(t, titulo) {
  const re = new RegExp(titulo, "i");
  const m = re.exec(t);
  if (!m) return null;
  const ini = m.index + m[0].length;
  SECOES.lastIndex = ini;
  let fim = t.length;
  for (const s of t.slice(ini).matchAll(SECOES)) { fim = ini + s.index; break; }
  return t.slice(ini, fim);
}

// cabeçalho de bloco (item ou lote) dentro de "Propostas Enviadas" / "Lances Enviados"
//   "LOTE 0001 - ITEM 0002 - <desc> Fornecedor CNPJ/CPF Data …"   → ref "0001/0002", nivel item
//   "0001 - <desc> Fornecedor CNPJ/CPF Data …"                     → ref "0001", nivel item
//   "0001 - LOTE GLOBAL Data Valor CNPJ Situação"                  → ref "0001", nivel lote
const CAB_PROP = /(?:LOTE\s+(\d{1,4})\s*-\s*ITEM\s+(\d{1,4})\s*-|(?:^|\s)(\d{4})\s*-)\s*([\s\S]{2,2500}?)\s+Fornecedor\s+CNPJ\s*\/\s*CPF\s+Data(?:\s+Modelo)?(?:\s+Marca\s*\/\s*Fabricante)?(?:\s+Quantidade)?(?:\s+(?:Melhor\s+)?Lance|\s+Valor(?:\s+Unit[áa]rio)?)?(?:\s+Valor\s+Total)?(?:\s+LC\s*123\s*\/\s*2006)?/g;
const CAB_LANCE = /(?:LOTE\s+(\d{1,4})\s*-\s*ITEM\s+(\d{1,4})\s*-|(?:^|\s)(\d{4})\s*-)\s*([\s\S]{2,2500}?)\s+Data\s+Valor\s+CNPJ\s+Situa[çc][ãa]o/g;

// linha de proposta — ancorada no que NÃO quebra
//  g1 prefixo CNPJ (10 díg. formatado)  g2 sufixo (opcional, quando não quebrou)  g3 data  g4 hora (opcional)
//  g5 miolo modelo+marca  g6 quantidade  g7 unitário  g8 total  g9 Sim/Não
// ⚠️ variantes vistas na base: (a) o unitário SEM "R$" e o total COM ("60 200,00 R$ 12.000,00"); (b) ata antiga
// sem a coluna LC 123/2006 → não há Sim/Não no fim. O "R$" do unitário e o Sim/Não são opcionais; o que ancora é
// o trio <qtd> <unit> R$ <total>.
const LINHA_PROP = /(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-)\s*(\d{2})?\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(?:(\d{2}:\d{2}:\d{2})\s+)?([\s\S]{0,160}?)\s+([\d.]+(?:,\d{1,4})?)\s+(?:R\$\s*)?([\d.]+,\d{2,4})\s+R\$\s*([\d.]+,\d{2,4})(?:\s+(Sim|N[ãa]o)\b)?/g;

// roster "Validade das Propostas": <nome> <CNPJ inteiro> <N> dias
const ROSTER = /([A-ZÀ-Ú0-9][^]{2,160}?)\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+(\d+)\s+dias/g;

// lance: <data> - <hora> <valor> [(marcador)] <CNPJ inteiro> - <nome…> <situação> [<resto do nome>]
const SITUACAO = "V[áa]lido|Inv[áa]lido|Cancelad[oa]|Exclu[íi]d[oa]|Desclassificad[oa]|Anulad[oa]|Rejeitad[oa]|Aceit[oa]";
const LINHA_LANCE = new RegExp(
  "(\\d{2}\\/\\d{2}\\/\\d{4})\\s*-\\s*(\\d{2}:\\d{2}:\\d{2})\\s+([\\d.]+,\\d{2,4})\\s*(?:\\(([^)]{1,40})\\))?\\s*(\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}|\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2})\\s*-\\s*([\\s\\S]{0,160}?)\\s+(" + SITUACAO + ")\\b([\\s\\S]{0,120}?)(?=\\s*\\d{2}\\/\\d{2}\\/\\d{4}\\s*-\\s*\\d{2}:\\d{2}:\\d{2}|\\s*(?:LOTE\\s+\\d{1,4}\\s*-|\\d{4}\\s*-\\s)|$)", "g");

// classificação parcial/final: <ordem>º <nome> <CNPJ> <situação> <valor global>
const LINHA_CLASSIF = /(\d{1,3})[ºo°]\s+([\s\S]{2,160}?)\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+(Arrematante|Desclassifi?cad[oa]|Inabilitad[oa]|Classifi?cad[oa]|Rejeitad[oa]|Habilitad[oa]|Vencedor[a]?)\s+([\d.]+,\d{2})/g;

const SEM_MARCA = /^(n\/?c|x|0|-|n[ãa]o se aplica|nao se aplica|pr[óo]pri[ao]|servi[çc]o|obra)$/i;

function blocos(sec, CAB) {
  const out = [];
  for (const m of sec.matchAll(CAB)) {
    const lote = m[1] ? Number(m[1]) : null, item = m[2] ? Number(m[2]) : null, solo = m[3] ? Number(m[3]) : null;
    const desc = norm(m[4]).trim();
    const global = /^LOTE\s+GLOBAL\b/i.test(desc) || (lote != null && item == null);
    out.push({
      ref: lote != null && item != null ? `${lote}/${item}` : String(solo ?? lote),
      lote, item: item ?? solo,
      descricao: desc.slice(0, 600),
      nivel: global ? "lote" : "item",
      ini: m.index + m[0].length, fim: sec.length,
    });
  }
  for (let i = 0; i + 1 < out.length; i++) out[i].fim = out[i + 1].ini - out[i + 1].descricao.length - 40;
  return out;
}

export function leDisputaPcp(texto) {
  let t = norm(texto).replace(RODAPE, " ").replace(/\s+/g, " ");
  const roster = new Map();   // ni (dígitos) → nome limpo
  const propostas = [], lances = [], classif = [];
  const blocosVistos = new Map();

  // 1) roster: Validade das Propostas (nome inteiro + CNPJ inteiro)
  const val = secao(t, "Validade das Propostas");
  if (val) {
    const v = val.replace(/^\s*Fornecedor\s+CPF\s*\/\s*CNPJ\s+Validade\s*\(conforme edital\)\s*/i, "");
    let prevEnd = 0;
    for (const m of v.matchAll(ROSTER)) {
      const nome = norm(v.slice(prevEnd, m.index) + " " + m[1]).replace(/^\d+\s+dias\s*/i, "").trim();
      prevEnd = m.index + m[0].length;
      const ni = soDigitos(m[2]);
      // a assinatura digital do PDF ("Assinado por 4 pessoas: …") cai dentro desta seção e viraria nome
      const limpo = nome.replace(/\b(?:Assinado|Documento assinado|Assinatura)\b[^]*$/i, "").trim();
      if (ni && limpo && !roster.has(ni)) roster.set(ni, limpo.slice(0, 160));
    }
  }

  // 2) Lances Enviados — histórico com CNPJ inteiro
  const lan = secao(t, "Lances Enviados");
  if (lan) {
    for (const b of blocos(lan, CAB_LANCE)) {
      blocosVistos.set(b.ref, b);
      const corpo = lan.slice(b.ini, b.fim);
      let ordem = 0;
      for (const m of corpo.matchAll(LINHA_LANCE)) {
        const ni = soDigitos(m[5]);
        const nome = norm(m[6] + " " + (m[8] || "")).replace(/\s+/g, " ").trim();
        if (!roster.has(ni) && nome) roster.set(ni, nome.slice(0, 160));
        const tag = (m[4] || "").toLowerCase();
        lances.push({
          ref: b.ref, nivel: b.nivel, descricao: b.descricao,
          ordem: ++ordem, data_hora: `${m[1]} ${m[2]}`, valor: num(m[3]),
          tipo: /proposta/.test(tag) ? "proposta" : /oculto/.test(tag) ? "lance_oculto" : /negocia/.test(tag) ? "negociado" : tag ? tag.slice(0, 30) : "lance",
          ni, fornecedor: roster.get(ni) || nome || null,
          situacao: m[7],
        });
      }
    }
  }

  // 3) Propostas Enviadas — todos os licitantes por item, com marca/modelo/qtd/LC123
  const prop = secao(t, "Propostas Enviadas");
  if (prop) {
    for (const b of blocos(prop, CAB_PROP)) {
      if (!blocosVistos.has(b.ref)) blocosVistos.set(b.ref, b);
      const corpo = prop.slice(b.ini, b.fim);
      const linhas = [...corpo.matchAll(LINHA_PROP)];
      for (let i = 0; i < linhas.length; i++) {
        const m = linhas[i];
        const prefixo = soDigitos(m[1]);                       // 10 dígitos
        let sufixo = m[2] || null;
        let hora = m[4] || null;
        // rastro entre esta linha e a próxima: "<nome linha 2> <sufixo> <hora> <resto>"
        const rastro = corpo.slice(m.index + m[0].length, i + 1 < linhas.length ? linhas[i + 1].index : corpo.length);
        if (!sufixo) { const s = /(?:^|\s)(\d{2})(?=\s+\d{2}:\d{2}:\d{2}|\s|$)/.exec(rastro); if (s) sufixo = s[1]; }
        if (!hora) { const h = /(\d{2}:\d{2}:\d{2})/.exec(rastro); if (h) hora = h[1]; }
        // identidade: prefixo+sufixo; confirma contra o roster (CNPJ inteiro visto em outra seção)
        let ni = sufixo ? prefixo + sufixo : null;
        if (!ni || !roster.has(ni)) { const cand = [...roster.keys()].filter((k) => k.startsWith(prefixo)); if (cand.length === 1) ni = cand[0]; }
        if (!ni) continue;   // sem identidade não se afirma
        const miolo = norm(m[5]).replace(/\bN\/C\b/gi, " ").trim();
        const toks = miolo ? miolo.split(" ") : [];
        const candMarca = toks.length ? toks[toks.length - 1] : null;
        const marca = candMarca && !SEM_MARCA.test(candMarca) ? candMarca : null;
        const modelo = toks.length > 1 ? toks.slice(0, -1).join(" ") : null;
        propostas.push({
          ref: b.ref, nivel: b.nivel, descricao: b.descricao,
          ni, fornecedor: roster.get(ni) || null,
          data_hora: hora ? `${m[3]} ${hora}` : m[3],
          modelo: modelo ? modelo.slice(0, 120) : null, marca: marca ? marca.slice(0, 80) : null,
          marca_declarada: /\bN\/C\b/i.test(m[5]) ? false : !!marca,
          quantidade: num(m[6]), valor_inicial: num(m[7]), valor_total: num(m[8]),
          me_epp: m[9] ? /sim/i.test(m[9]) : null,
        });
      }
    }
  }

  // 4) Classificação Parcial/Final — situação e valor global por fornecedor (por lote/item)
  const cls = secao(t, "Classifica[çc][ãa]o (?:Parcial|Final)");
  if (cls) {
    for (const m of cls.matchAll(LINHA_CLASSIF)) {
      const ni = soDigitos(m[3]);
      const nome = norm(m[2]).replace(/^(?:Classif\.|Fornecedor|CPF\/CNPJ|Situa[çc][ãa]o|¹|Valor Global)\s*/gi, "").trim();
      if (!roster.has(ni) && nome) roster.set(ni, nome.slice(0, 160));
      classif.push({ ordem: Number(m[1]), ni, situacao: m[4], valor_global: num(m[5]) });
    }
  }

  // valor FINAL de cada proposta = último lance válido daquele CNPJ no mesmo bloco (quando há histórico)
  const ultimo = new Map();
  for (const l of lances) if (/^v[áa]lido$/i.test(l.situacao)) ultimo.set(`${l.ref}|${l.ni}`, l.valor);
  for (const p of propostas) { const v = ultimo.get(`${p.ref}|${p.ni}`); p.valor_final = v != null ? v : null; }
  // situação por CNPJ (a classificação é do processo/lote; aplica-se ao fornecedor)
  const sit = new Map(); for (const c of classif) if (!sit.has(c.ni)) sit.set(c.ni, c.situacao);
  for (const p of propostas) p.situacao = sit.get(p.ni) || null;

  return {
    achou: propostas.length > 0 || lances.length > 0,
    gerador: "pcp",
    blocos: [...blocosVistos.values()].map(({ ref, lote, item, descricao, nivel }) => ({ ref, lote, item, descricao, nivel })),
    propostas, lances, classif, roster,
  };
}
