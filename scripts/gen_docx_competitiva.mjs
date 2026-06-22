// Gera o .docx da Análise Competitiva (Node puro, sem dependência). node scripts/gen_docx_competitiva.mjs
import fs from "fs"; import path from "path"; import { deflateRawSync } from "zlib"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const locals = [], central = []; let off = 0;
  for (const f of files) {
    const nb = Buffer.from(f.name, "utf8"), comp = deflateRawSync(f.data), crc = crc32(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(nb.length, 26);
    locals.push(lh, nb, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nb); off += lh.length + nb.length + comp.length;
  }
  const cd = Buffer.concat(central), lb = Buffer.concat(locals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(lb.length, 16);
  return Buffer.concat([lb, cd, eocd]);
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function runs(texto) { // **negrito** inline
  return texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((seg) => {
    const b = /^\*\*(.+)\*\*$/.exec(seg);
    return `<w:r><w:rPr>${b ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${esc(b ? b[1] : seg)}</w:t></w:r>`;
  }).join("");
}
function para(b) {
  if (b.t === "h1") return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="0F766E"/></w:rPr><w:t xml:space="preserve">${esc(b.x)}</w:t></w:r></w:p>`;
  if (b.t === "h2") return `<w:p><w:pPr><w:spacing w:before="220" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="155E63"/></w:rPr><w:t xml:space="preserve">${esc(b.x)}</w:t></w:r></w:p>`;
  if (b.t === "label") return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">${esc(b.x)}</w:t></w:r></w:p>`;
  if (b.t === "bullet") return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="40"/></w:pPr>${runs(b.x)}</w:p>`;
  if (b.t === "table") {
    const cell = (txt, head) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${head ? '<w:shd w:val="clear" w:fill="0F766E"/>' : ""}</w:tcPr><w:p><w:pPr><w:spacing w:after="20"/></w:pPr><w:r><w:rPr>${head ? '<w:b/><w:color w:val="FFFFFF"/>' : ""}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(txt)}</w:t></w:r></w:p></w:tc>`;
    const tr = (cells, head) => `<w:tr>${cells.map((c) => cell(c, head)).join("")}</w:tr>`;
    const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>${tr(b.head, true)}${b.rows.map((r) => tr(r, false)).join("")}</w:tbl><w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
  }
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs(b.x)}</w:p>`;
}

const B = [
  { t: "h1", x: "PNIGP — Análise Competitiva de Mercado" },
  { t: "p", x: "Plataforma Nacional de Inteligência de Gestão Pública · Instituto I10 · Junho/2026" },
  { t: "p", x: "Documento interno. Base: pesquisa de mercado em 3 frentes (captação, benchmarking municipal, ERPs/GovTech) com verificação cruzada de fontes." },

  { t: "h2", x: "1. Sumário executivo" },
  { t: "p", x: "O mercado de dados e inteligência para gestão pública municipal está dividido em cinco camadas que não conversam entre si: captação de recursos, benchmarking, ERPs transacionais, GovTechs de IA/atendimento e inteligência de mercado B2B." },
  { t: "p", x: "Nenhum concorrente reúne, sobre dados abertos e de forma comparável entre municípios, a combinação que define o PNIGP: compras item a item (preço unitário real), captação de recursos federais, saúde e educação unidade a unidade com geo e série histórica, e a venda de estudos para a iniciativa privada (B2B). Cada eixo isolado tem ocupantes; a combinação integrada permanece vazia — e contorna os ERPs por usar dado público." },
  { t: "label", x: "Três conclusões para a estratégia:" },
  { t: "bullet", x: "A camada captação operacional + comparação entre municípios está sendo disputada (**QIATech/+Convénios** é o nome a vigiar) — precisamos chegar primeiro com a integração ao resto da gestão." },
  { t: "bullet", x: "Existe um **piso gratuito** robusto (Portal da Transparência 2026 + CNM Êxitos). Todo valor pago precisa ficar acima dele: consolidação, alertas, matching e compliance." },
  { t: "bullet", x: "Os dois eixos mais vazios e defensáveis são **preço unitário comparável entre municípios** e **estudos B2B sobre gasto público**." },

  { t: "h2", x: "2. Mapa do mercado" },
  { t: "table", head: ["Camada", "O que fazem", "Players principais"], rows: [
    ["A. Captação / emendas", "Encontrar e operar recursos federais", "QIATech/+Convénios, Gestor de Convénios, CNM Êxitos (grátis), Portal da Transparência (grátis), Squadra, Orzil"],
    ["B. Benchmarking municipal", "Comparar indicadores entre municípios", "Meu Município, Cidade Única (FIESC), Datapedia, FGV Municípios, inteli.gente, CLP Ranking, ICE"],
    ["C. ERPs de gestão pública", "Operar a prefeitura (contábil, folha, tributos, compras)", "IPM, GOVBR, Betha, Fiorilli, Elotech"],
    ["D. GovTech de IA / gabinete", "Atendimento ao cidadão, CRM de mandato", "GovTools, Conecta Gabinete"],
    ["E. B2B sobre dado público", "Estudos / inteligência de mercado", "4MTI; geomarketing (Cortex, Geofusion, Neoway) usa consumo, não gasto público"],
  ] },

  { t: "h2", x: "3. Avaliação de ameaças (ranqueada)" },
  { t: "label", x: "1. QIATech / +Convénios — a mais perigosa" },
  { t: "p", x: "IA que mapeia oportunidades, gera propostas, calcula potencial não captado e oferece Ranking de Eficiência comparando a captação do município com as cidades da região. Integra TransfereGov, SIMEC, FNS, Sismob, Sigcon. É quem mais se aproxima da nossa tese (captação com comparação inter-municipal). Porte, preço e cobertura não divulgados — validar." },
  { t: "label", x: "2. Gestor de Convénios — concorrente direto, porém frágil" },
  { t: "p", x: "Cobre a jornada: emenda por CNPJ, panorama TransfereGov, CAUC, gerador de Plano de Trabalho (PDF), alertas, radar de +200 programas. Vulnerabilidades: empresa opaca e provavelmente minúscula (Tocantins), sem preço público, sem profundidade fiscal (não ingere empenhado/liquidado/pago), moat de dados raso." },
  { t: "label", x: "3. Gove (gove.digital) — o mais próximo no eixo indicadores" },
  { t: "p", x: "≈50 indicadores comparáveis + Ranking de Competitividade (com o CLP). Porém atrelado ao ERP financeiro (não é 100% dado aberto), foco em finanças, sem item a item, sem B2B." },
  { t: "label", x: "4. O piso gratuito — ameaça estrutural (não comercial)" },
  { t: "p", x: "Portal da Transparência 2026: emendas RP6–RP9 por autor/UF/município/CNPJ, empenho × liquidação × pagamento com evolução diária, detalhe da emenda Pix. CNM Plataforma Êxitos: radar de editais grátis para filiados. Qualquer produto pago precisa entregar acima desse piso." },
  { t: "label", x: "Não são ameaça real" },
  { t: "p", x: "Central das Emendas (transparência cívica), Conjunta (educação para OSCs), Squadra e Orzil (consultoria/treinamento, não escalam), GovTools e Conecta Gabinete (atendimento/CRM, não inteligência de dados)." },

  { t: "h2", x: "4. Matriz de capacidades" },
  { t: "table", head: ["Capacidade", "Benchmarkers", "Captação", "ERPs", "PNIGP"], rows: [
    ["Compras item a item (preço unitário)", "Não", "Não", "Parcial (só do ente)", "Sim"],
    ["Escola/estabelecimento a estabelecimento + geo", "Não", "Não", "Parcial (intra-município)", "Sim"],
    ["Captação de recursos federais", "Não", "Sim", "Não", "Sim"],
    ["Matching captação ↔ gargalo por área", "Não", "Não", "Não", "Sim"],
    ["Série histórica granular", "Parcial", "Não", "Não", "Sim"],
    ["Comparação entre municípios", "Sim", "Parcial (QIATech)", "Não (silos)", "Sim"],
    ["Estudos B2B de gasto público", "Não", "Não", "Não", "Sim (tese)"],
    ["Natureza do dado", "Secundário, agregado, anual", "Aberto, nível convênio", "Bruto, em silo por cliente", "Aberto, granular, atual"],
  ] },

  { t: "h2", x: "5. Inteligência de preços (o que é público)" },
  { t: "table", head: ["Produto", "Preço observado"], rows: [
    ["Datapedia", "Municipal R$ 1.200/ano · Estadual R$ 3.000 · Gabinete R$ 50.000/ano"],
    ["Legislapp (monitoramento legislativo)", "R$ 49,90/mês individual; grátis p/ ONGs"],
    ["Gestor de Convénios, QIATech, Gove, Meu Município (Otimiza)", "Sob demonstração (não divulgam)"],
    ["Portal da Transparência, CNM Êxitos, inteli.gente, ICE, CLP", "Gratuitos"],
  ] },
  { t: "p", x: "A opacidade de preço dos concorrentes diretos é uma oportunidade de confiança: transparência comercial é um diferencial onde o concorrente mais próximo (Gestor de Convénios) é frágil." },

  { t: "h2", x: "6. O espaço em aberto (nosso moat)" },
  { t: "p", x: "Nenhum player único reúne, 100% sobre dados abertos e comparável entre municípios: preço unitário item a item + radar de captação + saúde/educação granular + geo + série + monetização B2B." },
  { t: "label", x: "Os dois eixos mais vazios e defensáveis:" },
  { t: "bullet", x: "**Preço unitário comparável entre municípios** — as ferramentas atuais servem ao comprador ou ao fornecedor, nunca à comparação neutra que revela sobrepreço/economia." },
  { t: "bullet", x: "**Estudos B2B sobre gasto público municipal** — o geomarketing usa dados de consumo, não de gasto público. Ninguém vende inteligência de mercado a partir da granularidade da gestão pública." },
  { t: "label", x: "Por que os ERPs (que têm o dado bruto) não ocupam esse espaço:" },
  { t: "bullet", x: "Arquitetura single-tenant (uma instância por prefeitura) exigiria reengenharia." },
  { t: "bullet", x: "O dado é contratualmente do ente, sob LGPD/sigilo." },
  { t: "bullet", x: "Conflito de incentivo — clientes vizinhos competem por recursos e imagem; expor um ao outro é antiproduto." },

  { t: "h2", x: "7. Recomendações estratégicas" },
  { t: "bullet", x: "**Chegar primeiro na integração.** QIATech constrói captação + comparação; nosso troco é integrar captação ao resto da gestão (compras, saúde, educação, gargalos)." },
  { t: "bullet", x: "**Entregar acima do piso gratuito**: consolidação cross-fonte, alertas de prazo, matching gargalo→programa→emenda e gestão de compliance da Resolução 370/2025 (municípios podem ficar sem receber emendas em 2026 se não adequarem a transparência)." },
  { t: "bullet", x: "**Cravar os dois eixos vazios**: preço unitário comparável + estudos B2B." },
  { t: "bullet", x: "**Posicionar a transparência comercial** como diferencial (vs. concorrentes sem preço público)." },
  { t: "bullet", x: "**Não temer os ERPs** no curto prazo, mas projetar a base sempre sobre dado aberto para não depender deles." },

  { t: "h2", x: "8. Incertezas a validar" },
  { t: "bullet", x: "Porte, preço e cobertura reais de QIATech/+Convénios e Gestor de Convénios." },
  { t: "bullet", x: "Cadência real de atualização das bases dos concorrentes." },
  { t: "bullet", x: "Status do Painel de Preços federal (indício de descontinuação em jul/2025)." },
  { t: "bullet", x: "Publicação do ICE 2024 (contratado, ainda não publicado)." },
  { t: "bullet", x: "Long-tail de govtechs regionais (rodada dirigida aos TCEs)." },

  { t: "h2", x: "9. Fontes (principais)" },
  { t: "p", x: "Captação: gestordeconvenios.com.br · qiatech.com.br · centraldasemendas.info · conjunta.org · consultoriasquadra.com.br · orzil.org · portaldatransparencia.gov.br/emendas · plataformaexitos.com.br" },
  { t: "p", x: "Benchmarking: meumunicipio.org.br · cidadeunica.com.br · datapedia.info · municipios.fgv.br · inteligente.mcti.gov.br · rankingdecompetitividade.org.br · ice.enap.gov.br" },
  { t: "p", x: "ERPs/GovTech: ipm.com.br · governancabrasil.com.br · betha.com.br · fiorilli.com.br · elotech.com.br · gove.digital · startgov.com.br · 4mti.com.br · conectagabinete.com.br" },
  { t: "p", x: "Metodologia: pesquisa web com navegação ao vivo e verificação cruzada, jun/2026. Itens não confirmados estão na seção 8. Documento vivo." },
];

// numbering (bullets)
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
const body = B.map(para).join("");
const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;
const buf = zip([
  { name: "[Content_Types].xml", data: Buffer.from(ct, "utf8") },
  { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
  { name: "word/document.xml", data: Buffer.from(document, "utf8") },
  { name: "word/numbering.xml", data: Buffer.from(numbering, "utf8") },
  { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
]);
const out = path.join(__dirname, "..", "docs", "analise-competitiva-2026-06.docx");
fs.writeFileSync(out, buf);
console.log("✓ gerado:", out, "·", Math.round(buf.length / 1024), "KB");
