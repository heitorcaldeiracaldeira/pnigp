// Visão do Auditor — análise cross-área inspirada na lógica dos Tribunais de Contas.
// Cruza desempenho setorial, eficiência (recurso × resultado) e gera apontamentos
// acionáveis com foco no valor entregue ao cidadão.

import { type AreaKey, AREA_ORDER, AREAS, fmtBRL, fmtValor } from "./ui";

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

type AuditCtx = {
  indicadores: Indic[];
  indices: { iceb: number; invp: number };
  populacao: number;
  grupoLabel: string; // "dos pares do seu porte" | "dos pares da sua região"
};

export type AreaScore = {
  area: AreaKey;
  label: string;
  score: number; // 0-100 (50 = igual aos pares)
  classe: "acima" | "media" | "abaixo";
};

export type AchadoTipo = "ressalva" | "risco" | "recomendacao" | "boa_pratica";
export type Achado = {
  id: string;
  tipo: AchadoTipo;
  titulo: string;
  fundamentacao: string;
  recomendacao: string;
};

export type Oportunidade = {
  area: AreaKey;
  label: string;
  ganho: number; // pontos abaixo dos pares
  habitantes: number;
  descricao: string;
};

export type Parecer = { rotulo: string; tom: "ok" | "ressalva" | "critico" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Desempenho de um indicador frente aos pares: 50 = igual; >50 melhor; <50 pior. */
function perfVsPeer(i: Indic): number {
  if (i.media <= 0 || i.valor <= 0) return 50;
  const ratio = i.direcao_melhor === "alta" ? i.valor / i.media : i.media / i.valor;
  return clamp(((ratio - 0.6) / (1.4 - 0.6)) * 100, 0, 100);
}

export function computeAreaScores(indicadores: Indic[]): AreaScore[] {
  return AREA_ORDER.map((area) => {
    const itens = indicadores.filter((i) => i.area === area);
    const score = itens.length
      ? itens.reduce((s, i) => s + perfVsPeer(i), 0) / itens.length
      : 50;
    const classe = score >= 62 ? "acima" : score >= 45 ? "media" : "abaixo";
    return { area, label: AREAS[area].label, score: Math.round(score), classe };
  });
}

export function analisarAuditoria(ctx: AuditCtx): {
  parecer: Parecer;
  areas: AreaScore[];
  achados: Achado[];
  oportunidades: Oportunidade[];
} {
  const { indicadores, indices, populacao, grupoLabel } = ctx;
  const areas = computeAreaScores(indicadores);
  const get = (codigo: string) => indicadores.find((i) => i.codigo === codigo);
  const areaScore = (a: AreaKey) => areas.find((x) => x.area === a)?.score ?? 50;
  const achados: Achado[] = [];

  // 1. Ineficiência alocativa: muito gasto com pessoal, pouca entrega finalística
  const gp = get("gasto_pessoal_rcl");
  const entregaSocial = (areaScore("saude") + areaScore("educacao")) / 2;
  if (gp && gp.valor >= 50 && entregaSocial < 48) {
    achados.push({
      id: "ineficiencia-alocativa",
      tipo: "ressalva",
      titulo: "Despesa de pessoal elevada sem contrapartida em resultados",
      fundamentacao: `Gasto com pessoal em ${fmtValor(gp.valor, "%")} da RCL, enquanto saúde e educação estão abaixo ${grupoLabel}. Indício de ineficiência alocativa: recurso aplicado não se converte em serviço ao cidadão.`,
      recomendacao: "Vincular a estrutura de pessoal a metas finalísticas e revisar cargos sem impacto direto na prestação de serviços.",
    });
  }

  // 2. Conformidade fiscal — limite da LRF
  if (gp && gp.valor >= 52) {
    achados.push({
      id: "conformidade-lrf",
      tipo: "risco",
      titulo:
        gp.valor >= 54
          ? "Despesa de pessoal acima do limite legal da LRF"
          : "Despesa de pessoal próxima do limite da LRF",
      fundamentacao: `Atual: ${fmtValor(gp.valor, "%")} da Receita Corrente Líquida (limite legal: 54%). ${gp.valor >= 54 ? "Situação de descumprimento sujeita a sanções." : "Margem reduzida exige contenção imediata."}`,
      recomendacao: "Adotar plano de recondução da despesa de pessoal e congelar expansões de folha até a regularização.",
    });
  }

  // 3. Dependência de transferências (baixa autonomia fiscal)
  const rp = get("receita_propria_pct");
  if (rp && perfVsPeer(rp) < 42) {
    achados.push({
      id: "dependencia-transferencias",
      tipo: "recomendacao",
      titulo: "Baixa autonomia fiscal e dependência de transferências",
      fundamentacao: `Receita própria de ${fmtValor(rp.valor, "%")} contra ${fmtValor(rp.media, "%")} ${grupoLabel}. A dependência de repasses aumenta a vulnerabilidade a ciclos políticos e econômicos.`,
      recomendacao: "Modernizar a administração tributária (atualização do IPTU, fiscalização do ISS e recuperação da dívida ativa).",
    });
  }

  // 4. Subinvestimento que compromete o desenvolvimento
  const inv = get("investimento_per_capita");
  if (inv && perfVsPeer(inv) < 42 && areaScore("economia") < 50) {
    achados.push({
      id: "subinvestimento",
      tipo: "risco",
      titulo: "Baixa capacidade de investimento",
      fundamentacao: `Investimento per capita de ${fmtBRL(inv.valor)} (média ${grupoLabel}: ${fmtBRL(inv.media)}), associado a desempenho econômico abaixo dos pares. Risco de estagnação e perda de competitividade territorial.`,
      recomendacao: "Ampliar o espaço fiscal para investimento e estruturar projetos para captação de recursos e parcerias.",
    });
  }

  // 5. Vulnerabilidade social composta (CRUZAMENTO de áreas)
  const fracas = (["seguranca", "educacao", "social"] as AreaKey[]).filter(
    (a) => areaScore(a) < 48,
  );
  if (fracas.length >= 2) {
    const nomes = fracas.map((a) => AREAS[a].label).join(", ");
    achados.push({
      id: "vulnerabilidade-composta",
      tipo: "risco",
      titulo: "Vulnerabilidade social composta entre áreas",
      fundamentacao: `${nomes} estão simultaneamente abaixo ${grupoLabel}. Esses fatores se retroalimentam — evasão escolar, violência e pobreza formam um ciclo que amplia o custo social.`,
      recomendacao: "Implementar ação intersetorial coordenada (educação + assistência social + segurança) sobre os mesmos territórios prioritários.",
    });
  }

  // 6. Capacidade instalada que não vira valor ao cidadão
  if (indices.iceb >= 58 && indices.invp < indices.iceb - 8 && indices.invp < 60) {
    achados.push({
      id: "capacidade-sem-valor",
      tipo: "ressalva",
      titulo: "Capacidade institucional não convertida em valor público",
      fundamentacao: `ICEB de ${indices.iceb.toFixed(1)} (capacidade) frente a INVP de ${indices.invp.toFixed(1)} (valor ao cidadão). A estrutura existe, mas os resultados percebidos pela população ficam aquém.`,
      recomendacao: "Reorientar o planejamento para resultados finalísticos e medir a satisfação e o acesso da população aos serviços.",
    });
  }

  // 7. Boa prática — melhor área acima dos pares
  const melhor = [...areas].sort((a, b) => b.score - a.score)[0];
  if (melhor && melhor.score >= 65) {
    achados.push({
      id: "boa-pratica",
      tipo: "boa_pratica",
      titulo: `Boa prática reconhecida em ${melhor.label}`,
      fundamentacao: `${melhor.label} apresenta desempenho de ${melhor.score}/100 frente aos pares — referência positiva.`,
      recomendacao: "Documentar a metodologia adotada e replicá-la nas áreas de menor desempenho.",
    });
  }

  // --- Oportunidades priorizadas por impacto ao cidadão -----------------
  const oportunidades: Oportunidade[] = areas
    .filter((a) => a.score < 50)
    .map((a) => ({
      area: a.area,
      label: a.label,
      ganho: 50 - a.score,
      habitantes: populacao,
      descricao: `Levar ${a.label} ao nível ${grupoLabel} é a maior alavanca de valor público — beneficia toda a população do território.`,
    }))
    .sort((x, y) => y.ganho - x.ganho)
    .slice(0, 3);

  // --- Parecer geral ----------------------------------------------------
  const graves = achados.filter((a) => a.tipo === "ressalva" || a.tipo === "risco").length;
  const parecer: Parecer =
    graves >= 3
      ? { rotulo: "Gestão requer providências", tom: "critico" }
      : graves >= 1
        ? { rotulo: "Gestão regular, com ressalvas", tom: "ressalva" }
        : { rotulo: "Gestão adequada", tom: "ok" };

  // ordena achados: risco, ressalva, recomendacao, boa_pratica
  const ordem: Record<AchadoTipo, number> = { risco: 0, ressalva: 1, recomendacao: 2, boa_pratica: 3 };
  achados.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);

  return { parecer, areas, achados, oportunidades };
}
