// Motor de riscos em compras públicas — inspirado em red flags do TCU.
// Analisa contratações + indicadores agregados e aponta riscos com referência legal/jurisprudencial.

import type { Compras, Contratacao } from "./queries";

export type NivelRisco = "alto" | "medio" | "baixo";
export type RiscoCompra = {
  id: string;
  nivel: NivelRisco;
  titulo: string;
  detalhe: string;
  recomendacao: string;
  ref: string;
};

const SEM_LICITACAO = ["Dispensa", "Inexigibilidade"];

export type NivelContrato = "alto" | "medio" | "baixo" | "ok";
export type RiscoContrato = { nivel: NivelContrato; motivos: string[] };

/** Análise de risco de UMA contratação (red flags do TCU). */
export function riscoContratacao(
  c: Contratacao,
  ctx: { fornecedorConcentrado?: string } = {},
): RiscoContrato {
  const motivos: string[] = [];
  let score = 0; // 0 ok · 1 baixo · 2 médio · 3 alto
  const bump = (n: number) => (score = Math.max(score, n));

  const direta = SEM_LICITACAO.includes(c.modalidade);
  if (direta) {
    motivos.push("Contratação direta, sem licitação");
    bump(2);
    if (c.valor_contratado > 500000) {
      motivos.push("Valor elevado para contratação direta");
      bump(3);
    }
  } else if (c.economia_pct < 3) {
    motivos.push("Economia quase nula — risco de sobrepreço ou baixa disputa");
    bump(2);
  }
  if (c.economia_pct > 35) {
    motivos.push("Economia muito alta — possível superestimativa do preço de referência");
    bump(2);
  }
  if (c.situacao === "Cancelado" || c.situacao === "Deserto") {
    motivos.push(`Processo ${c.situacao.toLowerCase()}`);
    bump(2);
  }
  if (ctx.fornecedorConcentrado && c.fornecedor === ctx.fornecedorConcentrado) {
    motivos.push("Fornecedor concentra parcela elevada das compras do ente");
    bump(2);
  }

  const nivel: NivelContrato = score >= 3 ? "alto" : score === 2 ? "medio" : score === 1 ? "baixo" : "ok";
  return { nivel, motivos };
}

/** Fornecedor que concentra parcela elevada (≥22%) do valor — para sinalizar contratos. */
export function fornecedorConcentrado(contratacoes: Contratacao[]): string | undefined {
  const total = contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  if (total <= 0) return undefined;
  const m = new Map<string, number>();
  for (const c of contratacoes) m.set(c.fornecedor, (m.get(c.fornecedor) ?? 0) + c.valor_contratado);
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] / total >= 0.22 ? top[0] : undefined;
}

export function analisarRiscosCompras(
  compras: Compras | null,
  contratacoes: Contratacao[],
): RiscoCompra[] {
  const riscos: RiscoCompra[] = [];
  const total = contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  if (total <= 0) return riscos;

  // 1. Fuga à licitação (dispensa/inexigibilidade) — por valor e por quantidade
  const semLic = contratacoes.filter((c) => SEM_LICITACAO.includes(c.modalidade));
  const valorSemLic = semLic.reduce((s, c) => s + c.valor_contratado, 0);
  const shareSemLic = (valorSemLic / total) * 100;
  const qtdShare = (semLic.length / contratacoes.length) * 100;
  if (shareSemLic >= 15 || qtdShare >= 30) {
    riscos.push({
      id: "fuga-licitacao",
      nivel: shareSemLic >= 30 || qtdShare >= 50 ? "alto" : "medio",
      titulo: "Uso elevado de contratação direta (dispensa/inexigibilidade)",
      detalhe: `${semLic.length} de ${contratacoes.length} contratos (${qtdShare.toFixed(0)}%) foram sem licitação, representando ${shareSemLic.toFixed(0)}% do valor. A regra é a licitação; a contratação direta é exceção.`,
      recomendacao: "Revisar a fundamentação das dispensas/inexigibilidades e priorizar a licitação como regra.",
      ref: "Lei 14.133/2021, arts. 72–75 · jurisprudência TCU sobre excepcionalidade da contratação direta",
    });
  }

  // 2. Concentração de fornecedores
  const porForn = new Map<string, number>();
  for (const c of contratacoes) porForn.set(c.fornecedor, (porForn.get(c.fornecedor) ?? 0) + c.valor_contratado);
  const ranking = [...porForn.entries()].sort((a, b) => b[1] - a[1]);
  if (ranking.length) {
    const [nomeTop, valorTop] = ranking[0];
    const shareTop = (valorTop / total) * 100;
    if (shareTop >= 22) {
      riscos.push({
        id: "concentracao-fornecedor",
        nivel: shareTop >= 35 ? "alto" : "medio",
        titulo: "Concentração de contratações em um único fornecedor",
        detalhe: `${nomeTop} concentra ${shareTop.toFixed(0)}% do valor contratado. Alta concentração pode indicar restrição à competitividade ou direcionamento.`,
        recomendacao: "Ampliar a pesquisa de mercado e avaliar a divisão do objeto para aumentar a disputa.",
        ref: "TCU — risco de direcionamento e restrição à competitividade",
      });
    }
  }

  // 3. Fracionamento de despesa (mesmo objeto+fornecedor, várias contratações diretas)
  const grupos = new Map<string, { soma: number; n: number; objeto: string }>();
  for (const c of semLic) {
    const k = `${c.objeto}|${c.fornecedor}`;
    const g = grupos.get(k) ?? { soma: 0, n: 0, objeto: c.objeto };
    g.soma += c.valor_contratado;
    g.n += 1;
    grupos.set(k, g);
  }
  const frac = [...grupos.values()].filter((g) => g.n >= 2 && g.soma >= 100000).sort((a, b) => b.soma - a.soma);
  if (frac.length) {
    const ex = frac[0];
    riscos.push({
      id: "fracionamento",
      nivel: "alto",
      titulo: "Indício de fracionamento de despesa",
      detalhe: `Há ${frac.length} caso(s) de mesmo objeto e fornecedor com múltiplas contratações diretas. Ex.: "${ex.objeto}" — ${ex.n} contratos somando valor relevante, o que pode configurar fuga indevida à licitação.`,
      recomendacao: "Consolidar demandas previsíveis em um único procedimento licitatório e planejar as aquisições.",
      ref: "TCU Súmula 247 · Lei 14.133/2021 art. 75, §1º (vedação ao fracionamento)",
    });
  }

  // 4. Baixa economia em itens competitivos (possível sobrepreço)
  const competitivos = contratacoes.filter((c) => !SEM_LICITACAO.includes(c.modalidade));
  if (competitivos.length >= 3) {
    const econMedia = competitivos.reduce((s, c) => s + c.economia_pct, 0) / competitivos.length;
    if (econMedia < 10) {
      riscos.push({
        id: "baixa-economia",
        nivel: "medio",
        titulo: "Baixa economia nas licitações (possível sobrepreço)",
        detalhe: `Economia média de apenas ${econMedia.toFixed(1)}% sobre o valor estimado. Descontos baixos podem indicar estimativas superdimensionadas ou pouca disputa.`,
        recomendacao: "Aprimorar a pesquisa de preços (ampla e atualizada) antes de definir o valor de referência.",
        ref: "TCU — exigência de ampla pesquisa de preços para evitar sobrepreço",
      });
    }
  }

  // 5. Publicidade no PNCP
  if (compras && compras.transparencia_pncp < 90) {
    riscos.push({
      id: "transparencia-pncp",
      nivel: compras.transparencia_pncp < 70 ? "medio" : "baixo",
      titulo: "Publicidade no PNCP abaixo do esperado",
      detalhe: `Apenas ${compras.transparencia_pncp.toFixed(0)}% dos contratos foram publicados no PNCP. A divulgação é obrigatória e condição de eficácia do contrato.`,
      recomendacao: "Garantir a publicação tempestiva de todos os atos no Portal Nacional de Contratações Públicas.",
      ref: "Lei 14.133/2021, art. 174 (PNCP) e art. 94 (divulgação obrigatória)",
    });
  }

  // 6. Morosidade
  if (compras && compras.prazo_medio_dias > 75) {
    riscos.push({
      id: "morosidade",
      nivel: "baixo",
      titulo: "Prazo médio de contratação elevado",
      detalhe: `Tempo médio de ${compras.prazo_medio_dias.toFixed(0)} dias da abertura à assinatura, acima do razoável, podendo prejudicar a entrega dos serviços.`,
      recomendacao: "Revisar o fluxo do processo de contratação e eliminar gargalos administrativos.",
      ref: "TCU — eficiência e celeridade na gestão das contratações",
    });
  }

  const ordem: Record<NivelRisco, number> = { alto: 0, medio: 1, baixo: 2 };
  return riscos.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
