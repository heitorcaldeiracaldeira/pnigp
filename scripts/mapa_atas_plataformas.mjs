// MAPA DAS ATAS POR PLATAFORMA (SC) — artefato do estudo profundo de 2026-07-15.
// O tipo_documento do PNCP NÃO distingue a ata (joga quase tudo em "Outros Documentos"); o único discriminador é o
// TÍTULO, e cada plataforma nomeia diferente. Este mapa diz, por plataforma: (sel) regex do título do documento de
// RESULTADO que carrega marca/modelo/propostas/lances, e (cobertura) o que dá para extrair de fato.
//   completo  = pregão/concorrência com propostas de TODOS + lances (ECustomize/AZ/BLL/Pública)
//   vencedor  = só o vencedor+marca (dispensa/homologação — Betha/IPM/Compras.gov.br)
//   ausente   = a plataforma não publica a ata de resultado no PNCP (Licitanet/SC-Estado/BNC/Licitar)
// A plataforma vem de contratacoes_sc.plataforma (campo usuarioNome do PNCP). Casamento por ILIKE (match).
export const MAPA = [
  { match: "ECustomize",       cobertura: "completo", sel: "atatotal|ata[_ .-]?final|ata[_ .-]?parcial|ata de julgamento|ata final" },
  { match: "AZ INFORMATICA",   cobertura: "completo", sel: "^resultados?\\b|^ata-sessao|^ata$|ata-sessao-" },
  { match: "BLL Compras",      cobertura: "completo", sel: "propostasprocesso|vencedoresprocesso|atasessaofinal|atahomologacao|ataadjudicacao|relat(orio)?lance" },
  { match: "Pública",          cobertura: "completo", sel: "ata de reuni[aã]o de julgamento|julgamento de propostas|termo de homologa" },
  { match: "Betha",            cobertura: "vencedor", sel: "^homologacao\\b|termo de homologacao( e adjudicacao)?|ata[_ ]?final|ata[_ ]?total|atatotal" },
  { match: "IPM Sistemas",     cobertura: "vencedor", sel: "^ata_final\\b|termo_de_homologacao|te?rmo_de_adjudicacao|ata_registro_de_preco|mapa_de_precos" },
  // Compras.gov.br (ComprasNet/SIASG): 7,1k pregões + 1k concorrências, MAS só publica o EDITAL no PNCP — a Ata de
  // Realização do Pregão (propostas+lances de todos) fica no comprasnet.gov.br (sistema próprio), NÃO no documento do
  // PNCP. Pelo PNCP é esparso (~92 "divulgacao do resultado"). Completo exige plugar o ComprasNet como FONTE SEPARADA.
  { match: "Compras.gov.br",   cobertura: "ausente",  sel: "divulgacao do resultado|carta proposta|^proposta$|ata chamada publica", fonteExterna: "ComprasNet API (comprasnet.gov.br)" },
  // sparse/ausentes — tenta o que houver, mas cobertura baixa no PNCP
  { match: "Licitar Digital",  cobertura: "ausente",  sel: "ata[_ ]de[_ ]julgamento|ata[_ ]da[_ ]comissao|ata[_ ]de[_ ]registro" },
  { match: "Bolsa Nacional",   cobertura: "ausente",  sel: "ata[_ ]de[_ ]registro|resultado|homologa" },
  { match: "Secretaria de Estado da Administra", cobertura: "ausente", sel: "ata de resultado|ata de julgamento|homologa|resultado" },
  { match: "Licitanet",        cobertura: "ausente",  sel: "resultado|homologa|ata de registro|proposta" },
];
// —— LEI: marca/modelo existe em TODAS as modalidades, na ata/documento. A seleção traz o documento de RESULTADO de
// TODA modalidade — não exclui dispensa/inexigibilidade. Só muda QUAL documento carrega o dado por modalidade: ——
//  · pregão/concorrência → ata de resultado (propostas + lances de TODOS)
//  · dispensa/inexigibilidade/credenciamento → termo de homologação / razão da escolha / proposta (marca do vencedor)
// ⚠️ o separador precisa aceitar " da "/" de " e MAIS DE UM caractere: "ata da sessao pe" (Betha) e "ata sessao final"
// (BLL) têm 100% de marca e o padrão antigo `ata[_ .-]?sessao` (1 separador) NÃO os pegava — medido em 2026-07-15.
const SEP = "[_ .\\-]*(?:d[ae])?[_ .\\-]*";
// 🔴 ATENÇÃO — estes padrões rodam no POSTGRES (`~*`), que usa regex POSIX, NÃO PCRE/JavaScript.
// Em POSIX, **`\b` é o caractere BACKSPACE**, não fronteira de palavra. A fronteira é **`\y`** (ou `\m`/`\M`).
// Custou caro: `^resultados?\b` NUNCA casou → **7.281 documentos "resultados" da AZ INFORMATICA** (plataforma de
// cobertura COMPLETA: propostas + lances de TODOS) foram descartados em silêncio. Um `\b` aqui não dá erro — só
// deixa de casar. Testar SEMPRE que o padrão casa com o que DEVE, não só que rejeita o que não deve.
export const SEL_ATA = "atatotal|ata" + SEP + "(final|parcial|sessao|sess[aã]o|total|julgamento|reuni|realiz)|^ata$|^resultados?\\y|vencedoresprocesso|propostasprocesso|relat(orio)?lance|mapa[_ ]?de[_ ]?(lance|preco)|divulgacao do resultado";
// ⚠️ ACENTO: o `~*` do Postgres é case-insensitive mas NÃO accent-insensitive — "termo de homologacao" NÃO casa com
// "termo de homologação". Medido 2026-07-15: 5.091 docs de resultado ficavam de fora por acento e por erro de
// digitação da fonte ("razao da escollha", "temo_de_adjudicacao"). Casar pelo RADICAL (homologa/adjudica/raz[ãa]o)
// resolve os dois de uma vez. `te?rmo` cobre o typo "temo".
// `^proposta$` (ancorado) só casava com o título que fosse EXATAMENTE "proposta" — mas a LEI do usuário diz que na
// dispensa a marca está na PROPOSTA do vencedor, e ela se chama "Proposta Comercial"/"Proposta de Preço"/"Proposta
// Vencedora" (2.246 rejeitados). `ata[_ ]de[_ ]registro` exigia o "de" e perdia "ata registro de preco" (949).
// MODELO/ANEXO de proposta é FORMULÁRIO em branco, não dado → vai no EXCLUI.
export const SEL_DISPENSA = "ter?mo[_ ]?(de[_ ]?)?homologa|^homologa|raz[ãa]o?[_ ]?(d[ae][_ ]?)?escol?lha|razoesdaescolha|ter?mo[_ ]?de[_ ]?adjudica|^adjudica|propostas?[_ ]?(comercial|de[_ ]?pre[çc]o|vencedora|recebidas|final)|^propostas?\\y|carta proposta|ata chamada publica|ata[_ ]?(de[_ ]?)?registro";
export const SEL_DEFAULT = SEL_ATA + "|" + SEL_DISPENSA;
// +modelo/formulario: "modelo proposta comercial" é FORMULÁRIO EM BRANCO, não a proposta preenchida.
export const EXCLUI = "errata|^edital|termo de referencia|termo_de_referencia|anexo|minuta|projeto b|estudo tecnico|^dfd|parecer|^orcamento|impugnac|^recurso|comprovante|comprovacao|aviso de|abertura de processo|^modelo|formulario";

// devolve a cláusula SQL (WHERE) que seleciona os documentos de resultado de TODAS as modalidades. Global (união
// ata + dispensa), com overrides por plataforma onde o nome é atípico (AZ 'resultados', BLL 'propostasprocesso').
// usa: FROM arquivos_sc a JOIN contratacoes_sc c USING(cnpj,ano,seq)
// ⚠️ o `sel` da plataforma SOMA ao global, nunca SUBSTITUI. Antes ele substituía: a BLL, cujo sel só tinha
// "atasessaofinal" (sem separador), perdia o "ata sessao final" (100% marca) que o SEL_ATA global pegaria.
// O sel por plataforma serve p/ nomes ATÍPICOS (AZ "resultados", BLL "propostasprocesso") — é acréscimo, não recorte.
export function whereSelecaoAtas(alias = "a", calias = "c") {
  const casos = MAPA.filter((m) => m.cobertura === "completo").map((m) =>
    `WHEN ${calias}.plataforma ILIKE '%${m.match.replace(/'/g, "''")}%' THEN (${alias}.titulo ~* '${(m.sel + "|" + SEL_DEFAULT).replace(/'/g, "''")}')`
  ).join("\n      ");
  return `(CASE
      ${casos}
      ELSE (${alias}.titulo ~* '${SEL_DEFAULT.replace(/'/g, "''")}')
    END) AND NOT (${alias}.titulo ~* '${EXCLUI.replace(/'/g, "''")}')`;
}

// ——— GERADOR do documento (assinatura NO TEXTO) ———
// A `plataforma` de contratacoes_sc (=usuarioNome) é quem PUBLICOU no PNCP (o ERP do município), NÃO quem rodou a
// sessão: município com ERP Betha/IPM faz o pregão no Portal de Compras Públicas e o PDF sai com a marca do Portal.
// Medido 2026-07-15: em amostra de 60 docs, Betha rendeu 3.423 propostas e IPM 1.153 com o parser do ECustomize.
// Por isso o parser é roteado por ISTO, não pela plataforma. Carimbado na ingestão (arquivo_texto_sc.gerador).
// 🔴 O `gerador` nomeia o **LAYOUT que o parser lê**, NÃO o fornecedor do sistema. Medido 2026-07-15: a BLL publica
// 1.094 documentos na estrutura do BETHA (`Item:`/`Marca:`), e o balde 'outro' tem 1.500 docs em layouts que já
// temos parser. Classificar por marca-do-fornecedor deixava tudo isso de fora. Por isso a detecção é ESTRUTURAL:
// procura a âncora de que o parser precisa. A assinatura do fornecedor só entra como desempate forte (Portal).
// ORDEM = precedência: o mais específico primeiro.
export const GERADORES = [
  // 1) assinatura do FORNECEDOR (a mais forte quando existe): o PDF do Portal se identifica
  { id: "portal_compras_publicas", re: /portaldecompraspublicas|portal de compras p[uú]blicas/i, parser: "parser_ecustomize" },
  // 2) ESTRUTURA — a âncora que cada parser realmente precisa, valha p/ qual plataforma for
  //    AZ-L1: tabela de TODOS os licitantes
  { id: "az",    re: /CNPJ\s*\/\s*CPF\s+Nome\s+Marca\s+Modelo|fornecedores classificados/i,      parser: "parser_az" },
  //    Portal/ECustomize: tabela de propostas ("Marca/ Fabricante" é o cabeçalho dela)
  { id: "portal_compras_publicas", re: /marca\s*\/\s*fabricante/i,                               parser: "parser_ecustomize" },
  //    Betha: chave-valor "Item: N … Marca:" (o parser ancora nisto)
  { id: "betha", re: /movimentos do lote|Item:\s*\d+[\s\S]{0,200}?Marca:\s*\w/i,                 parser: "parser_betha" },
  //    AZ-L2: por fornecedor, rótulo DEPOIS do valor ("propriaMarca:")
  { id: "az",    re: /itens do lote:|CNPJ\s*\/\s*CPF:\s*\d{11}/i,                                parser: "parser_az" },
  // 3) fornecedor sem parser (fica registrado p/ saber o tamanho do que falta)
  { id: "bll",                     re: /bllcompras|bolsa de licitac(o|õ)es/i,                    parser: null },
  { id: "licitar_digital",         re: /licitar digital|licitardigital/i,                        parser: null },
  { id: "licitanet",               re: /licitanet/i,                                             parser: null },
];
// ——— NORMALIZAÇÃO DA MARCA (compartilhada pelos parsers) ———
// Quando não há marca de TERCEIRO, os sistemas preenchem o campo Marca com um marcador: "Própria", "Serviço",
// "Obra", "S/ Marca", "N/A", "-". Isso é FIEL à fonte, não é defeito do parser — mas gravar como se fosse marca
// mente para quem consulta. Medido 2026-07-15 em item_marca_sc: 30,3% "Própria/Serviço" + 3,0% "Obra/SERVIÇOS".
// Normalizar p/ NULL faz `marca IS NOT NULL` significar de fato "tem marca de produto" — que é o eixo de qualidade
// do banco de sucesso ([[pnigp-copiloto-compra]]).
const SEM_MARCA = /^\s*(marca\s+)?(pr[oó]pri[ao]|servi[çc]os?|obras?|s\/?\s*marca|sem\s+marca|n\/?[ac]|n[aã]o\s+se\s+aplica|nao\s+informad[ao]|diversos?|-{1,3}|\.+)\s*$/i;
export function normalizaMarca(s) {
  const m = String(s || "").trim();
  if (!m || SEM_MARCA.test(m)) return null;
  return m;
}

export function detectaGerador(texto) {
  if (!texto) return null;
  // a assinatura vive no cabeçalho/rodapé das páginas — olha as pontas (evita varrer 200k chars de item)
  const t = texto.length > 80000 ? texto.slice(0, 60000) + " " + texto.slice(-20000) : texto;
  for (const g of GERADORES) if (g.re.test(t)) return g.id;   // ordem importa: Portal vence (o ERP só publicou)
  return "outro";
}
