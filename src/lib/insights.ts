// Motor de diagnóstico do PNIGP — transforma os números em achados acionáveis.
// Foco: o que está "escondido" nos dados (comparação com pares, tendências,
// risco fiscal, oportunidades), priorizado para a decisão do gestor.

import { type AreaKey, fmtValor } from "./ui";

export type Severidade = "critico" | "atencao" | "oportunidade" | "destaque";

export type Insight = {
  id: string;
  severidade: Severidade;
  area: AreaKey | "gestao";
  titulo: string;
  detalhe: string;
  acao?: string;
  peso: number; // magnitude para ordenação
};

type Indic = {
  codigo: string;
  nome: string;
  area: string;
  unidade: string;
  direcao_melhor: "alta" | "baixa";
  valor: number;
  valor_anterior: number | null;
  media: number;
};

type Ctx = {
  indicadores: Indic[];
  historico: Record<string, { ano: number; valor: number }[]>;
  indices: {
    iceb: number;
    cap_planejamento: number;
    cap_fiscal: number;
    cap_gestao: number;
    cap_transparencia: number;
  };
  grupoLabel: string; // "do seu porte" | "da sua região"
  posicao?: number;
  total?: number;
};

const ACAO_AREA: Record<string, string> = {
  saude: "Revise a cobertura da atenção primária e a alocação na rede de saúde.",
  educacao: "Direcione recursos e gestão pedagógica às escolas de menor desempenho.",
  seguranca: "Articule dados com a segurança e priorize territórios mais críticos.",
  fiscal: "Reavalie a execução orçamentária e a estrutura de despesas.",
  social: "Amplie a busca ativa e a cobertura dos programas sociais.",
  economia: "Estimule formalização e atração de investimentos no território.",
};

export const SEVERIDADE_ORDEM: Record<Severidade, number> = {
  critico: 0,
  atencao: 1,
  oportunidade: 2,
  destaque: 3,
};

export function gerarInsights(ctx: Ctx): Insight[] {
  const { indicadores, historico, indices, grupoLabel, posicao, total } = ctx;
  const found: Insight[] = [];

  // --- Posição no ranking nacional --------------------------------------
  if (posicao && total) {
    const pct = posicao / total;
    if (pct <= 0.15) {
      found.push({
        id: "rank-top",
        severidade: "destaque",
        area: "gestao",
        titulo: `${posicao}º de ${total} no IGP 360 — entre os melhores do país`,
        detalhe: "Sua gestão está no topo do ranking nacional de gestão pública.",
        peso: 90,
      });
    } else if (pct >= 0.85) {
      found.push({
        id: "rank-bottom",
        severidade: "critico",
        area: "gestao",
        titulo: `${posicao}º de ${total} no IGP 360 — entre os que mais precisam avançar`,
        detalhe: "O índice integrado aponta espaço relevante de melhoria frente aos pares.",
        acao: "Priorize os pontos críticos abaixo para subir no ranking.",
        peso: 95,
      });
    }
  }

  // --- Análise indicador a indicador ------------------------------------
  for (const i of indicadores) {
    const area = i.area as AreaKey;
    const melhor = i.direcao_melhor === "alta" ? i.valor >= i.media : i.valor <= i.media;
    const gap = i.media > 0 ? (Math.abs(i.valor - i.media) / i.media) * 100 : 0;
    const acimaAbaixo = i.valor >= i.media ? "acima" : "abaixo";

    // Risco fiscal (limites absolutos — LRF)
    if (i.codigo === "gasto_pessoal_rcl") {
      if (i.valor >= 54) {
        found.push({
          id: "lrf-limite",
          severidade: "critico",
          area: "fiscal",
          titulo: `Gasto com pessoal ultrapassou o limite da LRF (${fmtValor(i.valor, "%")})`,
          detalhe: "O limite legal é 54% da Receita Corrente Líquida. Há risco de sanções.",
          acao: "Conter despesa de pessoal e reforçar a receita corrente líquida.",
          peso: 98,
        });
      } else if (i.valor >= 51) {
        found.push({
          id: "lrf-alerta",
          severidade: "atencao",
          area: "fiscal",
          titulo: `Gasto com pessoal a ${(54 - i.valor).toFixed(1)} pts do limite da LRF`,
          detalhe: `Atual: ${fmtValor(i.valor, "%")} da RCL · limite legal: 54%.`,
          acao: "Monitorar contratações e revisar a folha antes de atingir o teto.",
          peso: 80,
        });
      }
      continue;
    }
    if (i.codigo === "liquidez_corrente" && i.valor < 1) {
      found.push({
        id: "liquidez",
        severidade: "atencao",
        area: "fiscal",
        titulo: `Liquidez corrente abaixo de 1,0 (${fmtValor(i.valor, "índice")})`,
        detalhe: "As obrigações de curto prazo superam os recursos disponíveis.",
        acao: "Reforçar o caixa e escalonar compromissos de curto prazo.",
        peso: 75,
      });
      continue;
    }

    // Oportunidade — arrecadação própria abaixo dos pares
    if (i.codigo === "receita_propria_pct" && !melhor && gap >= 8) {
      found.push({
        id: "oport-receita",
        severidade: "oportunidade",
        area: "fiscal",
        titulo: `Arrecadação própria ${gap.toFixed(0)}% abaixo da média ${grupoLabel}`,
        detalhe: `Sua receita própria é ${fmtValor(i.valor, "%")} vs ${fmtValor(i.media, "%")} dos pares — há potencial a explorar.`,
        acao: "Modernizar a gestão tributária (IPTU, ISS, dívida ativa).",
        peso: 70 + gap,
      });
      continue;
    }

    // Comparação com pares (PRIORIDADE)
    if (i.media > 0 && !melhor && gap >= 10) {
      found.push({
        id: `peer-${i.codigo}`,
        severidade: gap >= 25 ? "critico" : "atencao",
        area,
        titulo: `${i.nome}: ${gap.toFixed(0)}% ${acimaAbaixo} da média ${grupoLabel}`,
        detalhe: `Seu valor: ${fmtValor(i.valor, i.unidade)} · média dos pares: ${fmtValor(i.media, i.unidade)}.`,
        acao: ACAO_AREA[i.area],
        peso: gap,
      });
    } else if (i.media > 0 && melhor && gap >= 18) {
      found.push({
        id: `peer-top-${i.codigo}`,
        severidade: "destaque",
        area,
        titulo: `${i.nome}: ${gap.toFixed(0)}% melhor que a média ${grupoLabel}`,
        detalhe: `Seu valor: ${fmtValor(i.valor, i.unidade)} vs ${fmtValor(i.media, i.unidade)} dos pares.`,
        peso: gap,
      });
    }

    // Tendência — piora silenciosa (3 anos consecutivos)
    const serie = historico[i.codigo];
    if (serie && serie.length >= 3) {
      const ult = serie.slice(-3).map((p) => p.valor);
      const piora =
        i.direcao_melhor === "alta"
          ? ult[0] > ult[1] && ult[1] > ult[2]
          : ult[0] < ult[1] && ult[1] < ult[2];
      if (piora) {
        found.push({
          id: `trend-${i.codigo}`,
          severidade: "atencao",
          area,
          titulo: `${i.nome} piora há 3 anos seguidos`,
          detalhe: `Tendência negativa mesmo que o valor atual pareça aceitável — exige atenção antes de virar problema.`,
          acao: ACAO_AREA[i.area],
          peso: 60,
        });
      }
    }
  }

  // --- Driver do índice (qual dimensão derruba o ICEB) ------------------
  const dims: { nome: string; valor: number }[] = [
    { nome: "Planejamento", valor: indices.cap_planejamento },
    { nome: "Capacidade fiscal", valor: indices.cap_fiscal },
    { nome: "Gestão", valor: indices.cap_gestao },
    { nome: "Transparência", valor: indices.cap_transparencia },
  ];
  const pior = dims.reduce((a, b) => (b.valor < a.valor ? b : a));
  if (pior.valor < 62) {
    found.push({
      id: "driver-iceb",
      severidade: "atencao",
      area: "gestao",
      titulo: `"${pior.nome}" é a dimensão que mais reduz seu ICEB (${pior.valor.toFixed(1)})`,
      detalhe: "Fortalecer essa capacidade tem o maior efeito sobre o índice de capacidade estatal.",
      peso: 55,
    });
  }

  // --- Seleção e priorização -------------------------------------------
  const porSev = (s: Severidade) =>
    found.filter((f) => f.severidade === s).sort((a, b) => b.peso - a.peso);

  const selecionados = [
    ...porSev("critico").slice(0, 4),
    ...porSev("oportunidade").slice(0, 2),
    ...porSev("atencao").slice(0, 4),
    ...porSev("destaque").slice(0, 2),
  ];

  return selecionados
    .sort((a, b) => SEVERIDADE_ORDEM[a.severidade] - SEVERIDADE_ORDEM[b.severidade] || b.peso - a.peso)
    .slice(0, 8);
}

export function resumoDiagnostico(insights: Insight[]) {
  return {
    critico: insights.filter((i) => i.severidade === "critico").length,
    atencao: insights.filter((i) => i.severidade === "atencao").length,
    oportunidade: insights.filter((i) => i.severidade === "oportunidade").length,
    destaque: insights.filter((i) => i.severidade === "destaque").length,
  };
}
