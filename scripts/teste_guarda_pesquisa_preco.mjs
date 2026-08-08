// TESTE da guarda de pesquisa de preço no roteador. Sem banco, sem rede.
//   node scripts/teste_guarda_pesquisa_preco.mjs      (sai 1 se algum caso falhar)
//
// POR QUE ESTE TESTE EXISTE
// A regra do Heitor é dura: pesquisa de preço NÃO se usa, porque cita compra de OUTROS municípios e
// atribuiria a marca de uma contratação a outra. Mas a guarda já errou nas duas direções:
//   · frouxa demais — deixava passar relatório de cotação que parecia ata;
//   · apertada demais — em 07/ago barrava 32.561 documentos contra 8.569 de sinal real, e entre o excesso
//     havia 1.817 com assinatura PRÓPRIA de resultado ("VENCEDORES DO PROCESSO", "VALORES UNITÁRIOS
//     FINAIS", "TERMO DE HOMOLOGAÇÃO…") descartados só porque a palavra aparecia no texto.
// Daí os dois níveis: FORTE (cita compra de terceiro) exclui sempre; FRACO (só menciona) exclui apenas
// no resíduo, quando nenhuma assinatura de resultado casou.
import { identificaGerador } from "./gerador_documento.mjs";

const CASOS = [
  // [rótulo, texto, gerador esperado]
  ["sinal FORTE puro → exclui",
   "RELATORIO Fonte: http://www.gov.br/pncp Mediana dos Precos Obtidos R$ 10,00", "pesquisa_preco"],
  ["FORTE 'Fonte: PNCP' → exclui",
   "Item 1 parafuso Fonte: PNCP valor 3,00", "pesquisa_preco"],
  ["FORTE mesmo COM ata junta (PDF mesclado) → exclui, custo aceito",
   "VENCEDORES DO PROCESSO ... Painel de Preco ... Marca: TIGRE", "pesquisa_preco"],
  ["FRACO sozinho → exclui (nada a perder)",
   "Justificativa: houve PESQUISA DE PRECO conforme lei. Objeto: aquisicao.", "pesquisa_preco"],
  ["FRACO 'ORCAMENTO ESTIMADO' sozinho → exclui",
   "ORCAMENTO ESTIMADO da contratacao, valor global R$ 50.000,00", "pesquisa_preco"],

  // ═══ O CONSERTO: menção NÃO pode derrubar documento de resultado ═══
  ["FRACO + assinatura AZ → é RESULTADO",
   "TIPO: VENCEDORES DA FASE DE DISPUTA ... realizada PESQUISA DE PRECO previa ... Marca: VONDER", "az"],
  ["FRACO + assinatura bolsa → é RESULTADO",
   "VENCEDORES DO PROCESSO ... conforme MAPA DE PRECO anexo ... Marca: TIGRE", "bolsa_lance"],
  ["FRACO + assinatura Betha → é RESULTADO",
   "VALORES UNITARIOS FINAIS ... a COTACAO DE PRECO foi juntada ... Marca: KRONA", "betha_ata"],
  ["FRACO + assinatura de termo do ERP → é RESULTADO",
   "TERMO DE HOMOLOGACAO E ADJUDICACAO ... apos PESQUISA DE PRECO ... Marca: APTI", "erp_termo"],

  // não-regressão do resto
  ["documento limpo sem nada → desconhecido", "Ata da sessao publica realizada.", "desconhecido"],
  ["PCP legítimo → pcp", "Portal de Compras Publicas ... VENCEDOR: ACME LTDA", "pcp"],
];

let falhas = 0;
for (const [nome, texto, esperado] of CASOS) {
  const { gerador } = identificaGerador(texto);
  const ok = gerador === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${nome.padEnd(52)} → ${gerador}${ok ? "" : `  (esperado ${esperado})`}`);
}
console.log(falhas ? `\n✖ ${falhas} de ${CASOS.length} falharam` : `\n✔ ${CASOS.length}/${CASOS.length} passaram`);
process.exit(falhas ? 1 : 0);
