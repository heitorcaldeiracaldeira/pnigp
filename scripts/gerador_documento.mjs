// QUEM GEROU ESTE PDF? — identificação pelo CONTEÚDO, que é o terceiro eixo da lei
// local x modalidade x GERADOR.
//
// ═══ POR QUE ISTO EXISTE, E POR QUE NÃO SERVE OLHAR O PORTAL NEM O TÍTULO ═══
//
// 1. O TÍTULO DO ARQUIVO É ESCOLHA DO ÓRGÃO, NÃO DO SISTEMA. A primeira versão do leitor da BLL selecionava
//    os documentos por nome de arquivo (VencedoresProcesso*, AtaHomologacao...). Medido depois pelo
//    conteúdo: das famílias de resultado da BLL, ~2.177 documentos existem, e o filtro por título pegava
//    1.448. Perdiam-se ~470 documentos porque o mesmo gerador sai com nomes diferentes conforme quem salvou
//    o arquivo — e "TERMO DE HOMOLOGACAO 32-2024PASSINADO" não tem como ser previsto por regra de nome.
//
// 2. O PORTAL NÃO DETERMINA O GERADOR. Medido dentro dos processos cujo portal_real é BLL:
//      263 documentos são TERMO DE HOMOLOGAÇÃO DE PROCESSO LICITATÓRIO — layout do ERP Betha, idêntico ao
//          que apareceu nos processos do Compras.gov. Não é documento da BLL.
//      129 documentos são "TIPO: VENCEDORES DA FASE DE DISPUTA" com "Item: 1 Unidade: X própriaMarca:" —
//          é a gramática da AZ, com o rótulo colado DEPOIS do valor. Dentro da BLL.
//    Um leitor escolhido pelo portal leria esses com a régua errada. O gerador é que manda.
//
// 3. FRASE DE EDITAL NÃO PROVA QUE É EDITAL. Tentei separar edital por "Termo de Referência" / "torna
//    público" no texto. Isso classificaria como edital documentos VencedoresProcesso legítimos, cuja
//    descrição do item diz "conforme especificações constantes no Termo de Referência". A separação tem de
//    ser POSITIVA: é documento de resultado quem tem assinatura de resultado; o resto não entra.
//
// A distinção importa porque ler marca de edital ENVENENA a base: ali a marca é referência de
// especificação, e o art. 41 da Lei 14.133 veda indicá-la. Não é a marca de ninguém que venceu.

const norm = (s) => String(s || "").replace(/\s+/g, " ");

// ═══ EXCLUSÃO EXPLÍCITA: A PESQUISA DE PREÇO CITA COMPRAS DE OUTROS ═══
// Medido nos processos da BLL: documentos chamados "PESQUISA DE PRECO UNIFICADA" e "ORCAMENTO" trazem
// "*VENCEDOR*", CNPJ e "Marca:" — e parecem resultado. Não são. Eles citam OUTRAS contratações, colhidas
// do próprio PNCP ("Fonte: http://www.gov.br/pncp", "Mediana das Propostas Finais", órgãos de outras UFs),
// para justificar o preço estimado DESTE processo. Ler a marca ali atribuiria a compra de um município a
// outro — um envenenamento pior que o do edital, porque o dado é real, só que de outra compra.
// Fica marcado com nome próprio em vez de cair no balde "desconhecido": exclusão silenciosa é a mesma
// coisa que erro silencioso.
//
// O SINAL TEM DE SER A CITAÇÃO, NÃO A PALAVRA. A primeira versão incluía a frase "PESQUISA DE PREÇO", e
// ela sozinha marcava ~4.900 documentos — porque milhares de editais apenas MENCIONAM que houve pesquisa
// de preços. Mencionar não é ser. O que caracteriza o documento perigoso é ele citar compras de terceiros:
// a fonte no PNCP, a mediana das propostas de outros, o preço estimado calculado a partir delas.
// E O SINAL TEM DE SER A FRASE QUE O DOCUMENTO REALMENTE ESCREVE. A primeira versão usava "Mediana das
// Propostas Finais", tirada de um exemplo onde o s minúsculo havia caído na extração — e não casava nada:
// a guarda era código morto que eu teria reportado como funcionando. O texto real desses relatórios diz
// "Média dos Preços Obtidos", "Mediana dos Preços Obtidos", "Relatório de Cotação", "FONTES DE PESQUISA".
const RE_PESQUISA_PRECO = new RegExp([
  "M[ée]dia(?:na)? do\\s?\\s+Pre[çc]o\\s?\\s+Obtido",
  "Relat[óo]rio de Cota[çc][ãa]o",
  "Painel de Pre[çc]o",
  "Fonte:\\s*http\\s?://www\\.gov\\.br/pncp",
  "Pre[çc]o E\\s?timado Calculado",
  "PESQUISA DE PRE[ÇC]O",
  "COTA[ÇC][ÃA]O DE PRE[ÇC]O",
  "MAPA DE PRE[ÇC]O",
  "OR[ÇC]AMENTO ESTIMADO",
  "FONTES? (?:DE PESQUISAS?|CONSULTADAS)",
  "IDENTIFICA[ÇC][ÃA]O DAS FONTES",
  "JUSTIFICATIVA DE PESQUISA DE PRE[ÇC]O",
  "FORMUL[ÁA]RIO DE PESQUISA DE PRE[ÇC]O",
].join("|"), "i");

// Cada gerador é reconhecido por uma assinatura POSITIVA — algo que só ele escreve.
const ASSINATURAS = [
  {
    gerador: "az",
    leitor: "parser_az_resultados",
    // "Iten do lote" e não "Itens": nesses PDFs o s minúsculo cai na extração
    teste: (t) => /TIPO:\s*VENCEDORES DA FASE DE DISPUTA/i.test(t) || (/CNPJ\/CPF\s*:/i.test(t) && /Iten[s]?\s+do\s+lote\s*:/i.test(t)),
  },
  {
    gerador: "bll",
    leitor: "parser_bll_resultados",
    // "VALORES UNITÁRIOS FINAIS" sozinho basta: é o quadro que a BLL imprime no fecho, e aparece também
    // no documento de CLASSIFICAÇÃO, que não tem "ATA DE" nem "Gerado em:" e por isso escapava do
    // roteador — era um documento de resultado de verdade caindo em "desconhecido".
    teste: (t) => /VENCEDORES DO PROCESSO/i.test(t)
      || /VALORES UNIT[ÁA]RIOS FINAIS/i.test(t)
      || (/Gerado em:\s*\d{2}\/\d{2}\/\d{4}/i.test(t) && /Val\.?\s*Ref\.?\s*:/i.test(t) && /Valor\s*Unit\.?\s*:/i.test(t)),
  },
  {
    gerador: "erp_termo",
    leitor: "parser_termo_homologacao",
    teste: (t) => /TERMO DE (HOMOLOGA[ÇC][ÃA]O|ADJUDICA[ÇC][ÃA]O)([^.]{0,40})?(DE PROCESSO LICITAT|E ADJUDICA)/i.test(t)
      || /Fornecedore?\s*e?\s*Re\s?umo de Iten\s?\s*Vencedore/i.test(t)
      || /f\)\s*Fornecedores? e Resumo de Itens? Vencedores?/i.test(t),
  },
  {
    gerador: "relatorio_julgamento",
    leitor: "parser_termo_homologacao",
    teste: (t) => /M\s?a\s?r\s?c\s?a\s*\/\s*F\s?a\s?b\s?r\s?i\s?c\s?a\s?n\s?t\s?e/i.test(t) && /Valor\s+propo\s?\w*ta|Porte\s+MeEpp/i.test(t),
  },
  {
    gerador: "contrato_arp",
    leitor: "parser_contrato_arp",
    // exige o QUADRO: 122 dos 174 contratos com a palavra "marca" a trazem so em clausula de obrigacao
    // ("apresentar relacao dos materiais... marca/modelo"), que nao e a marca de nada.
    // O parêntese importa: sem ele, `A && B || C` agrupa como `(A && B) || C`, e a segunda alternativa
    // sozinha casaria qualquer documento com "Valor ... Marca/Modelo" — inclusive edital.
    // ⚠️ A MINUTA DO CONTRATO VEM DENTRO DO EDITAL. Medido: sem esta trava, 1.613 documentos dos processos
    // da BLL entravam como contrato — e a maioria era edital, porque todo edital anexa a minuta com
    // "CONTRATADA:" e "CONTRATO Nº". Minuta não tem contratada nem preço pactuado: é formulário em branco.
    // Aqui o teste negativo se justifica (ao contrário do caso do "Termo de Referência", em que a frase
    // aparecia dentro da descrição do item de um documento de resultado legítimo): estes marcadores só
    // ocorrem no corpo normativo do edital, nunca num contrato assinado.
    teste: (t) => /ATA DE REGISTRO DE PRE[ÇC]O|CONTRATO N[º°o]|DA CONTRATADA|CONTRATADA:/i.test(t)
      && !/torna p[úu]blico|DISPOSI[ÇC][ÕO]ES PRELIMINARES|DO OBJETO DA LICITA|CREDENCIAMENTO|MINUTA D[EO]|RECEBIMENTO DAS PROPOSTAS|SESS[ÃA]O P[ÚU]BLICA DE ABERTURA/i.test(t)
      && (/M\s?a\s?r\s?c\s?a\s*\/?\s*(?:M\s?o\s?d\s?e\s?l\s?o)?[^.]{0,60}?(?:Valor|Pre[çc]o|Qtde|Quant)/i.test(t)
        || /(?:Valor|Pre[çc]o|Qtde|Quant)[^.]{0,60}?M\s?a\s?r\s?c\s?a\s*\/?\s*M\s?o\s?d\s?e\s?l\s?o/i.test(t)),
  },
  {
    gerador: "pcp",
    leitor: "parser_pcp_vencedores",
    teste: (t) => /Portal de Compras P[úu]blicas/i.test(t) && /VENCEDOR|Vencedor/.test(t),
  },
];

/**
 * @returns {{gerador:string, leitor:string|null, tem_marca:boolean}}
 *   gerador "desconhecido" = nenhuma assinatura de resultado. NÃO é falha: a maioria absoluta dos
 *   documentos de um processo é edital, termo de referência, parecer, anexo — e nenhum deles declara a
 *   marca de um vencedor.
 */
export function identificaGerador(texto) {
  const t = norm(texto).slice(0, 400000);
  const temMarca = /M\s?a\s?r\s?c\s?a\s*[:\/]/i.test(t);
  // ═══ A EXCLUSÃO VEM PRIMEIRO: PESQUISA DE PREÇO NÃO SE USA ═══
  // Decisão do Heitor, e ela decide o caso dos PDFs MESCLADOS — 14 documentos em que o município junta a
  // justificativa de preço com a ata da sessão num arquivo só. Eu havia colocado o reconhecimento antes,
  // para aproveitar a ata desses arquivos, apostando que a âncora barraria o dado alheio. A regra agora é
  // outra e é mais simples de garantir: se o documento é (ou contém) pesquisa de preço, ele não entra.
  // O custo é perder a ata que veio grudada nesses 14; o ganho é que nenhuma marca de compra de terceiro
  // tem por onde entrar, nem por coincidência de valor.
  if (RE_PESQUISA_PRECO.test(t)) return { gerador: "pesquisa_preco", leitor: null, tem_marca: temMarca };
  for (const a of ASSINATURAS) {
    if (a.teste(t)) return { gerador: a.gerador, leitor: a.leitor, tem_marca: temMarca };
  }
  return { gerador: "desconhecido", leitor: null, tem_marca: temMarca };
}
