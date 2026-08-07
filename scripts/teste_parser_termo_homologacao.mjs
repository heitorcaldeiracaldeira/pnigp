// TESTE DE FRONTEIRA do parser_termo_homologacao — não precisa de banco nem de rede.
//   node scripts/teste_parser_termo_homologacao.mjs      (sai 1 se qualquer caso falhar)
//
// POR QUE ESTE TESTE EXISTE
// O defeito deste leitor nunca foi "não acha a marca" — é ONDE ELE PARA DE LER. O campo `Marca:` fecha numa
// lista de rótulos (RE_FIM_CAMPO), e todo rótulo que falta nessa lista vira cauda grudada na marca. Isso já
// aconteceu três vezes, com três rótulos diferentes, e as três só apareceram DEPOIS de gravar na base:
//   · "Total do Participante" / "Total Fornecedor" — o rodapé que fecha o bloco do licitante;
//   · "Sistema: Compras - Usuário: <nome>"          — o carimbo de rodapé de página do ERP;
//   · "Item Especificação Qtd. Unidade Valor"       — o cabeçalho da tabela quando ela reabre na página.
// "TOTAL DO PARTICIPANTE" chegou a marca de ALTA confiança em 20 órgãos no dicionário antes de alguém ver.
//
// Os casos abaixo travam as DUAS direções, e a segunda é a que importa mais:
//   (a) o rótulo tem de cortar;  (b) marca legítima que COMEÇA com a mesma palavra NÃO pode ser cortada
//       — "TOTALVET" e "Total Química" são marcas, não rodapés.
import { leTermoHomologacao } from "./parser_termo_homologacao.mjs";

const CASOS = [
  // [rótulo do caso, trecho após o valor do item, marca esperada]
  ["rodapé de bloco com marca antes",   "Marca: Nortene Total do Participante: 395.820,00", "Nortene"],
  ["rodapé de bloco sem marca",         "Marca: Total do Participante: 8.930,00",           ""],
  ["rodapé 'Total Fornecedor'",         "Marca: Brastemp Total do Fornecedor: 1.000,00",    "Brastemp"],
  ["rodapé 'Total Geral'",              "Marca: Krona Total Geral: 12,00",                  "Krona"],
  ["cabeçalho da tabela reabrindo",     "Marca: TECFIL Item Especificação Qtd. Unidade",    "TECFIL"],
  ["rodapé de página do ERP",           "Marca: osten Sistema: Compras - Usuário: mariana", "osten"],
  ["NÃO cortar marca que começa c/ Total", "Marca: TOTALVET Modelo: X",                     "TOTALVET"],
  ["NÃO cortar 'Total Química'",        "Marca: Total Química Modelo: Y",                   "Total Química"],
  ["fecho normal por Modelo",           "Marca: Tigre Modelo: PVC",                         "Tigre"],
  ["fecho normal por R$",               "Marca: Intelbras R$ 100,00",                       "Intelbras"],
];

let falhas = 0;
for (const [nome, trecho, esperado] of CASOS) {
  const doc = `TERMO DE HOMOLOGACAO DE PROCESSO LICITATORIO\n1 PRODUTO GENERICO - 10,000 UN 5,00 50,00 ${trecho}\n`;
  let obtido = "";
  try {
    obtido = (leTermoHomologacao(doc).itens || []).map((i) => i.marca).filter(Boolean)[0] || "";
  } catch (e) { obtido = `ERRO: ${e.message}`; }
  const ok = obtido.trim() === esperado.trim();
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${nome.padEnd(38)} → "${obtido}"${ok ? "" : `  (esperado "${esperado}")`}`);
}
console.log(falhas ? `\n✖ ${falhas} de ${CASOS.length} falharam` : `\n✔ ${CASOS.length}/${CASOS.length} passaram`);
process.exit(falhas ? 1 : 0);
