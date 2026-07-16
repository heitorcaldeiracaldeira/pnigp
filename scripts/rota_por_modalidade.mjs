// ROTEAMENTO POR MODALIDADE — a modalidade PREDIZ o que existe. Sem isto são 5 problemas diferentes empilhados.
//
// ═══ POR QUE (medido 2026-07-15) ═══
// Rodei 15 casos misturando obra, serviço, dispensa e pregão e fiquei ajustando regex p/ dar conta de todos ao
// mesmo tempo. Resultado: 1 acerto em 15. Não era um problema difícil — eram problemas DIFERENTES.
//
// E o roteamento derruba o número que eu vinha repetindo o dia todo ("36,8% das compras de SC sem disputa"):
//   Pregão - Eletrônico       721.034 itens   13,7% sem disputa   ← o número REAL
//   Concorrência - Eletrônica  29.311         11,1%
//   Inexigibilidade            81.645         99,1%   ← fornecedor único POR LEI (art. 74)
//   Credenciamento             26.484         99,5%   ← contrata todos que se habilitam, POR DESENHO
//   Dispensa                  240.820         82,4%   ← muitas sem disputa POR NATUREZA
//   Leilão                      2.064         ~99%    ← é VENDA, não compra
// Somar tudo e anunciar 36,8% é contar quantos solteiros são casados. O achado é **13,7% no pregão eletrônico**
// = 97.323 itens arrematados no estimado ou acima, em processos que existem para gerar concorrência.
//
// ⚠️ TUDO AQUI SAI DA TABELA DE DOMÍNIO DO PNCP (§5.2 modalidade, §5.1 instrumento convocatório), não de palpite.
//    O que eu NÃO medi está marcado. Ver docs/api-pncp-referencia.md.

/** §5.2 — as 13 modalidades. `n` = itens homologados em SC (medido 15/07). */
export const MODALIDADE = {
  6:  { nome: "Pregão - Eletrônico",       n: 721034, familia: "bem_comum" },
  7:  { nome: "Pregão - Presencial",       n: 25103,  familia: "bem_comum" },
  8:  { nome: "Dispensa",                  n: 240820, familia: "direta" },
  9:  { nome: "Inexigibilidade",           n: 81645,  familia: "direta_exclusiva" },
  4:  { nome: "Concorrência - Eletrônica", n: 29311,  familia: "obra" },
  5:  { nome: "Concorrência - Presencial", n: 0,      familia: "obra" },
  12: { nome: "Credenciamento",            n: 26484,  familia: "credenciamento" },
  1:  { nome: "Leilão - Eletrônico",       n: 1317,   familia: "alienacao" },
  13: { nome: "Leilão - Presencial",       n: 747,    familia: "alienacao" },
  3:  { nome: "Concurso",                  n: 0,      familia: "concurso" },
  2:  { nome: "Diálogo Competitivo",       n: 0,      familia: "bem_comum" },
  10: { nome: "Manifestação de Interesse", n: 0,      familia: "outro" },
  11: { nome: "Pré-qualificação",          n: 0,      familia: "outro" },
};

/** §5.1 — o instrumento convocatório diz QUAL documento existe. Procurar edital onde há só "Ato que autoriza"
 *  é procurar o que nunca foi publicado. */
export const INSTRUMENTO = {
  1: "Edital",                              // pregão, concorrência, concurso, diálogo, credenciamento
  2: "Aviso de Contratação Direta",         // Dispensa COM disputa
  3: "Ato que autoriza a Contratação Direta", // Dispensa SEM disputa / Inexigibilidade
};

/**
 * A rota de um item, dada a modalidade da contratação.
 * @returns {{familia:string, buscarEspec:boolean, docs:number[], disputaEsperada:boolean, marcaEm:string, porque:string}}
 *   docs = tipo_documento_id do PNCP (§5.12) na ORDEM de tentativa. [] = não procure.
 */
export function rota(modalidadeId) {
  const m = MODALIDADE[modalidadeId];
  const f = m?.familia || "outro";
  switch (f) {
    case "bem_comum":   // PREGÃO — é aqui que a especificação de produto vive
      return { familia: f, buscarEspec: true, docs: [4, 6, 2], disputaEsperada: true, marcaEm: "ata",
        porque: "bem/serviço comum: o TR especifica o produto e a disputa é o ponto do processo (13,7% sem disputa = ACHADO)" };

    case "obra":        // CONCORRÊNCIA — o item é a obra inteira, qty 1. Não há produto a especificar.
      return { familia: f, buscarEspec: false, docs: [], disputaEsperada: true, marcaEm: "nenhum",
        porque: "obra: o item É o objeto (qty 1, valor do contrato). Especificação está no SINAPI, catálogo externo. " +
                "Art. 23: objeto único não tem preço comparável — não entra no banco de preços" };

    case "direta":      // DISPENSA — 240.820 itens. Pode não ter edital NENHUM.
      return { familia: f, buscarEspec: true, docs: [4, 2, 16], disputaEsperada: false, marcaEm: "ata_ou_proposta",
        porque: "dispensa: 82,4% sem disputa é NATUREZA, não anomalia. Checar tipoInstrumentoConvocatorio ANTES — " +
                "se for 3 (Ato que autoriza), não existe edital; o que há cai em 'Outros Documentos' (16)" };

    case "direta_exclusiva":  // INEXIGIBILIDADE — 81.645 itens, 99,1% sem disputa POR LEI (art. 74)
      return { familia: f, buscarEspec: true, docs: [16], disputaEsperada: false, marcaEm: "razao_da_escolha",
        porque: "fornecedor exclusivo: 99,1% sem disputa é a LEI, não falha. 🔑 A MARCA é a própria justificativa — " +
                "está na 'razão da escolha do contratado', que cai em 'Outros Documentos' (16). Lógica PRÓPRIA" };

    case "credenciamento":    // 26.484 itens, 99,5% sem disputa POR DESENHO
      return { familia: f, buscarEspec: false, docs: [], disputaEsperada: false, marcaEm: "nenhum",
        porque: "credencia TODOS que se habilitam: não existe vencedor nem disputa. Preço é fixado pela Administração. " +
                "Alerta de proposta aberta aqui não muda nada" };

    case "alienacao":         // LEILÃO — é VENDA
      return { familia: f, buscarEspec: false, docs: [], disputaEsperada: true, marcaEm: "nenhum",
        porque: "leilão é ALIENAÇÃO: o município VENDE. Não é compra — fora do banco de compras" };

    default:
      return { familia: f, buscarEspec: false, docs: [], disputaEsperada: false, marcaEm: "desconhecido",
        porque: "modalidade sem volume medido em SC — [NÃO ESTUDADO], não inventar comportamento" };
  }
}

/** o "% sem disputa" só significa alguma coisa onde a disputa é ESPERADA. */
export const disputaVale = (modalidadeId) => rota(modalidadeId).disputaEsperada;

// ─── TESTES ───────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("rota_por_modalidade.mjs")) {
  let ok = 0, n = 0;
  const t = (nome, real, esp) => { n++; const p = JSON.stringify(real) === JSON.stringify(esp); if (p) ok++;
    console.log(`${p ? "✓" : "✗"} ${nome.padEnd(56)}${p ? "" : ` obtido ${JSON.stringify(real)} ≠ ${JSON.stringify(esp)}`}`); };

  t("Pregão-E: procura espec., TR primeiro", rota(6).docs, [4, 6, 2]);
  t("Pregão-E: disputa é esperada", rota(6).disputaEsperada, true);
  t("Concorrência (obra): NÃO procura espec. de produto", rota(4).buscarEspec, false);
  t("Concorrência (obra): nenhum documento a varrer", rota(4).docs, []);
  t("Inexigibilidade: marca está na razão da escolha", rota(9).marcaEm, "razao_da_escolha");
  t("Inexigibilidade: disputa NÃO é esperada (art. 74)", rota(9).disputaEsperada, false);
  t("Inexigibilidade: só 'Outros Documentos' (16)", rota(9).docs, [16]);
  t("Credenciamento: sem disputa por desenho", rota(12).disputaEsperada, false);
  t("Credenciamento: não procura espec.", rota(12).buscarEspec, false);
  t("Leilão: é venda, fora do banco de compras", rota(1).buscarEspec, false);
  t("Dispensa: procura, mas inclui o balde 16", rota(8).docs, [4, 2, 16]);
  t("Dispensa: sem disputa é natureza, não anomalia", rota(8).disputaEsperada, false);
  t("modalidade desconhecida não inventa rota", rota(99).familia, "outro");
  // o erro do dia: somar 'sem disputa' de quem não pode ter disputa
  t("o % sem disputa vale no pregão", disputaVale(6), true);
  t("o % sem disputa NÃO vale na inexigibilidade", disputaVale(9), false);
  t("o % sem disputa NÃO vale no credenciamento", disputaVale(12), false);
  console.log(`\n${ok} de ${n} certos`);
  if (ok < n) process.exit(1);
}
