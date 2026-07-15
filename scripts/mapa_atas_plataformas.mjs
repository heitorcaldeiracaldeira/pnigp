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
export const SEL_ATA = "atatotal|ata[_ .-]?(final|parcial|sessao|total|de julgamento|de reuni|de realiz)|^ata$|^resultados?\\b|vencedoresprocesso|propostasprocesso|relat(orio)?lance|mapa[_ ]?de[_ ]?(lance|preco)|ata de reuni[aã]o de julgamento|divulgacao do resultado";
export const SEL_DISPENSA = "termo de homologacao|termo_de_homologacao|razao (da|de) escolha|razoesdaescolha|razao_da_escolha|^homologacao|te?rmo[_ ]?de[_ ]?adjudicacao|^proposta$|carta proposta|ata chamada publica|ata[_ ]de[_ ]registro";
export const SEL_DEFAULT = SEL_ATA + "|" + SEL_DISPENSA;
export const EXCLUI = "errata|^edital|termo de referencia|termo_de_referencia|anexo|minuta|projeto b|estudo tecnico|^dfd|parecer|^orcamento|impugnac|^recurso|comprovante|comprovacao|aviso de|abertura de processo";

// devolve a cláusula SQL (WHERE) que seleciona os documentos de resultado de TODAS as modalidades. Global (união
// ata + dispensa), com overrides por plataforma onde o nome é atípico (AZ 'resultados', BLL 'propostasprocesso').
// usa: FROM arquivos_sc a JOIN contratacoes_sc c USING(cnpj,ano,seq)
export function whereSelecaoAtas(alias = "a", calias = "c") {
  const casos = MAPA.filter((m) => m.cobertura === "completo").map((m) =>
    `WHEN ${calias}.plataforma ILIKE '%${m.match.replace(/'/g, "''")}%' THEN (${alias}.titulo ~* '${(m.sel + "|" + SEL_DISPENSA).replace(/'/g, "''")}')`
  ).join("\n      ");
  return `(CASE
      ${casos}
      ELSE (${alias}.titulo ~* '${SEL_DEFAULT.replace(/'/g, "''")}')
    END) AND NOT (${alias}.titulo ~* '${EXCLUI.replace(/'/g, "''")}')`;
}
