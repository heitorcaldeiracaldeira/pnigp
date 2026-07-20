// Parser deterministico de MARCA — celula: outro_concorrE
// portal (gerador): outro | modalidade: Concorrencia Eletronica (modalidade_id=4)
// tipos de documento: 16,11,19
//
// ACHADO (engenharia reversa de ~118 docs, sample dirigido + aleatorio):
//   A Concorrencia Eletronica no gerador 'outro' e DOMINADA por obras/servicos de
//   engenharia. O template principal ("VENCEDORES DO PROCESSO", tambem chamado aqui
//   de Template A / rotulado) e GERADO por software e traz, por item, os rotulos:
//       Item: N  Descricao: ...  Quantidade: ...  Val. Ref.: ...  Unidade: ...
//       Total Item: ...  Marca: <VALOR>  Modelo: <VALOR>  Valor Unit.: <VALOR>  Quant.: ...
//   A marca vive ENTRE o rotulo "Marca:" e o rotulo "Modelo:". Nao e uma coluna solta:
//   e um CAMPO ROTULADO fixo do gerador -> extracao 100% deterministica.
//
//   Como e majoritariamente obra, o VALOR do campo Marca e quase sempre um PLACEHOLDER
//   (Obra, Engenharia, Projeto, Servico, Propria, Diversos, "Tecnica e preco", "Nao Ha").
//   Marcas de produto REAIS aparecem numa minoria (DELL, LG, VIVO, SANY, RCM, CONSBRITA...).
//   O parser extrai o campo e DESCARTA placeholders (filtro anti-falso-positivo), casando
//   por numero do item + valor unitario homologado (unit_homologado da API).
//
//   Template B ("PROPOSTAS DO PROCESSO"): cabecalho "Autor  Marca/Modelo  Valor" com uma
//   linha por licitante. Casamos a linha do VENCEDOR (fornecedor da API) e pegamos a marca.
//
// Zero rede / zero LLM.

// ---- ancoras de valor -------------------------------------------------------
function parseBRL(s) {
  if (s == null) return null;
  let x = String(s).trim();
  if (!x) return null;
  // "1.234.567,89" -> tira separador de milhar '.', troca decimal ',' por '.'
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : null;
}
function apiUnit(v) {
  // unit_homologado vem como float-string estilo "7.53" ou "1415807.05"
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function moneyEq(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 0.015 || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.005);
}

// ---- filtro anti-falso-positivo (placeholders de obra/servico + prosa) ------
const PLACEHOLDER = new Set([
  'obra','obras','projeto','projetos','engenharia','servico','servicos','servico(s)',
  'propria','proprio','proprios','proprias','diversos','diversas','diverso','diversa',
  'nao ha','nao ha marca','nda','na','n/a','sem marca','s/marca','s marca','sem',
  'conforme edital','conforme proposta','conforme especificacao','tecnica e preco',
  'retorno economico','pavimentacao','prestacao de servicos','prestacao de servico',
  'nao aplicavel','nao se aplica','nenhum','nenhuma','padrao','instalacao','montagem',
  'execucao','mao de obra','reforma','construcao','obras e servicos','tecnica','preco',
  'servico e material','material','materiais','generico','sem informacao','a definir',
  'serv','servs','pronto atendimento','gerenciamento','operacionalizacao',
  '-','--','.','..','x','xx',
]);
// radicais que denunciam obra/servico mesmo em variacoes/acentos
const WORKS_RADICAL = /(obra|engenh|projeto|servic|pavimenta|constru|reform|instalac|montagem|execuc|mao de obra|terraplen|drenagem|calcament|sinalizac|prestac)/;

function normLower(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .replace(/[^\w\s/&.\-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// limpa "SANY Chassi: ... Ano Fab/..." e afins deixando so o nome da marca
function trimMarca(raw) {
  let m = raw.trim();
  // corta em campos tecnicos que costumam vazar apos a marca
  m = m.split(/\b(?:chassi|serie|s[ée]rie|ano\s*fab|placa|renavam|n[ºo]?\s*serie|modelo)\b/i)[0];
  m = m.replace(/[\s:;\-/.]+$/,'').replace(/^[\s:;\-/.]+/,'').trim();
  return m;
}

function isRealBrand(raw) {
  if (!raw) return false;
  const m = trimMarca(raw);
  if (!m) return false;
  const n = normLower(m);
  if (!n || n.length < 2) return false;
  if (PLACEHOLDER.has(n)) return false;
  if (WORKS_RADICAL.test(n)) return false;
  if (/^[\d.,%/\s-]+$/.test(n)) return false;        // so numeros/pontuacao
  if (n.replace(/[^a-z]/g,'').length < 2) return false; // precisa de ao menos 2 letras
  if (m.length > 40) return false;                    // prosa longa -> descarta
  // frases juridicas de vedacao (art.41) / prosa
  if (/(marca|especificac|indicac|qualidade|referencia|similar|equivalent|quando for o caso)/.test(n) && n.split(' ').length > 3) return false;
  return true;
}

// ---------------------------------------------------------------------------
// TEMPLATE A — rotulado ("VENCEDORES DO PROCESSO")
//   Item: N ... Marca: <V> Modelo: <V> Valor Unit.: <V>
// ---------------------------------------------------------------------------
function parseTemplateA(texto) {
  const out = [];
  // captura por bloco de item; nao-guloso ate encontrar os rotulos na ordem do gerador
  const re = /Item:\s*(\d{1,4})\b[\s\S]{0,1500}?\bMarca:\s*([^\n]{0,80}?)\s*Modelo:\s*([^\n]{0,80}?)\s*Valor\s*Unit\.?:\s*([\d.]*\d,\d{2,})/gi;
  let m;
  while ((m = re.exec(texto))) {
    out.push({
      numero: parseInt(m[1], 10),
      marcaRaw: m[2].trim(),
      modelo: (m[3] || '').trim() || null,
      valorUnit: parseBRL(m[4]),
    });
    // evita loop travado
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// TEMPLATE B — proposta ("PROPOSTAS DO PROCESSO", coluna "Autor Marca/Modelo Valor")
//   linha do vencedor:  <FORNECEDOR>  <marca> / <modelo>  <valor>
// So usado quando NAO ha template A no texto.
// ---------------------------------------------------------------------------
function parseTemplateB(texto, itensApi) {
  if (!/PROPOSTAS DO PROCESSO/i.test(texto) || !/Marca\s*\/\s*Modelo/i.test(texto)) return [];
  const out = [];
  // itens da API dao o item + fornecedor vencedor + valor
  for (const it of itensApi) {
    const forn = (it.fornecedor || '').trim();
    if (!forn) continue;
    const vu = apiUnit(it.unit_homologado);
    // localiza o nome do fornecedor no texto e captura "<marca> / <modelo> <valor>" logo apos
    const idx = texto.toUpperCase().indexOf(forn.toUpperCase());
    if (idx < 0) continue;
    const tail = texto.slice(idx + forn.length, idx + forn.length + 120);
    // <marca> / <modelo> <valor-brl>
    const mm = tail.match(/^\s*([^\/\n]{1,40}?)\s*\/\s*([^\d\n][^\n]{0,40}?)\s+([\d.]*\d,\d{2,})/);
    if (!mm) continue;
    const val = parseBRL(mm[3]);
    if (vu != null && val != null && !moneyEq(val, vu)) continue; // linha nao e a do valor homologado
    out.push({
      numero: it.numero,
      marcaRaw: mm[1].trim(),
      modelo: (mm[2] || '').trim() || null,
      valorUnit: val,
      _viaForn: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
export function parse(texto, itensApi) {
  const result = [];
  if (!texto || !Array.isArray(itensApi) || itensApi.length === 0) return result;

  const template = /VENCEDORES DO PROCESSO/i.test(texto) ? 'A_venc'
                 : /Marca:\s*/.test(texto) ? 'A_rotulado'
                 : /PROPOSTAS DO PROCESSO/i.test(texto) ? 'B_propostas'
                 : 'desconhecido';

  const parsedA = parseTemplateA(texto);
  const useB = parsedA.length === 0;
  const parsedRows = useB ? parseTemplateB(texto, itensApi) : parsedA;
  const tpl = useB ? 'B_propostas' : (template.startsWith('A') ? template : 'A_rotulado');

  // indexa parse por numero
  const byNum = new Map();
  for (const p of parsedRows) if (!byNum.has(p.numero)) byNum.set(p.numero, p);

  for (const it of itensApi) {
    const p = byNum.get(it.numero);
    if (!p) continue;                     // sem casar -> nunca pendura marca no item errado
    if (!isRealBrand(p.marcaRaw)) continue; // placeholder/prosa -> descarta

    // guarda anti-vazamento-de-objeto: se a "marca" e so um pedaco da propria
    // descricao do item, nao e marca (ex.: "Pronto Atendimento" num contrato de
    // gerenciamento de pronto atendimento). Marca real (DELL/LG/VIVO) NAO aparece
    // na descricao (art.41 veda indicacao de marca no edital).
    const marcaN = normLower(trimMarca(p.marcaRaw));
    const descN = normLower(it.descricao || '');
    if (marcaN && descN.includes(marcaN)) continue;

    const vuApi = apiUnit(it.unit_homologado);
    const valorBate = p.valorUnit != null && vuApi != null && moneyEq(p.valorUnit, vuApi);
    // confianca alta quando numero E valor unitario homologado casam
    const confianca = valorBate ? 'alta' : 'media';

    result.push({
      numero: it.numero,
      marca: trimMarca(p.marcaRaw),
      modelo: p.modelo && p.modelo.length <= 60 ? p.modelo : null,
      valorUnit: p.valorUnit,
      confianca,
      template: tpl,
    });
  }
  return result;
}

export default { parse };
