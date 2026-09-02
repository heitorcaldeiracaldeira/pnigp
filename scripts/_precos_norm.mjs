// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _precos_norm.mjs — fragmentos SQL de NORMALIZAÇÃO da descrição e CANONICALIZAÇÃO da unidade do banco de preços.
//
// POR QUÊ este arquivo existe: o dado bruto de itens_sc tem a descrição livre (com HTML, espaços múltiplos, caixa
// variada) e a unidade com ~4.838 variações grafando a MESMA coisa ("unidade"/"un"/"und"/"peça"). Comparar preço
// exige reduzir os dois a uma forma canônica. Esses fragmentos são INTERPOLADOS no SQL de build_precos_compras.mjs.
//
// HISTÓRICO: apagado no `rm _*.mjs` (sessão de jul) e RECONSTRUÍDO a partir do uso em build_precos_compras.mjs
// (que importa { NORM, CANON }) e do NORM idêntico já embutido em build_precos_basica_sc.mjs:10.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// NORM — expressão SQL que normaliza a coluna `descricao` (não-qualificada; build_precos_compras usa FROM itens_sc
// sem alias) em uma CHAVE de comparabilidade: remove tags HTML, colapsa espaços, minúsculas, apara as pontas.
// IDÊNTICO ao NORM de build_precos_basica_sc.mjs (lá referenciando i.descricao) — mantido em sincronia de propósito.
export const NORM = `lower(btrim(regexp_replace(regexp_replace(descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

// CANON — expressão SQL que canonicaliza a UNIDADE. Escrita com o placeholder `u` (palavra isolada): quem consome
// substitui `\bu\b` pelo valor real da coluna, ex.: build_precos_compras faz
//   CANON.replace(/\bu\b/g, "lower(btrim(unidade))")
//
// FORMATO DO DADO (medido em itens_sc): a unidade do PNCP vem como "<nome> (<sigla>)", ex.: "unidade (un)",
// "unidade (unid)", "unidade (und)", "metro (m)". O parêntese é RUÍDO — só reafirma a sigla do mesmo nome. Por isso
// o 1º passo é TIRAR o parêntese (base = texto antes do "("), o que já colapsa a maioria das ~4.838 grafias; o CASE
// depois só unifica as siglas/plurais que sobram. ELSE devolve a própria base (não força unidade desconhecida).
// Só há grafias de BENS aqui: serviços/tempo já são excluídos a montante (unidade !~* 'serv|mês|diaria|verba|hora').
export const CANON = `CASE btrim(regexp_replace(u,'\\s*\\(.*$',''))
  WHEN 'un' THEN 'unidade'  WHEN 'und' THEN 'unidade'  WHEN 'unid' THEN 'unidade'  WHEN 'ud' THEN 'unidade'  WHEN 'unidades' THEN 'unidade'
  WHEN 'pc' THEN 'unidade'  WHEN 'pç' THEN 'unidade'  WHEN 'peca' THEN 'unidade'  WHEN 'peça' THEN 'unidade'
  WHEN 'pecas' THEN 'unidade'  WHEN 'peças' THEN 'unidade'  WHEN 'pça' THEN 'unidade'
  WHEN 'cx' THEN 'caixa'  WHEN 'caixas' THEN 'caixa'
  WHEN 'pct' THEN 'pacote'  WHEN 'pcte' THEN 'pacote'  WHEN 'pacotes' THEN 'pacote'
  WHEN 'fr' THEN 'frasco'  WHEN 'fco' THEN 'frasco'  WHEN 'frascos' THEN 'frasco'
  WHEN 'amp' THEN 'ampola'  WHEN 'ampolas' THEN 'ampola'  WHEN 'frasco-ampola' THEN 'ampola'
  WHEN 'quilo' THEN 'kg'  WHEN 'quilos' THEN 'kg'  WHEN 'quilograma' THEN 'kg'  WHEN 'quilogramas' THEN 'kg'  WHEN 'kilo' THEN 'kg'  WHEN 'kilograma' THEN 'kg'  WHEN 'kilogramas' THEN 'kg'
  WHEN 'gr' THEN 'g'  WHEN 'grama' THEN 'g'  WHEN 'gramas' THEN 'g'
  WHEN 'miligrama' THEN 'mg'  WHEN 'miligramas' THEN 'mg'
  WHEN 'l' THEN 'litro'  WHEN 'lt' THEN 'litro'  WHEN 'litros' THEN 'litro'  WHEN 'lts' THEN 'litro'
  WHEN 'mililitro' THEN 'ml'  WHEN 'mililitros' THEN 'ml'
  WHEN 'm' THEN 'metro'  WHEN 'mt' THEN 'metro'  WHEN 'mts' THEN 'metro'  WHEN 'metros' THEN 'metro'
  WHEN 'm²' THEN 'm2'  WHEN 'metro quadrado' THEN 'm2'  WHEN 'metros quadrados' THEN 'm2'
  WHEN 'm³' THEN 'm3'  WHEN 'metro cubico' THEN 'm3'  WHEN 'metros cubicos' THEN 'm3'
  WHEN 'centimetro' THEN 'cm'  WHEN 'centimetros' THEN 'cm'
  WHEN 'rolos' THEN 'rolo'  WHEN 'rl' THEN 'rolo'
  WHEN 'resmas' THEN 'resma'
  WHEN 'pares' THEN 'par'  WHEN 'pr' THEN 'par'
  WHEN 'dz' THEN 'duzia'  WHEN 'duzias' THEN 'duzia'  WHEN 'dúzia' THEN 'duzia'
  WHEN 'gl' THEN 'galao'  WHEN 'galoes' THEN 'galao'  WHEN 'galão' THEN 'galao'  WHEN 'galões' THEN 'galao'
  WHEN 'bd' THEN 'balde'  WHEN 'baldes' THEN 'balde'
  WHEN 'sc' THEN 'saco'  WHEN 'sacos' THEN 'saco'  WHEN 'saca' THEN 'saco'  WHEN 'sacas' THEN 'saco'
  WHEN 'tb' THEN 'tubo'  WHEN 'tubos' THEN 'tubo'  WHEN 'bisnaga' THEN 'tubo'  WHEN 'bisnagas' THEN 'tubo'
  WHEN 'bl' THEN 'bloco'  WHEN 'blocos' THEN 'bloco'
  WHEN 'cj' THEN 'kit'  WHEN 'cjt' THEN 'kit'  WHEN 'kits' THEN 'kit'  WHEN 'conjunto' THEN 'kit'  WHEN 'conjuntos' THEN 'kit'  WHEN 'jogo' THEN 'kit'  WHEN 'jogos' THEN 'kit'
  WHEN 'latas' THEN 'lata'
  WHEN 'fl' THEN 'folha'  WHEN 'fls' THEN 'folha'  WHEN 'folhas' THEN 'folha'
  ELSE btrim(regexp_replace(u,'\\s*\\(.*$','')) END`;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CANON_SERVICO — o IRMÃO do CANON, para o eixo que o banco de MATERIAL exclui a montante (01/set/2026).
//
// O CANON acima é declaradamente "só grafias de BENS", porque o build de material filtra
// `unidade !~* 'serv|mês|diaria|verba|hora'` antes de chegar nele. Com o banco de preços de SERVIÇO essas
// unidades passam a ser justamente as que interessam — e elas se multiplicam em sinônimos:
//     serviço · servico · sv · por serviço      (medido: 4 grafias, 34.023 itens)
//     mês · mes · mensal                        (medido: 9.243 itens partidos em 2 grafias)
// Partir o mesmo grupo em duas grafias corta a amostra pela metade contra a regra do mínimo de 3 compras.
//
// ⚠️ NÃO se aplica FATOR aqui, e isso é a diferença de fundo entre os dois eixos. A camada de apresentação
// (`item_apresentacao_sc`) existe para DESEMBALAR — "caixa com 12" vira 12 unidades. Serviço não se
// desembala: 1 hora é 1 hora. Medido em 01/set: a camada cobre 85% dos itens de material e 58,5% dos de
// serviço, e nesses 58,5% quase tudo é `unidade` com fator 1, ou seja passa direto. Usá-la para serviço
// daria a impressão de normalizar preço sem normalizar nada.
//
// Mantém o 1º passo do CANON — tirar o parêntese, que é ruído do PNCP ("unidade (un)") — e acrescenta os
// casos de serviço/tempo ANTES de cair no CASE dos bens.
export const CANON_SERVICO = `CASE
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ 'servi|^sv$'            THEN 'servico'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ '^m[êe]s$|mensal'        THEN 'mes'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ '^h$|^hr$|^hora'         THEN 'hora'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ 'di[áa]ria|^di[áa]s?$'   THEN 'diaria'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ 'verba|global|^vb$'      THEN 'verba'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ '^ano|anual'             THEN 'ano'
  WHEN btrim(regexp_replace(u,'\\s*\\(.*$','')) ~ 'atendimento|consulta|procedimento|exame|sess[ãa]o' THEN 'atendimento'
  ELSE ${CANON} END`;
