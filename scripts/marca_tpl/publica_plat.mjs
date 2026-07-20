// PARSER DETERMINÍSTICO DE MARCA POR ITEM — plataforma "Pública Tecnologia" (contratacoes_sc.plataforma ILIKE
// 'Pública Tecnologia%', ~11.835 processos). SEM rede / SEM LLM. Engenharia reversa de 140 exemplares (2026-07-20).
//
// ⚠️ ACHADO ESTRUTURAL (medido no banco): "Pública Tecnologia" é o ERP que PUBLICA no PNCP; os documentos de
// resultado que carregam MARCA são gerados pelo **Portal de Compras Públicas / ComprasNet** (o município roda a
// sessão lá). A grande maioria dos processos da célula NÃO publica marca por item — os documentos são "Termo de
// Homologação" curtos (Fornecedor + Modelo + valores, SEM coluna Marca), tabelas SINAPI/quantidade, ou pesquisa de
// preços. Universo com marca de item na célula (survey em 46.104 docs / 11.994 procs): Marca/Fabricante ~131 procs;
// Betha chave-valor ~248 procs. Este parser cobre esses dois, com precisão > recall (melhor 40% certo que 90% lixo).
//
//  T1 — "TERMO DE HOMOLOGAÇÃO UASG … PREGÃO …" (Portal/ComprasNet). Lista TODAS as propostas por item, cada uma:
//         <CNPJ> - <NOME> … R$ <ofertado> (unitário) … <status> Marca/Fabricante: <MARCA> Modelo/versão: <MODELO>
//         Valor proposta: … [se vencedor:] adjudicada, melhor lance: R$ <lance>, valor negociado: R$ <negociado>
//       VENCEDOR = bloco cuja <status> é "adjudicada". Âncora dupla: nome do fornecedor da API (tokens) + valor
//       (negociado, senão ofertado) == unit_homologado. Só emite quando o fornecedor casa; descarta o resto.
//
//  T3 — Betha chave-valor ("Item: N … Valor Unit.: X … Marca: Y Modelo: Z"). Âncora pelo NÚMERO do item == numero
//       da API (evita colisão de preço entre item de produto e de serviço). Em produção esses docs vão ao
//       parser_betha; incluído para a plataforma ficar coberta quando este parser é chamado direto.
//
//  T2 — "ATA FINAL … Vencedores: Código Produto Fornecedor Modelo Marca/Fabricante …" (tabela achatada, SEM
//       delimitador). NÃO extraído: sem âncora confiável para separar colunas no PDF achatado, e a marca do
//       vencedor é ~sempre "própria" (→ null). Documentado, ver relatório.
//
// FALSOS POSITIVOS tratados: "própria/marca propria", "N/C", "serviço/obra" (normalizaMarca); "marca de
// referência", "conforme edital", "logomarca", "MARCADOR" (exame), placeholders numéricos e descrição vazada.
import { normalizaMarca } from "../mapa_atas_plataformas.mjs";

const numBR = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const eq = (a, b) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(0.01, a * 0.005);

const STOP = new Set(["ltda", "eireli", "epp", "me", "sa", "cia", "comercio", "comércio", "servicos", "serviços",
  "servico", "serviço", "industria", "indústria", "e", "de", "da", "do", "dos", "das", "ltd", "distribuidora",
  "produtos", "materiais", "material", "empresa", "com", "ind"]);
function tokens(nome) {
  return new Set(String(nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}
function nomeCasa(apiNome, txtNome) {
  const a = tokens(apiNome), b = tokens(txtNome);
  if (!a.size || !b.size) return false;
  let inter = 0; for (const w of a) if (b.has(w)) inter++;
  return inter >= 1;
}
// marca "própria" disfarçada: o token da marca É o nome do próprio fornecedor (confecção/concreto que assinam com o
// nome da empresa). Medido: "PROROUPAS"↔"PROROUPAS CONFECCOES", "Minerocha"↔"MINEROCHA CATARINENSE". → trata como null.
function marcaEhPropria(marca, fornecedor) {
  const mt = tokens(marca); if (!mt.size) return false;
  const ft = tokens(fornecedor); if (!ft.size) return false;
  for (const w of mt) if (!ft.has(w)) return false;   // todo token da marca está no nome do fornecedor
  return true;
}

function marcaLimpa(raw) {
  let m = String(raw || "").replace(/\s+/g, " ").trim();
  m = m.replace(/\b(Modelo|Vers[ãa]o|Valor|Quantidade|Fornecedor|Propostas?|Situa[çc][aã]o)\b.*$/i, "").trim();
  m = m.replace(/[.,;:\-\/]+$/, "").replace(/^[.,;:\-\/]+/, "").trim();
  if (!m) return null;
  if (/^\d+([.,]\d+)?$/.test(m)) return null;                 // placeholder numérico
  if (m.length < 2 || m.length > 45) return null;
  if (m.split(/\s+/).length > 6) return null;
  if (/refer[êe]ncia|conforme|edital|termo de|n[aã]o se aplica|a definir|catalogo|catálogo|unidade|gen[ée]ric|descri[çc]/i.test(m)) return null;
  return normalizaMarca(m);                                   // "própria/serviço/N-C/-/sem marca" → null
}

// ————————————————————————————————————————————————————————————————————————————————————————————————————
// T1 — vencedor = bloco "…adjudicada Marca/Fabricante: M Modelo/versão: …". Captura fornecedor (CNPJ-nome antes),
// marca, e valor efetivo (negociado, senão melhor lance/ofertado). Âncora forte por NOME do fornecedor da API.
const T1_WIN = /adjudicada\s+Marca\s*\/\s*Fabricante\s*:\s*([\s\S]{0,55}?)\s*Modelo\s*\/\s*vers[ãa]o\s*:/gi;
function parseT1(texto, itensApi) {
  const t = texto.replace(/\s+/g, " ");
  if (!/adjudicada\s+Marca\s*\/\s*Fabricante/i.test(t)) return null;
  const wins = [];
  for (const m of t.matchAll(T1_WIN)) {
    const marca = marcaLimpa(m[1]);
    if (!marca) continue;
    const antes = t.slice(Math.max(0, m.index - 500), m.index);
    const depois = t.slice(m.index, m.index + 900);
    // fornecedor: último "<CNPJ 14 díg> - <NOME>" antes do bloco
    const fs = [...antes.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*-\s*([A-Z0-9][^\n]{2,70}?)(?=\s+(?:Benef[íi]cio|R\$|UF\b|Marca))/gi)];
    const nome = fs.length ? fs[fs.length - 1][1] : "";
    // valor efetivo: valor negociado > melhor lance > ofertado (última "(unitário)" antes do rótulo)
    let unit = 0;
    const neg = depois.match(/valor\s+negociado\s*:\s*R\$\s*([\d.]+,\d{2,4})/i);
    const lance = depois.match(/melhor\s+lance\s*:\s*R\$\s*([\d.]+,\d{2,4})/i);
    const of = [...antes.matchAll(/R\$\s*([\d.]+,\d{2,4})\s*\(unit/gi)];
    if (neg && !/n[ãa]o\s+realizado/i.test(neg[0])) unit = numBR(neg[1]);
    else if (lance) unit = numBR(lance[1]);
    else if (of.length) unit = numBR(of[of.length - 1][1]);
    wins.push({ marca, nome, unit });
  }
  if (!wins.length) return null;
  const out = [], usados = new Set();
  for (const it of itensApi) {
    const U = Number(it.unit_homologado) || 0;
    // 1) casa por NOME do fornecedor (âncora forte)
    const porNome = wins.filter((w, i) => !usados.has(i) && nomeCasa(it.fornecedor, w.nome));
    let pick = null, conf = null, idx = -1;
    if (porNome.length === 1) { pick = porNome[0]; conf = eq(pick.unit, U) ? "alta" : "media"; }
    else if (porNome.length > 1) {
      const uh = porNome.filter((w) => eq(w.unit, U));
      if (uh.length === 1) { pick = uh[0]; conf = "alta"; }         // mesmo fornecedor, desambigua por valor
    }
    if (!pick) {
      // 2) sem nome: só aceita se o valor bate e é ÚNICO (senão ambíguo → descarta)
      const porVal = wins.filter((w, i) => !usados.has(i) && eq(w.unit, U) && U > 0);
      const marcas = new Set(porVal.map((w) => w.marca.toLowerCase()));
      if (porVal.length && marcas.size === 1) { pick = porVal[0]; conf = "media"; }
    }
    if (!pick) continue;
    idx = wins.indexOf(pick); if (idx >= 0) usados.add(idx);
    if (marcaEhPropria(pick.marca, it.fornecedor)) continue;   // marca == nome do fornecedor → própria → null
    out.push({ numero: Number(it.numero), marca: pick.marca, modelo: null, valorUnit: U || null, confianca: conf, template: "publica" });
  }
  return out.length ? out : null;
}

// ————————————————————————————————————————————————————————————————————————————————————————————————————
// T3 — Betha chave-valor. Âncora pelo NÚMERO do item ("Item: N … Valor Unit.: X … Marca: M Modelo: D").
const T3_BLOCO = /Item:\s*(\d{1,4})\b[\s\S]{0,600}?Valor\s*Unit\.?:\s*([\d.]+,\d{2})[\s\S]{0,120}?Marca:\s*([^\n]{0,40}?)\s*Modelo:\s*([^\n]{0,40}?)(?=\s*(?:Item:|Valor\s*Unit|Total\s*Geral|Ata\b|$))/gi;
function parseT3(texto, itensApi) {
  const t = texto.replace(/\s+/g, " ");
  if (!/Valor\s*Unit\.?:[\s\S]{0,150}?Marca:/i.test(t)) return null;
  const porNum = new Map();
  for (const m of t.matchAll(T3_BLOCO)) {
    const numero = parseInt(m[1], 10);
    const unit = numBR(m[2]);
    const marca = marcaLimpa(m[3]);
    if (!marca) continue;
    const modelo = marcaLimpa(m[4]);
    if (!porNum.has(numero)) porNum.set(numero, { unit, marca, modelo });
  }
  if (!porNum.size) return null;
  const out = [];
  for (const it of itensApi) {
    const c = porNum.get(Number(it.numero));
    if (!c) continue;
    if (marcaEhPropria(c.marca, it.fornecedor)) continue;
    const U = Number(it.unit_homologado) || 0;
    // confirma pelo valor quando existir (não obrigatório: o número do item já é a âncora)
    const conf = eq(c.unit, U) ? "alta" : "media";
    out.push({ numero: Number(it.numero), marca: c.marca, modelo: c.modelo || null, valorUnit: U || null, confianca: conf, template: "publica" });
  }
  return out.length ? out : null;
}

/** parse(texto, itensApi) -> [{numero, marca, modelo|null, valorUnit|null, confianca:'alta'|'media', template:'publica'}]
 *  itensApi: linhas de itens_sc (numero, descricao, unit_homologado, quantidade, cnpj_fornecedor, fornecedor).
 *  Só devolve item que CASAR (fornecedor e/ou valor / número). Descarta o resto. Sem rede/LLM. */
export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const r1 = parseT1(texto, itensApi);
  if (r1 && r1.length) return r1;
  const r3 = parseT3(texto, itensApi);
  if (r3 && r3.length) return r3;
  return [];
}

export default parse;
