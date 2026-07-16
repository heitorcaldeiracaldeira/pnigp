// ACHA A LINHA DO ITEM NO DOCUMENTO — ancorando no NÚMERO, não na palavra.
//
// POR QUE: a descrição curta não tem token que ancore. Caso real (Florianópolis 2024/94 item 1): a descrição é
// **"veiculo"** — 7 letras, uma palavra só, que aparece dezenas de vezes no edital. Ancorar nela é impossível.
// Mas o `valorUnitarioEstimado` = 108.730,60 é ÚNICO no documento, e está na planilha do TR.
//
// A INVERSÃO: passei a noite tratando a planilha como ímã de falso positivo. Ela é a PONTE — é o único lugar do
// PDF onde coexistem os cinco campos que a API me dá (nº do item, descrição, unidade, quantidade, preço estimado).
// A planilha LOCALIZA; o classificador (classifica_especificacao.mjs) JULGA o que vem em volta.
//
// ORDEM DAS ÂNCORAS, da mais forte p/ a mais fraca:
//   1. valor estimado formatado  "108.730,60"   → único; cobre 99,8% dos itens (a API dá)
//   2. valor homologado          "108.230,00"   → às vezes o doc é posterior ao resultado
//   3. token raro da descrição   "smart"        → só serve p/ descrição rica (a que não precisa de ajuda)
// Confirmação: nº do item e quantidade perto da âncora → é a linha certa, não uma coincidência de número.
//
// node scripts/ancora_item_documento.mjs   (roda os testes embutidos)

/** normalização com teste — o normalizador quebrado foi o que fez "veiculo" não achar "VEÍCULO" */
export function normaliza(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // 🔴 range dos diacríticos combinantes. Escrever o RANGE, nunca colar o
    .replace(/[^a-z0-9,. ]/g, " ")     //    caractere: colado, ele se perde em cópia/sed e o acento sobrevive.
    .replace(/\s+/g, " ")
    .trim();
}

/** as formas que um valor pode aparecer no PDF: 108730.6 → ["108.730,60", "108730,60", "108.730,6"] */
export function formasDoValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const f2 = n.toFixed(2);                                    // "108730.60"
  const [int, dec] = f2.split(".");
  const comPonto = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");  // "108.730"
  // 🔴 O que impede um valor de ancorar NÃO é o comprimento — é a FREQUÊNCIA. "50,00" aparece cem vezes num
  // edital; "108.730,60" aparece uma. Meu 1º filtro era `length>=5` e deixava "50,00" passar (tem 5).
  // Piso em 1.000: força separador de milhar e ~6 dígitos significativos. É PALPITE — o certo é medir a
  // frequência real no corpus e calibrar. Enquanto não medir, fica conservador: valor baixo NÃO ancora.
  if (n < 1000) return [];
  return [...new Set([`${comPonto},${dec}`, `${int},${dec}`, `${comPonto},${dec.replace(/0$/, "")}`])];
}

/**
 * Acha a linha do item no texto do documento.
 * @param {string} texto   texto do PDF (já sem NUL)
 * @param {{numero:number, quantidade:number, unit_estimado:number, unit_homologado:number, descricao:string}} item
 * @returns {{ancora:string, tipo:string, pos:number, bloco:string, confirmacoes:string[]}|null}
 */
export function ancoraItem(texto, item) {
  const T = String(texto || "");
  const tentativas = [
    ...formasDoValor(item.unit_estimado).map((v) => ({ v, tipo: "valor_estimado" })),
    ...formasDoValor(item.unit_homologado).map((v) => ({ v, tipo: "valor_homologado" })),
  ];
  for (const { v, tipo } of tentativas) {
    let pos = T.indexOf(v);
    while (pos >= 0) {
      // a linha do item: um pouco ANTES da âncora (nº, descrição, unidade, qtd) e DEPOIS (total, próximo item)
      const bloco = T.slice(Math.max(0, pos - 400), pos + 500).replace(/\s+/g, " ").trim();
      const B = normaliza(bloco);
      const conf = [];
      // confirma que é a linha CERTA — número igual pode ser coincidência
      if (item.quantidade > 0 && new RegExp(`\\b${item.quantidade}\\b`).test(B)) conf.push("quantidade");
      if (item.numero > 0 && new RegExp(`\\b${item.numero}\\b`).test(B)) conf.push("numero_item");
      const p = normaliza(item.descricao).split(" ").filter((x) => x.length > 3)[0];
      if (p && B.includes(p)) conf.push("descricao");
      if (conf.length >= 1) return { ancora: v, tipo, pos, bloco, confirmacoes: conf };
      pos = T.indexOf(v, pos + 1);
    }
  }
  return null;
}

// ─── TESTES ───────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("ancora_item_documento.mjs")) {
  let ok = 0, n = 0;
  const t = (nome, real, esperado) => { n++; const p = JSON.stringify(real) === JSON.stringify(esperado);
    if (p) ok++; console.log(`${p ? "✓" : "✗"} ${nome.padEnd(52)} ${p ? "" : `\n    obtido:   ${JSON.stringify(real)}\n    esperado: ${JSON.stringify(esperado)}`}`); };

  // 🔴 O BUG QUE ORIGINOU ESTE ARQUIVO: "veiculo" (como o município digita) tem que casar com "VEÍCULO" (como o
  // documento escreve). O normalizador quebrado deixava "ve culo" e nunca casava.
  t("normaliza tira acento: VEÍCULO → veiculo", normaliza("VEÍCULO"), "veiculo");
  t("normaliza: Automóvel Ambulância", normaliza("Automóvel Ambulância"), "automovel ambulancia");
  t("normaliza mantém número e vírgula", normaliza("R$ 108.730,60"), "r 108.730,60");
  t("formas do valor 108730.6", formasDoValor(108730.6), ["108.730,60", "108730,60", "108.730,6"]);
  t("valor baixo NÃO ancora (comum demais)", formasDoValor(50), []);
  t("valor baixo, mesmo com 6 chars, não ancora", formasDoValor(150), []);
  t("a partir de 1.000 ancora", formasDoValor(1500), ["1.500,00", "1500,00", "1.500,0"]);

  // a planilha real do caso Florianópolis (formato típico: nº · descrição · und · qtd · unit · total)
  const PLANILHA = "ANEXO I - PLANILHA ITEM DESCRIÇÃO UNIDADE QUANT. VALOR UNITÁRIO VALOR TOTAL " +
    "1 VEÍCULO tipo automóvel, motor 1.0, 4 portas UNIDADE 1 R$ 108.730,60 R$ 108.730,60 " +
    "2 VEÍCULO tipo utilitário UNIDADE 2 R$ 95.000,00 R$ 190.000,00";
  const item = { numero: 1, quantidade: 1, unit_estimado: 108730.6, unit_homologado: 108230, descricao: "veiculo" };
  const a = ancoraItem(PLANILHA, item);
  t("acha pelo VALOR (a descrição 'veiculo' não ancora)", a?.ancora, "108.730,60");
  t("diz de onde veio a âncora", a?.tipo, "valor_estimado");
  t("confirma que é a linha certa", a?.confirmacoes?.includes("quantidade"), true);
  t("acha 'veiculo' no bloco (acento normalizado)", normaliza(a?.bloco || "").includes("veiculo"), true);

  // não pode achar item que não está lá
  t("valor inexistente → null", ancoraItem(PLANILHA, { numero: 9, quantidade: 1, unit_estimado: 777777.77, unit_homologado: 0, descricao: "x" }), null);

  console.log(`\n${ok} de ${n} certos`);
  if (ok < n) process.exit(1);
}
