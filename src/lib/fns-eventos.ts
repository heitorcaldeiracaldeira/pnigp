// Camada de EVENTOS da série de repasses federais (FNS) — contexto real datado + a METODOLOGIA que
// explica as variações. Tom neutro e didático: explica COMO a regra move a linha, sem julgar a gestão
// e sem viés político. Tudo rotulado (fato × contexto × metodologia × registro local).
export type Camada = "fato" | "contexto" | "metodologia" | "local";
export type Evento = { ano: number; camada: Camada; titulo: string; desc: string; fonte?: string };

// Eventos ESTRUTURAIS reais e datados que mudam a forma de transferir recurso federal de saúde.
// São mudanças de metodologia/normativo — valem para qualquer município, sem conotação política.
export const EVENTOS_FNS: Evento[] = [
  { ano: 2017, camada: "contexto", titulo: "Transferências em 2 blocos", desc: "A Portaria 3.992/2017 reorganizou o repasse federal em dois blocos — Custeio e Investimento —, dando mais flexibilidade de aplicação ao gestor.", fonte: "Portaria GM/MS 3.992/2017" },
  { ano: 2020, camada: "contexto", titulo: "Previne Brasil — novo cálculo da APS", desc: "Substituiu o PAB Fixo/Variável por capitação ponderada (paga pela população cadastrada nas equipes) + pagamento por desempenho + ações estratégicas. Mudou a forma de calcular o repasse da Atenção Primária.", fonte: "Portaria GM/MS 2.979/2019" },
  { ano: 2020, camada: "contexto", titulo: "Recursos extraordinários da pandemia", desc: "Durante a COVID-19, o governo federal transferiu recursos extraordinários e temporários de enfrentamento, que se somam ao repasse regular em 2020 e 2021.", fonte: "Portarias de enfrentamento à COVID-19" },
  { ano: 2024, camada: "contexto", titulo: "Atualização dos indicadores do Previne", desc: "Revisão do conjunto de indicadores de desempenho e dos pesos do cálculo da Atenção Primária.", },
];

export type Variacao = { ano: number; deltaPct: number; deltaAbs: number; camada: Camada; titulo: string; desc: string };

// Gera os "momentos" da série: variações relevantes (FATO, neutro) + a METODOLOGIA que as explica.
export function analisarSerieFns(serie: { ano: number; total: number }[]): { variacoes: Variacao[]; anoParcial: number | null } {
  const out: Variacao[] = [];
  if (serie.length < 2) return { variacoes: out, anoParcial: null };
  const deltas = serie.slice(1).map((p, i) => {
    const ant = serie[i].total;
    const d = ant > 0 ? ((p.total - ant) / ant) * 100 : 0;
    return { ano: p.ano, deltaPct: d, deltaAbs: p.total - ant };
  });
  const relevantes = [...deltas].filter((d) => Math.abs(d.deltaPct) >= 12).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)).slice(0, 4);
  for (const d of relevantes) {
    const subiu = d.deltaPct > 0;
    // FATO — apenas descreve a variação, sem juízo de valor
    out.push({ ano: d.ano, deltaPct: d.deltaPct, deltaAbs: d.deltaAbs, camada: "fato", titulo: `${subiu ? "📈 Alta" : "📉 Redução"} de ${Math.abs(d.deltaPct).toFixed(0)}% em ${d.ano}`, desc: `O valor transferido ${subiu ? "aumentou" : "diminuiu"} ${Math.abs(d.deltaPct).toFixed(0)}% em relação a ${d.ano - 1}.` });
    // METODOLOGIA — explica como a regra produz essa variação (neutro, educativo)
    let met: string;
    if (subiu && (d.ano === 2020 || d.ano === 2021)) met = "Pela metodologia: somam-se ao repasse regular os recursos extraordinários e temporários da pandemia. Como são temporários, a série volta ao patamar regular quando eles terminam.";
    else if (!subiu && (d.ano === 2022 || d.ano === 2023)) met = "Pela metodologia: a redução costuma refletir o término dos recursos extraordinários da pandemia, e não o custeio regular. Separar o que era extraordinário ajuda a ler a tendência de base.";
    else if (d.ano === 2020) met = "A partir de 2020, a Atenção Primária passou a ser calculada por capitação (população cadastrada) + desempenho. Variações também refletem essa mudança de cálculo, além do volume de serviço.";
    else met = subiu
      ? "Pela metodologia, altas podem vir de custeio recorrente, de investimento pontual ou de emendas. Identificar a origem mostra o quanto é estrutural."
      : "Pela metodologia, o repasse da APS responde ao cadastro da população e aos indicadores de desempenho. Acompanhar esses componentes explica o movimento.";
    out.push({ ano: d.ano, deltaPct: d.deltaPct, deltaAbs: d.deltaAbs, camada: "metodologia", titulo: `📐 Como a metodologia explica (${d.ano})`, desc: met });
  }
  const ult = serie[serie.length - 1];
  const anoParcial = ult.ano >= 2026 ? ult.ano : null;
  return { variacoes: out.sort((a, b) => a.ano - b.ano || (a.camada === "fato" ? -1 : 1)), anoParcial };
}
