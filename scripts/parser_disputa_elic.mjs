// LEITOR DA DISPUTA — e-lic / compras.sc.gov.br (Estado de SC), "ATA DA SESSÃO PÚBLICA POR LOTE" (AtaSessaoPublicaLoteV2)
// e a variante POR ITEM. Lida em atas reais baixadas da API pública do portal (16/set/2026).
//
//   LICITANTES CPF/CNPJ Licitante E-mail LC 123/06
//     <CNPJ> <NOME> <e-mail> <Sim|Não>            ← roster: identidade + ME/EPP
//   ETAPA DE LANCES
//     Lote N - <nome do lote> Situação <s> Valor de referência R$ V Lance vencedor R$ V Data Licitante Valor Situação
//     <dd/mm/aaaa hh:mm:ss> <NOME> R$ <valor> [<MARCA>] <Válido|Inválido|Cancelado…>   (do mais recente ao mais antigo)
//   QUADRO DE RESULTADOS Licitante <NOME> CPF/CNPJ <cnpj> … Lote Valor <n> - <lote> R$ V … Subtotal … Total …
//
// O licitante aparece na linha do lance só pelo NOME; o CNPJ vem do roster (nome exato, o sistema escreve a mesma
// string). O lance mais ANTIGO de cada licitante no lote é a proposta inicial; o mais recente válido, o final.
// A ata não está no PNCP — chega ao acervo pelo coletor do e-lic (que passou a persistir o texto em 16/set).
const NBSP = String.fromCharCode(160);
const norm = (s) => String(s || "").split(NBSP).join(" ").replace(/\s+/g, " ");
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

const ROSTER = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+([\s\S]{2,160}?)\s+(\S+@\S+)\s+(Sim|N[ãa]o)\b/g;
const BLOCO = /(Lote|Item)\s+(\d{1,4})\s*-\s*([\s\S]{1,300}?)\s+Situa[çc][ãa]o\s+(\w[\w ]{0,30}?)\s+Valor de refer[êe]ncia\s+R\$\s*([\d.]+,\d{2,4})(?:\s+Lance vencedor\s+R\$\s*([\d.]+,\d{2,4}))?\s+Data\s+Licitante\s+Valor\s+Situa[çc][ãa]o/g;
const SIT = "V[áa]lido|Inv[áa]lido|Cancelad[oa]|Desclassificad[oa]|Recusad[oa]|Superad[oa]|Exclu[íi]d[oa]|Anulad[oa]";
const LANCE = new RegExp(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+([\s\S]{2,200}?)\s+R\$\s*([\d.]+,\d{2,4})\s*([\s\S]{0,120}?)\s*\b/.source + "(" + SIT + ")" + /\b/.source, "g");
const FIM_BLOCO = /\s(?:Lote|Item)\s+\d{1,4}\s*-\s[\s\S]{1,300}?\sSitua[çc][ãa]o\s|Ap[óo]s as fases de lance|QUADRO DE RESULTADOS|CHAT\s+Chat|Unidade compradora/;
const QUADRO = /QUADRO DE RESULTADOS\s+Licitante\s+([\s\S]{2,160}?)\s+CPF\/CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/g;

export function leDisputaElic(texto) {
  const t = norm(texto);
  if (!/ATA DA SESS[ÃA]O P[ÚU]BLICA/i.test(t) || !/ETAPA DE LANCES/i.test(t)) return { achou: false, gerador: "elic", blocos: [], propostas: [], lances: [] };

  // roster: nome → {ni, me}
  const roster = [];
  const secL = (/LICITANTES\s+CPF\/CNPJ\s+Licitante\s+E-mail\s+LC\s*123\/06([\s\S]*?)(?=ETAPA DE LANCES|QUADRO DE RESULTADOS|$)/i.exec(t) || [])[1] || "";
  for (const m of secL.matchAll(ROSTER)) roster.push({ ni: soDigitos(m[1]), nome: norm(m[2]).trim(), me: /sim/i.test(m[4]) });
  for (const m of t.matchAll(QUADRO)) { const nome = norm(m[1]).trim(), ni = soDigitos(m[2]); if (!roster.some((r) => r.ni === ni)) roster.push({ ni, nome, me: null }); }
  roster.sort((a, b) => b.nome.length - a.nome.length);   // o nome mais longo primeiro: "X LTDA ME" antes de "X LTDA"
  const acha = (frag) => { const f = norm(frag).trim(); return roster.find((r) => f === r.nome) || roster.find((r) => f.startsWith(r.nome)) || roster.find((r) => r.nome.startsWith(f) && f.length >= 8) || null; };
  // vencedor por lote (QUADRO DE RESULTADOS: "<n> - <lote> R$ V" dentro do bloco do licitante)
  const vencPorLote = new Map();
  for (const m of t.matchAll(QUADRO)) {
    const ni = soDigitos(m[2]);
    const trecho = t.slice(m.index + m[0].length, m.index + m[0].length + 3000);
    const fim = trecho.search(/Subtotal|QUADRO DE RESULTADOS|CHAT/); const corpo = fim > 0 ? trecho.slice(0, fim) : trecho;
    for (const q of corpo.matchAll(/(\d{1,4})\s*-\s*[\s\S]{1,200}?\s+R\$\s*([\d.]+,\d{2,4})/g)) vencPorLote.set(Number(q[1]), { ni, valor: num(q[2]) });
  }

  const blocos = [], propostas = [], lances = [];
  for (const b of t.matchAll(BLOCO)) {
    const nivel = /^Item$/i.test(b[1]) ? "item" : "lote";
    const n = Number(b[2]); const ref = `${nivel === "item" ? "I" : "L"}${n}`;
    const ini = b.index + b[0].length;
    const resto = t.slice(ini); const f = resto.search(FIM_BLOCO);
    const corpo = f > 0 ? resto.slice(0, f) : resto;
    const rows = [];
    for (const m of corpo.matchAll(LANCE)) {
      const r = acha(m[2]);
      const marca = norm(m[4]).replace(/^[-–]\s*/, "").trim();
      rows.push({ data_hora: m[1], ni: r?.ni || null, nome: r?.nome || norm(m[2]).trim(), valor: num(m[3]), marca: marca && marca.length <= 80 ? marca : null, situacao: m[5] });
    }
    if (!rows.length) continue;
    const bloco = { ref, lote: nivel === "lote" ? n : null, item: nivel === "item" ? n : null, nivel, descricao: norm(b[3]).slice(0, 600), situacao_lote: norm(b[4]), valor_ref: num(b[5]), lance_vencedor: b[6] ? num(b[6]) : null };
    blocos.push(bloco);
    // cronologia: a ata lista por valor/recência, não por tempo → ordena pela data-hora de verdade
    const chave = (d) => d.replace(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/, "$3-$2-$1 $4");
    rows.sort((a, b) => chave(a.data_hora).localeCompare(chave(b.data_hora)));
    rows.forEach((x, i) => lances.push({ ref, nivel, descricao: bloco.descricao, ordem: i + 1, data_hora: x.data_hora, valor: x.valor, tipo: i === 0 || !rows.slice(0, i).some((y) => y.ni === x.ni && y.nome === x.nome) ? "proposta" : "lance", ni: x.ni, alias: x.ni ? null : x.nome, fornecedor: x.nome, situacao: x.situacao, marca: x.marca }));
    const porLic = new Map();
    for (const x of rows) {
      const k = x.ni || "nome:" + x.nome.toLowerCase();
      const cur = porLic.get(k);
      if (!cur) porLic.set(k, { ...x, valor_inicial: x.valor, valor_final: /^v[áa]lido$/i.test(x.situacao) ? x.valor : null, marca: x.marca });
      else { if (/^v[áa]lido$/i.test(x.situacao)) cur.valor_final = x.valor; if (!cur.marca && x.marca) cur.marca = x.marca; }
    }
    const venc = vencPorLote.get(n);
    for (const [, x] of porLic) {
      const r = x.ni ? roster.find((z) => z.ni === x.ni) : null;
      propostas.push({
        ref, nivel, descricao: bloco.descricao,
        ni: x.ni, alias: x.ni ? null : x.nome, fornecedor: x.nome,
        me_epp: r ? r.me : null, uf: null, marca: x.marca, modelo: null, marca_declarada: !!x.marca,
        quantidade: null, valor_inicial: x.valor_inicial, valor_final: x.valor_final ?? x.valor_inicial, valor_total: null,
        base_valor: nivel === "lote" ? "total" : "unitario",
        situacao: venc && x.ni && venc.ni === x.ni ? "Arrematante" : null, data_hora: x.data_hora,
      });
    }
  }
  return { achou: propostas.length > 0, gerador: "elic", blocos, propostas, lances };
}
