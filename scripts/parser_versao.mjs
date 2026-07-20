// VERSÃO DOS PARSERS — o estado de leitura vive no DOCUMENTO (arquivo_texto_sc.parser_versao), não num marcador.
//
// COMO USAR: mexeu em QUALQUER parser (parser_az / parser_betha / parser_ecustomize / detecta_layout), SOBE o número.
// Todo documento vira elegível de novo sozinho, no próximo ciclo. Sem marcador para lembrar de limpar.
//
// POR QUE (bug de 2026-07-15): o estado era `marca_ata_feitas`, por PROCESSO e COMPARTILHADO entre extratores.
//   1. reclassificar o layout não reprocessava: a ata seguia "feita" da rodada do parser errado
//      (medido: 315 atas em portal_vencedores, 315 "feitas", 1 item extraído);
//   2. melhorar um parser não reprocessava NADA — o ganho só valia para documento novo.
// Estado por documento + versão resolve os dois de uma vez, e é auto-recuperável: não depende de eu lembrar.
// v4 (2026-07-19): conserto do "proposta no item errado" — extrai_ecustomize casa a proposta ao item do PNCP pela
// DESCRIÇÃO (casaItens), não mais pelo r.codigo do PDF (que não avançava → tudo no item 1, 33,4% dos processos).
export const PARSER_VERSAO = 4;
