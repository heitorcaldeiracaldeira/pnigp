// Gera insights narrativos a partir de dados REAIS já carregados (sem fabricar nada).
// Cada insight aponta o quê, o porquê (com número) e a ação. Severidade ordena a exibição.
import type { Cruzamentos, DiagGestor, EducacaoSC, SaudeSC, RankFiscalSC } from "@/lib/queries";

export type Insight = { severidade: "critico" | "atencao" | "oportunidade" | "destaque"; area: string; titulo: string; detalhe: string; acao?: string };
const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function gerarInsightsSC(d: {
  diag: DiagGestor; cruz: Cruzamentos; saude: NonNullable<SaudeSC> | null; educacao: NonNullable<EducacaoSC> | null; pos: RankFiscalSC | null; total: number;
}): Insight[] {
  const out: Insight[] = [];
  const { diag, cruz, saude, educacao, pos, total } = d;

  // CRÍTICO — mínimos constitucionais
  if (saude?.saudePct != null && saude.saudePct < 15)
    out.push({ severidade: "critico", area: "Saúde", titulo: "Aplicação em saúde abaixo do mínimo", detalhe: `${n1(saude.saudePct)}% da receita em saúde — abaixo dos 15% exigidos (LC 141).`, acao: "Reforçar a despesa em ASPS até o mínimo legal antes do fechamento do exercício." });
  if (educacao?.educPct != null && educacao.educPct < 25)
    out.push({ severidade: "critico", area: "Educação", titulo: "Aplicação em educação abaixo do mínimo", detalhe: `${n1(educacao.educPct)}% em MDE — abaixo dos 25% (CF art. 212).`, acao: "Ajustar a aplicação em educação para cumprir o mínimo constitucional." });

  // CRÍTICO/ATENÇÃO — alertas legais do diagnóstico (LRF/DCL etc.)
  for (const p of (diag?.pontos || []).filter((x) => x.alerta).slice(0, 2))
    out.push({ severidade: /limite|acima do limite|déficit/i.test(p.sugestao) ? "critico" : "atencao", area: "Fiscal", titulo: p.titulo, detalhe: `${p.valor} — ${p.ref}.`, acao: p.sugestao || undefined });

  // ATENÇÃO — comparações vs pares
  if (cruz?.fiscal && cruz.fiscal.dependencia > cruz.fiscal.dependenciaPares * 1.15)
    out.push({ severidade: "atencao", area: "Fiscal", titulo: "Alta dependência de transferências", detalhe: `${n1(cruz.fiscal.dependencia)}% da receita vem de transferências — acima dos pares (${n1(cruz.fiscal.dependenciaPares)}%).`, acao: "Fortalecer a arrecadação própria (IPTU/ISS, dívida ativa) para ganhar autonomia." });
  if (cruz?.compras && cruz.compras.dispensaPct > cruz.compras.dispensaPares && cruz.compras.dispensaPct >= 25)
    out.push({ severidade: "atencao", area: "Compras", titulo: "Muitas compras sem licitação", detalhe: `${n1(cruz.compras.dispensaPct)}% em dispensa/inexigibilidade — acima dos pares (${n1(cruz.compras.dispensaPares)}%).`, acao: "Planejar compras (PCA) e ampliar pregão/concorrência para reduzir risco de preço." });
  if (saude && saude.estabMil < saude.estabMilPares * 0.85)
    out.push({ severidade: "atencao", area: "Saúde", titulo: "Rede de saúde abaixo dos pares", detalhe: `${n1(saude.estabMil)} estabelecimentos/mil hab vs ${n1(saude.estabMilPares)} dos pares.`, acao: "Avaliar ampliação da rede ou pactuação regional de serviços." });
  if (saude && saude.internMil > 0 && saude.internMil < saude.internMilPares * 0.85)
    out.push({ severidade: "atencao", area: "Saúde", titulo: "Produção hospitalar abaixo dos pares", detalhe: `${n1(saude.internMil)} internações/mil hab vs ${n1(saude.internMilPares)} dos pares.`, acao: "Investigar acesso/resolutividade e fluxo de referência regional." });
  if (educacao?.alfab != null && educacao.alfab < educacao.alfabPares * 0.9)
    out.push({ severidade: "atencao", area: "Educação", titulo: "Alfabetização abaixo dos pares", detalhe: `${n1(educacao.alfab)}% vs ${n1(educacao.alfabPares)}% dos pares de porte.`, acao: "Priorizar alfabetização na idade certa (programas de reforço e formação)." });

  // OPORTUNIDADE
  if (saude?.popIndigena != null && saude.popIndigena > 0 && saude.popIndigena / saude.pop >= 0.1)
    out.push({ severidade: "oportunidade", area: "Saúde indígena", titulo: "População indígena expressiva", detalhe: `${n1(saude.popIndigena / saude.pop * 100)}% da população é indígena (Censo 2022).`, acao: "Articular com o DSEI/SESAI a atenção primária indígena no território." });
  if (cruz?.compras && cruz.compras.competPct < 40)
    out.push({ severidade: "oportunidade", area: "Compras", titulo: "Espaço para mais competição em compras", detalhe: `Só ${n1(cruz.compras.competPct)}% do valor em modalidade competitiva.`, acao: "Migrar compras para pregão/concorrência tende a reduzir preços." });

  // DESTAQUE — pontos fortes (equilíbrio)
  if (cruz?.fiscal && cruz.fiscal.autonomia > cruz.fiscal.autonomiaPares * 1.15)
    out.push({ severidade: "destaque", area: "Fiscal", titulo: "Autonomia tributária acima dos pares", detalhe: `${n1(cruz.fiscal.autonomia)}% de receita própria vs ${n1(cruz.fiscal.autonomiaPares)}% dos pares.` });
  if (saude && saude.internMil > 0 && saude.internMil > saude.internMilPares * 1.15)
    out.push({ severidade: "destaque", area: "Saúde", titulo: "Produção de saúde acima dos pares", detalhe: `${n1(saude.internMil)} internações/mil hab vs ${n1(saude.internMilPares)} dos pares.` });
  if (pos && total > 0 && pos.posicao <= Math.max(10, total * 0.1))
    out.push({ severidade: "destaque", area: "Fiscal", titulo: "Entre os melhores índices fiscais de SC", detalhe: `${pos.posicao}º de ${total} no índice fiscal do PNIGP.` });

  const ordem = { critico: 0, atencao: 1, oportunidade: 2, destaque: 3 };
  return out.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]).slice(0, 8);
}
