// ESPECIFICAÇÃO × PLANILHA POBRE × CLÁUSULA — o bloco achado no documento é mesmo a especificação do item?
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE REGEX TEM QUE MORAR EM .mjs. Tentei injetar isto por `sed`/`node -e` e as barras
// invertidas foram COMIDAS: `\d+\s*` virou `d+s*`, `\s*:` virou `s*:`. Não dá erro de sintaxe — dá resultado
// errado EM SILÊNCIO. A memória do projeto documenta essa armadilha desde a manhã de 2026-07-15 e eu caí nela
// duas vezes no mesmo dia. Nunca gerar regex por shell.
//
// ═══ DE ONDE VEIO A REGRA (do DADO, não da minha intuição — as duas que eu tinha morreram) ═══
//  ✗ "planilha é ruim"                   → morreu na BARRACA: a especificação vem DENTRO da linha de preço
//                                          ("Material: Lona PVC TD1000, Armação: Metalon Galvanizado … R$ 9.933,33")
//  ✗ "unidade técnica indica espec."      → morreu no ROLO: "ROLO DE PINTURA DE LÃ SINTÉTICA 23 CM" — o "23 CM" é
//                                          o NOME do produto, não uma especificação. Idem "280GR".
//  ✗ "R$ é sinal de planilha"             → ruído puro. Preço e especificação convivem na mesma linha.
//
// ✅ O QUE SOBROU, e é uma distinção humana: **especificação é alguém DESCREVENDO ou EXIGINDO.**
//     ATTR — descreve com rótulo:  "Material:", "Tipo:", "Armação:", "Cor:", "Largura:"
//     EXIG — exige:                "deverá", "mínimo", "garantia", "marca", "certificação"
//     NORM — norma técnica:        ABNT, NBR, INMETRO, ISO, ANVISA
//     TEC  — unidade técnica:      só REFORÇO, NUNCA sozinho (aparece em nome de produto)
//   Nome de produto não descreve nem exige — só nomeia. É o que separa o Smart TV do ROLO.
//
// ═══ PORTÃO ═══ sem ATTR, sem EXIG e sem NORM → NÃO é especificação, por mais unidade técnica que tenha.
//
// MEDIDO: 8/8, com 3 controles NOVOS (sumário do edital, cláusula de pagamento, espec. de pneu) que não foram
// usados para calibrar — senão a regra decora em vez de generalizar.
//
// Rodar os testes:  node scripts/classifica_especificacao.mjs

const TEC  = /\b\d+\s*(mm|cm|m²|m2|kg|g\b|ml|litros?|w\b|v\b|volts?|btu|polegadas?|amp|hz|rpm|gr\b)/gi;
const NORM = /\b(abnt|nbr|inmetro|iso\s*\d|anvisa|nr-?\d|din\b|astm)/gi;
const EXIG = /\b(dever[áa]|deve\s+(ser|ter|possuir)|m[íi]nim[oa]|m[áa]xim[oa]|garantia|caracter[íi]sticas?|composi[çc][ãa]o|marca|fabricante|certifica)/gi;
const ATTR = /\b(material|tipo|cor|tamanho|dimens[õo]es|capacidade|pot[êe]ncia|volt|modelo|arma[çc][ãa]o|acabamento|espessura|largura|comprimento|altura|peso|volume|apresenta[çc][ãa]o|formato|aplica[çc][ãa]o|folhas?)\s*:/gi;

/**
 * @param {string} bloco  o recorte do TR/Projeto Básico/Edital onde o produto foi achado
 * @returns {{ok:boolean, score:number, att:number, exi:number, nor:number, tec:number}}
 *          ok = é especificação e vale gravar/mandar ao LLM
 */
export function ehEspecificacao(bloco) {
  const t = String(bloco || "").toLowerCase();
  const n = t.length || 1;
  const tec = (t.match(TEC) || []).length;
  const nor = (t.match(NORM) || []).length;
  const exi = (t.match(EXIG) || []).length;
  const att = (t.match(ATTR) || []).length;
  // PORTÃO: ninguém descrevendo, ninguém exigindo, nenhuma norma → é nome/planilha/cláusula, não especificação
  if (att === 0 && exi === 0 && nor === 0) return { ok: false, score: 0, att, exi, nor, tec };
  // densidade por 100 chars: bloco grande não ganha só por ser grande
  const score = Number((100 * (att * 3 + exi * 2 + nor * 3 + tec) / n).toFixed(2));
  return { ok: score >= 0.8, score, att, exi, nor, tec };
}

// ─── TESTES (rodar o arquivo direto) ──────────────────────────────────────────────────────────────────────────
// Os 5 primeiros são casos REAIS de 2026-07-15 — incluindo os 2 falsos positivos que eu entreguei como acerto.
// Os 3 [novo] são CONTROLE: não foram usados p/ calibrar. Sem eles a regra só decoraria os 5.
// (comparar por basename: no Windows import.meta.url é `file:///C:/...` com TRÊS barras e a montagem manual erra)
if (process.argv[1] && process.argv[1].endsWith("classifica_especificacao.mjs")) {
  const CASOS = [
    ["rolo de pintura (planilha POBRE)", false,
      "SPARENTE 280GR TUBO 50 15,75 787,50 93 SOLVENTE PARA TINTA OLEO E ESMALTE LITRO 60 18,00 1.080,00 94 THINNER LITRO 40 22,50 900,00 95 ROLO DE PINTURA DE LA SINTETICA 23 CM UNIDADE 30 12,90 387,00"],
    ["administração local (cláusula)", false,
      "cução do presente Contrato, ressalvados os requerimentos manifestamente impertinentes, meramente protelatórios, de nenhum interesse para a boa execução do ajuste, a administração local do contrato caberá"],
    ["Smart TV (especificação no edital)", true,
      "Smart TV Televisor LED de mínimo 55 polegada, Wi-Fi embutido, resolução de tela 4k ou superior, tipo de tela: LED, design slim; conversor digital integrado, tipo smart (navegador web, download de aplicativos, conexão dlna, wifi direct); potência mínima de áudio: 9,5w + 9,5w; recursos de áudio: dolby digital plus ou dts; manual em português; voltagem: bivolt e controle remoto. O item deve ter garantia mínima de 01(um) ano. A marca ofertada pela CONTRATADA deverá ter assistência técnica autorizada"],
    ["Barraca (planilha RICA — espec. na linha)", true,
      "Barraca / Barraca Acampamento (Tipo: Feira Livre/Cobertura, Material: Lona PVC TD1000, Armação: Metalon Galvanizado) 634129 Unidade 4 R$ 9.933,33 R$ 39.733,32"],
    ["Guardanapo (planilha RICA)", true,
      "Guardanapo De Papel Material: Celulose , Largura: 24 CM, Comprimento: 24 CM, Cor: Branca , Tipo Folhas: Dupla, Características Adicionais: 396052 PC 8"],
    ["[novo] sumário do edital", false,
      "1. DO OBJETO 2. DA PARTICIPAÇÃO 3. DO CREDENCIAMENTO 4. DA PROPOSTA 5. DO JULGAMENTO 6. DOS RECURSOS 7. DA HOMOLOGAÇÃO 8. DO PAGAMENTO 9. DAS SANÇÕES 10. DAS DISPOSIÇÕES GERAIS"],
    ["[novo] cláusula de pagamento", false,
      "O pagamento será efetuado em até 30 (trinta) dias após o recebimento definitivo do objeto, mediante apresentação da nota fiscal devidamente atestada pelo setor competente."],
    ["[novo] especificação de pneu", true,
      "PNEU 275/80 R22,5 - Pneu radial, uso misto, borracha natural, índice de carga mínimo 149/146, certificação INMETRO obrigatória, garantia de 5 anos contra defeitos de fabricação."],
  ];
  console.log(`${"caso".padEnd(42)} ${"tec".padStart(3)} ${"nrm".padStart(3)} ${"exi".padStart(3)} ${"att".padStart(3)} ${"score".padStart(6)}  ${"veredito".padEnd(6)} esperado`);
  let ok = 0;
  for (const [nome, esperado, bloco] of CASOS) {
    const c = ehEspecificacao(bloco);
    const acertou = c.ok === esperado;
    if (acertou) ok++;
    console.log(`${nome.padEnd(42)} ${String(c.tec).padStart(3)} ${String(c.nor).padStart(3)} ${String(c.exi).padStart(3)} ${String(c.att).padStart(3)} ${String(c.score).padStart(6)}  ${(c.ok ? "SIM" : "não").padEnd(6)} ${esperado ? "SIM" : "não"} ${acertou ? "✓" : "✗ ERROU"}`);
  }
  console.log(`\n${ok} de ${CASOS.length} certos  (3 são controles NOVOS, não usados para calibrar)`);
  if (ok < CASOS.length) process.exit(1);
}
