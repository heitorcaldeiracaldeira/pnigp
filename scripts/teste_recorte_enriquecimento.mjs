// TESTE DE FRONTEIRA do recorte do enriquecimento. Sem banco, sem rede.
//   node scripts/teste_recorte_enriquecimento.mjs      (sai 1 se algum caso falhar)
//
// POR QUE EXISTE
// Em 08/ago, 81,5% das 1.749.931 descrições vindas de documento começavam com letra minúscula — e a
// consulta de controle (as que começam com maiúscula) voltou VAZIA. O recorte cortava no meio da palavra
// e atravessava a âncora do item anterior, arrastando os valores dele. Exemplos reais gravados na base:
//   BRUNFELSIA UNIFLORA     → "a grandiflora manaca da flor grande 145 r 9 77 r 1 416 65 9"
//   DISJUNTOR BIFÁSICO 10 A → "egundo nbr iec 60898 3 2021 36 un 20 31 38 627 60 disjuntor"
// Estes casos travam as duas fronteiras: não truncar palavra e não invadir o item anterior.

// importa a função DE PRODUÇÃO — nada de cópia colada aqui: teste com cópia passa enquanto o código real
// muda, e foi assim que o recorte quebrado sobreviveu tanto tempo sem ninguém ver.
import { recortaBloco } from "./recorte_bloco.mjs";
const bloco = (doc, off, offs, cap = 2500) => recortaBloco(doc, off, offs, cap, 60);

let falhas = 0;
const cheque = (nome, cond, obtido) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? "ok   " : "FALHA"} ${nome.padEnd(50)}${cond ? "" : ` → "${obtido}"`}`);
};

// ── caso 1: o recuo cai no meio de "segundo"
const doc1 = "item 35 cabo flexivel 2 5mm 12 un 8 90 106 80 conforme segundo nbr iec 60898 3 2021 disjuntor bifasico 10a";
const off1 = doc1.indexOf("disjuntor");
const r1 = bloco(doc1, off1, [off1]);
cheque("nao comeca no meio da palavra ('egundo')", !/^egundo/.test(r1), r1);
cheque("primeira palavra existe inteira no documento", doc1.includes(r1.split(" ")[0]), r1);

// ── caso 2: o recuo tentaria atravessar a ancora do item anterior
const doc2 = "35 brunfelsia uniflora manaca da flor 145 9 77 1 416 65 36 brunfelsia grandiflora manaca flor grande";
const offA = doc2.indexOf("brunfelsia uniflora");
const offB = doc2.indexOf("brunfelsia grandiflora");
const r2 = bloco(doc2, offB, [offA, offB]);
cheque("nao invade o item anterior (sem valores dele)", !/145|416 65/.test(r2), r2);
cheque("contem o proprio item", /grandiflora/.test(r2), r2);

// ── caso 3: nao trunca palavra no FIM
const doc3 = "item 10 " + "parafuso sextavado inox ".repeat(4) + "especificacaomuitolonga";
const r3 = bloco(doc3, 8, [8], 40);
cheque("nao termina no meio da palavra", !/\S$/.test(r3) || doc3.includes(r3.split(" ").pop()), r3);

// ── caso 4: nao-regressao — recorte normal continua saindo
const doc4 = "1 un mascara cirurgica tripla camada com elastico caixa com 50 unidades 12 50 625 00";
const r4 = bloco(doc4, doc4.indexOf("mascara"), [doc4.indexOf("mascara")]);
cheque("recorte normal preservado", r4 && r4.includes("mascara cirurgica"), r4);

// ── caso 5: bloco curto demais continua virando null
cheque("bloco curto vira null", bloco("abc def", 0, [0]) === null, String(bloco("abc def", 0, [0])));

console.log(falhas ? `\n✖ ${falhas} falharam` : `\n✔ todos passaram`);
process.exit(falhas ? 1 : 0);
