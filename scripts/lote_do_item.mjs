// ITEM ↔ LOTE — a lógica, com testes.
//
// ═══ O QUE O USUÁRIO ENSINOU (2026-07-16), e que muda tudo ═══
// **O TR vem PRIMEIRO. O sistema publica DEPOIS.** O servidor digita os itens no sistema LENDO o TR.
// Consequências, e são três:
//   1. A SEQUÊNCIA se preserva — ele digita na ordem em que está escrito.
//   2. A NUMERAÇÃO não — o TR numera por LOTE, o sistema numera por ITEM. Um lote pode ter vários itens.
//   3. O PNCP não tem campo de lote (manual: "cada item OU lote" — é a MESMA entidade, não há estrutura p/ lote).
//      Então o servidor **escreve o lote na descrição**. É o mesmo padrão de "veiculo" e "conforme TR":
//      **o que não cabe na estrutura vaza para o texto.**
//
// Caso real — Balneário Piçarras 2025/57 (5 itens, 4 lotes):
//      item 1 → "Lote 1 - Móveis sob medida…"
//      item 2 → "Lote 2 - Bancadas/peças de granito…"
//      item 3 → "Lote 3 - TORNEIRA COM PEDAL…"
//      item 4 → "Lote 4 - LONGARINA COM 2 LUGARES"   ← os dois últimos
//      item 5 → "Lote 4 - LONGARINA COM 3 LUGARES"   ← são o MESMO lote
//
// Medido: 93.772 itens em 5.195 processos trazem o lote escrito. São 4,28% do total — nos outros, ou o processo
// é por item mesmo (não há lote), ou o servidor não copiou o rótulo.
//
// ⚠️ ESTE ARQUIVO SÓ LÊ O QUE ESTÁ ESCRITO. Não adivinha lote onde não há.
// node scripts/lote_do_item.mjs   (roda os testes)

// "Lote 4 - ...", "LOTE 04 – ...", "Lote nº 4:", "Lote: 4"
const RE_LOTE = /^\s*lote\s*[:nN]?\s*[º°]?\s*(\d{1,4})\s*(?:[-–—:.)\]]|\s)/i;

/** o lote que o servidor ESCREVEU na descrição. null = não escreveu (não inventar). */
export function loteDe(descricao) {
  const m = RE_LOTE.exec(String(descricao || "").replace(/<[^>]*>/g, " "));
  return m ? parseInt(m[1], 10) : null;
}

/**
 * A ordem se preservou? Teste de FALSEAÇÃO: se o TR vem primeiro e o servidor digita lendo, o número do lote
 * NUNCA decresce ao percorrer os itens em ordem. Não prova que casou — mas se quebrar, a hipótese morre.
 * @param {{numero:number, descricao:string}[]} itens
 * @returns {{testa:boolean, ordemOk:boolean, lotes:(number|null)[], nLotes:number, motivo:string}}
 */
export function ordemPreservada(itens) {
  const orden = [...itens].sort((a, b) => a.numero - b.numero);
  const lotes = orden.map((i) => loteDe(i.descricao));
  const conhecidos = lotes.filter((l) => l != null);
  if (conhecidos.length < 2) return { testa: false, ordemOk: false, lotes, nLotes: new Set(conhecidos).size, motivo: "menos de 2 itens com lote escrito — não testa" };
  const nLotes = new Set(conhecidos).size;
  if (nLotes < 2) return { testa: false, ordemOk: false, lotes, nLotes, motivo: "1 lote só — não testa a ordem" };
  for (let i = 1; i < conhecidos.length; i++)
    if (conhecidos[i] < conhecidos[i - 1])
      return { testa: true, ordemOk: false, lotes, nLotes, motivo: `lote ${conhecidos[i]} veio depois do ${conhecidos[i - 1]}` };
  return { testa: true, ordemOk: true, lotes, nLotes, motivo: "lote nunca decresce" };
}

/** agrupa os itens por lote — é o mapa item→lote que o TR usa e o PNCP não tem */
export function porLote(itens) {
  const g = new Map();
  for (const i of itens) {
    const l = loteDe(i.descricao);
    if (l == null) continue;
    if (!g.has(l)) g.set(l, []);
    g.get(l).push(i.numero);
  }
  return g;
}

// ─── TESTES ───────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("lote_do_item.mjs")) {
  let ok = 0, n = 0;
  const t = (nome, real, esp) => { n++; const p = JSON.stringify(real) === JSON.stringify(esp); if (p) ok++;
    console.log(`${p ? "✓" : "✗"} ${nome.padEnd(54)}${p ? "" : `\n    obtido ${JSON.stringify(real)} ≠ esperado ${JSON.stringify(esp)}`}`); };

  // ler o que está escrito
  t("Lote 4 - LONGARINA", loteDe("Lote 4 - LONGARINA COM 2 LUGARES"), 4);
  t("LOTE 04 – maiúsculo, travessão", loteDe("LOTE 04 – BANCADAS"), 4);
  t("Lote nº 12:", loteDe("Lote nº 12: TORNEIRA"), 12);
  t("com HTML na frente", loteDe("<p>Lote 3 - Cimento</p>"), 3);
  // NÃO inventar
  t("sem lote → null", loteDe("Smart TV"), null);
  t("'lote' no meio NÃO conta", loteDe("Cimento para o lote 3 da obra"), null);
  t("'lotação' não é lote", loteDe("Lotação máxima 40 pessoas"), null);
  t("descrição vazia → null", loteDe(""), null);

  // 🔑 O CASO REAL: Piçarras 2025/57 — 5 itens, 4 lotes, os dois últimos no mesmo
  const PICARRAS = [
    { numero: 1, descricao: "Lote 1 - Móveis sob medida feitos de MDF para ambientes diversos" },
    { numero: 2, descricao: "Lote 2 - Bancadas/peças de granito preto São Gabriel" },
    { numero: 3, descricao: "Lote 3 - TORNEIRA COM PEDAL COMPLETA" },
    { numero: 4, descricao: "Lote 4 - LONGARINA COM 2 LUGARES" },
    { numero: 5, descricao: "Lote 4 - LONGARINA COM 3 LUGARES" },
  ];
  const r = ordemPreservada(PICARRAS);
  t("Piçarras: a ordem se preserva", r.ordemOk, true);
  t("Piçarras: 5 itens em 4 lotes", r.nLotes, 4);
  t("Piçarras: itens 4 e 5 são o MESMO lote", [...porLote(PICARRAS).get(4)], [4, 5]);
  t("Piçarras: lote 1 tem só o item 1", [...porLote(PICARRAS).get(1)], [1]);

  // falseação: a hipótese TEM que morrer se a ordem quebrar
  t("ordem quebrada é DETECTADA", ordemPreservada([
    { numero: 1, descricao: "Lote 3 - x" }, { numero: 2, descricao: "Lote 1 - y" }]).ordemOk, false);
  t("...e diz por quê", ordemPreservada([
    { numero: 1, descricao: "Lote 3 - x" }, { numero: 2, descricao: "Lote 1 - y" }]).motivo, "lote 1 veio depois do 3");

  // o que NÃO testa nada — não pode contar como acerto
  t("1 lote só não testa a ordem", ordemPreservada([
    { numero: 1, descricao: "Lote 1 - x" }, { numero: 2, descricao: "Lote 1 - y" }]).testa, false);
  t("sem lote escrito não testa", ordemPreservada([
    { numero: 1, descricao: "Smart TV" }, { numero: 2, descricao: "Notebook" }]).testa, false);
  // item fora de ordem na entrada não pode enganar
  t("ordena por numero antes de testar", ordemPreservada([
    { numero: 2, descricao: "Lote 2 - y" }, { numero: 1, descricao: "Lote 1 - x" }]).ordemOk, true);

  console.log(`\n${ok} de ${n} certos`);
  if (ok < n) process.exit(1);
}
