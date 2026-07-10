// Núcleo de domínio do Construtor de Termo de Referência (Lei 14.133/2021).
// Três inteligências: (1) estrutura obrigatória do TR (art. 6º, XXIII); (2) checador anti-superespecificação/
// direcionamento — a tese descrição→disputa→preço vira alerta em tempo real, ancorado na jurisprudência do controle;
// (3) recomendação de modalidade/critério de julgamento por objeto e valor. Sem dado sensível — só regra e texto legal.

// ─────────────────────────────────────────────────────────────────────────────
// 1) ESTRUTURA DO TERMO DE REFERÊNCIA — Lei 14.133/2021, art. 6º, XXIII, "a"–"k"
// ─────────────────────────────────────────────────────────────────────────────
export type SecaoTR = { chave: string; titulo: string; base: string; ajuda: string };

export const SECOES_TR: SecaoTR[] = [
  { chave: "objeto", titulo: "Definição do objeto", base: "art. 6º, XXIII, 'a'", ajuda: "O que se pretende contratar, de forma precisa, suficiente e clara — sem especificações que, por excessivas, restrinjam a competição." },
  { chave: "fundamentacao", titulo: "Fundamentação da contratação", base: "art. 6º, XXIII, 'b'", ajuda: "A necessidade pública que a contratação atende, referenciada ao Estudo Técnico Preliminar (ETP) e ao Plano de Contratações Anual (PCA), quando houver." },
  { chave: "descricao", titulo: "Descrição da solução como um todo", base: "art. 6º, XXIII, 'c'", ajuda: "A solução no seu ciclo de vida (aquisição, entrega, garantia, assistência) — não apenas o item isolado." },
  { chave: "requisitos", titulo: "Requisitos da contratação", base: "art. 6º, XXIII, 'd'", ajuda: "Especificação técnica do bem/serviço. É AQUI que a redação abre ou fecha a disputa — descreva por desempenho/função sempre que possível, não por marca." },
  { chave: "modelo", titulo: "Modelo de execução e de gestão do contrato", base: "art. 6º, XXIII, 'e'/'f'", ajuda: "Como o objeto será executado, entregue, medido e fiscalizado; prazos e local de entrega." },
  { chave: "criterios", titulo: "Critérios de medição e pagamento", base: "art. 6º, XXIII, 'g'", ajuda: "Quando e como se mede o cumprimento e se autoriza o pagamento." },
  { chave: "selecao", titulo: "Forma de seleção e critério de julgamento", base: "art. 6º, XXIII, 'h'", ajuda: "Modalidade e critério de julgamento (menor preço, maior desconto, técnica e preço...)." },
  { chave: "preco", titulo: "Estimativa do valor (preço de referência)", base: "art. 6º, XXIII, 'i' · IN SEGES/ME 65/2021", ajuda: "Valor estimado com a pesquisa de preços que o fundamenta. A mediana é a medida recomendada (robusta a outliers)." },
  { chave: "adequacao", titulo: "Adequação orçamentária", base: "art. 6º, XXIII, 'k'", ajuda: "A dotação/fonte que suporta a despesa." },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2) CHECADOR ANTI-SUPERESPECIFICAÇÃO / DIRECIONAMENTO
//    Fundamento: Lei 14.133/2021, art. 25, §1º (veda especificações que frustrem a competição) e art. 41
//    (indicação de marca só com justificativa e sempre com "ou equivalente"); Súmula 270 do TCU.
//    Cada padrão detectado é INDÍCIO didático, não veredito — o objetivo é ampliar a disputa, que puxa o preço.
// ─────────────────────────────────────────────────────────────────────────────
export type AlertaEspec = { termo: string; severidade: "alto" | "medio"; motivo: string; sugestao: string; base: string };

type Regra = { re: RegExp; severidade: "alto" | "medio"; motivo: string; sugestao: string; base: string };

const REGRAS: Regra[] = [
  { re: /\b(marca|fabricante)\b/i, severidade: "alto", motivo: "Exigir marca/fabricante específico restringe a competição a um fornecedor.", sugestao: "Descreva por desempenho/função. Se a marca for indispensável, justifique tecnicamente e acrescente “ou equivalente”.", base: "TCU Súmula 270; TCE-SC Prejulgado 1581; Lei 14.133/2021, art. 41" },
  { re: /\bou similar\b/i, severidade: "medio", motivo: "“Similar” é vago e gera insegurança na disputa e no julgamento.", sugestao: "Prefira “ou equivalente” com os parâmetros objetivos de equivalência definidos.", base: "Lei 14.133/2021, art. 41, parágrafo único" },
  { re: /\b(modelo|ref(er[êe]ncia)?\.?)\s*[:nº]/i, severidade: "alto", motivo: "Amarrar a um modelo/código de referência de um fabricante direciona a compra.", sugestao: "Use a marca apenas como referência seguida de “ou equivalente”, ou substitua por características técnicas mensuráveis.", base: "TCU Acórdão 113/2016-Plenário; TCE-SC Prejulgado 1581" },
  { re: /\b(primeira linha|alta qualidade|melhor qualidade|top de linha|premium)\b/i, severidade: "medio", motivo: "Termo subjetivo, não mensurável — não filtra qualidade e abre margem a impugnação.", sugestao: "Troque por requisitos objetivos (norma técnica, tolerância, durabilidade medível).", base: "TCU Súmula 177 (definição precisa e suficiente do objeto)" },
  { re: /\b(exatamente|obrigatoriamente id[êe]ntic|precisamente)\b/i, severidade: "medio", motivo: "Exigência de identidade exata tende a apontar para um único produto.", sugestao: "Defina faixas/tolerâncias aceitáveis em vez de valor único.", base: "Lei 14.133/2021, art. 25, §1º" },
  { re: /\b(certificad[oa]|selo|laudo)\b(?![^.]*\bquando aplic)/i, severidade: "medio", motivo: "Exigir certificação/selo pode ser restritivo se não for essencial ao objeto.", sugestao: "Mantenha só certificações exigidas por lei/norma para o objeto; justifique as demais.", base: "Lei 14.133/2021, art. 62–63 (habilitação)" },
  { re: /\bcor\s+(?!padr[ãa]o)\w+/i, severidade: "medio", motivo: "Cor específica sem função pode reduzir concorrentes sem ganho real.", sugestao: "Só especifique cor quando ela for requisito funcional (sinalização, segurança).", base: "Lei 14.133/2021, art. 25, §1º" },
];

export function checarEspecificacao(texto: string): AlertaEspec[] {
  if (!texto || texto.trim().length < 3) return [];
  const alertas: AlertaEspec[] = [];
  const vistos = new Set<string>();
  for (const r of REGRAS) {
    const m = texto.match(r.re);
    if (m && !vistos.has(r.re.source)) {
      vistos.add(r.re.source);
      alertas.push({ termo: m[0], severidade: r.severidade, motivo: r.motivo, sugestao: r.sugestao, base: r.base });
    }
  }
  return alertas;
}

// escore didático 0–100 de "abertura à concorrência" a partir dos alertas (quanto menos restrição, maior)
export function escoreAbertura(alertas: AlertaEspec[]): number {
  const peso = alertas.reduce((s, a) => s + (a.severidade === "alto" ? 25 : 12), 0);
  return Math.max(0, 100 - peso);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) RECOMENDAÇÃO DE MODALIDADE E CRITÉRIO DE JULGAMENTO — Lei 14.133/2021
//    Os limites de dispensa (art. 75, I e II) são REAJUSTADOS ANUALMENTE por decreto — por isso são exibidos
//    como referência com data e um aviso para confirmar o valor vigente. Não presumir precisão que a lei atualiza.
// ─────────────────────────────────────────────────────────────────────────────
export type TipoObjeto = "bem_comum" | "servico_comum" | "bem_especial" | "obra_engenharia";

// Referência dos limites de dispensa por valor (art. 75, I e II) — atualizados por decreto (base: última atualização conhecida).
export const LIMITE_DISPENSA = {
  obra_engenharia: 119_812.47, // art. 75, I
  bem_servico: 59_906.02, // art. 75, II
  vigencia: "referência atualizada por decreto — confirme o valor vigente no exercício",
};

export type RecomendacaoModalidade = { modalidade: string; criterio: string; justificativa: string; base: string; avisos: string[] };

export function recomendarModalidade(tipo: TipoObjeto, valorEstimado: number): RecomendacaoModalidade {
  const avisos: string[] = [];
  const limite = tipo === "obra_engenharia" ? LIMITE_DISPENSA.obra_engenharia : LIMITE_DISPENSA.bem_servico;
  const comum = tipo === "bem_comum" || tipo === "servico_comum";

  if (valorEstimado > 0 && valorEstimado <= limite) {
    avisos.push(`Abaixo do limite de dispensa por valor (${LIMITE_DISPENSA.vigencia}). A dispensa é FACULTATIVA — licitar amplia a disputa e pode render preço melhor.`);
    return {
      modalidade: "Dispensa de licitação (art. 75, " + (tipo === "obra_engenharia" ? "I" : "II") + ") — ou licitar mesmo assim",
      criterio: "Menor preço (com pesquisa de preços e, idealmente, mais de uma cotação)",
      justificativa: "Valor estimado dentro da faixa de dispensa. Ainda assim, recomenda-se cotar amplamente — a dispensa dispensa o procedimento, não a busca do melhor preço.",
      base: "Lei 14.133/2021, art. 75",
      avisos,
    };
  }

  if (comum) {
    return {
      modalidade: "Pregão (eletrônico)",
      criterio: "Menor preço ou maior desconto",
      justificativa: "Bem/serviço COMUM (padrões de desempenho e qualidade objetivamente definíveis no edital) — o pregão é a via adequada e favorece a disputa por lances.",
      base: "Lei 14.133/2021, art. 6º, XLI; art. 29",
      avisos: ["Se o objeto NÃO for comum (especificação não objetivável), reavalie para Concorrência."],
    };
  }

  if (tipo === "obra_engenharia") {
    return {
      modalidade: "Concorrência",
      criterio: "Menor preço, ou técnica e preço quando a qualidade da proposta técnica for relevante",
      justificativa: "Obra/serviço de engenharia acima do limite de dispensa — a Concorrência é a modalidade própria.",
      base: "Lei 14.133/2021, art. 6º, XXXVIII; art. 28",
      avisos: ["Exige projeto básico/executivo adequado — especificação insuficiente é fonte de aditivo e questionamento."],
    };
  }

  return {
    modalidade: "Concorrência",
    criterio: "Técnica e preço, ou menor preço conforme o objeto",
    justificativa: "Bem/serviço ESPECIAL (não enquadrável como comum) acima do limite de dispensa — a Concorrência acomoda a complexidade da especificação.",
    base: "Lei 14.133/2021, art. 28; art. 33–34",
    avisos: ["Justifique por que o objeto não é comum — isso sustenta a escolha da modalidade."],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) CHECKLIST DE CONFORMIDADE — Lei 14.133/2021 + pontos de controle do TCE-SC
// ─────────────────────────────────────────────────────────────────────────────
export type ItemChecklist = { chave: string; texto: string; base: string };

export const CHECKLIST_TR: ItemChecklist[] = [
  { chave: "etp", texto: "Estudo Técnico Preliminar (ETP) elaborado e referenciado", base: "Lei 14.133/2021, art. 18, §1º" },
  { chave: "risco", texto: "Matriz/mapa de risco da contratação", base: "Lei 14.133/2021, art. 22" },
  { chave: "objeto", texto: "Objeto definido de forma precisa, sem exigência restritiva à competição", base: "art. 25, §1º" },
  { chave: "catalogo", texto: "Item classificado no catálogo oficial (CATMAT/CATSER)", base: "art. 19, II" },
  { chave: "preco", texto: "Pesquisa de preços com no mínimo os parâmetros da IN 65/2021; valor de referência = mediana", base: "IN SEGES/ME 65/2021" },
  { chave: "marca", texto: "Sem preferência de marca (ou, se indispensável, justificada e com “ou equivalente”)", base: "art. 41" },
  { chave: "modalidade", texto: "Modalidade e critério de julgamento coerentes com o objeto e o valor", base: "art. 28–29" },
  { chave: "pca", texto: "Contratação prevista no Plano de Contratações Anual (PCA), quando exigível", base: "art. 12, VII" },
  { chave: "dotacao", texto: "Adequação orçamentária e financeira indicada", base: "art. 6º, XXIII, 'k'; LRF art. 16" },
  { chave: "fiscal", texto: "Fiscal e gestor do contrato designados", base: "art. 7º; art. 117" },
];

export const TIPO_OBJETO_LABEL: Record<TipoObjeto, string> = {
  bem_comum: "Bem comum",
  servico_comum: "Serviço comum",
  bem_especial: "Bem/serviço especial",
  obra_engenharia: "Obra ou serviço de engenharia",
};

// ─────────────────────────────────────────────────────────────────────────────
// 5) ANALISADOR DE DOCUMENTOS — cola-se um edital/TR pronto e recebe uma análise de conformidade com alertas
//    graduados por gravidade + sugestão + base legal (o acórdão/prejulgado VERIFICADO na fonte oficial). Cobre
//    presença de cláusula restritiva E ausência de elemento obrigatório. Fonte da jurisprudência: docs/modelos-tr-fontes.md
//    + revisão de acórdãos TCU/TCE-SC (Súmula 270/177/275, Ac. 1875/2021, Prejulgados TCE-SC 1581/1199/803, NT 1/2021, NT TC-4/2023).
//    É apoio automatizado — NÃO substitui a análise técnica e jurídica do órgão.
// ─────────────────────────────────────────────────────────────────────────────
export type Severidade = "alto" | "medio" | "baixo" | "ok";
export type Achado = { categoria: string; severidade: Severidade; motivo: string; sugestao: string; base: string; trecho?: string };
export type AnaliseDoc = { score: number; nAlto: number; nMedio: number; nBaixo: number; achados: Achado[]; resumo: string };

function trechoAoRedor(texto: string, idx: number, len: number): string {
  const ini = Math.max(0, idx - 45), fim = Math.min(texto.length, idx + len + 45);
  return (ini > 0 ? "…" : "") + texto.slice(ini, fim).replace(/\s+/g, " ").trim() + (fim < texto.length ? "…" : "");
}

export function analisarDocumento(texto: string): AnaliseDoc {
  const achados: Achado[] = [];
  const t = texto || "";
  const push = (a: Achado) => achados.push(a);
  const acha = (re: RegExp) => t.match(re);
  const temMitigacaoMarca = /(ou\s+(equivalente|similar)|de\s+melhor\s+qualidade)/i.test(t);

  // ── RISCOS (presença de cláusula restritiva) ──
  const marca = acha(/\b(marca|fabricante)s?\b/i);
  if (marca) {
    if (!temMitigacaoMarca)
      push({ categoria: "Indicação de marca sem ressalva", severidade: "alto", motivo: "O documento cita marca/fabricante sem acrescentar “ou equivalente/similar” — indicação de marca é excepcional e restringe a competição a um fornecedor.", sugestao: "Só indique marca com justificativa prévia (padronização) e sempre seguida de “ou equivalente / ou similar / ou de melhor qualidade”.", base: "TCU Súmula 270; TCE-SC Prejulgado 1581; Lei 14.133/2021, art. 41, I", trecho: trechoAoRedor(t, marca.index || 0, marca[0].length) });
    else
      push({ categoria: "Indicação de marca (com ressalva)", severidade: "baixo", motivo: "Há indicação de marca, mas com ressalva de equivalência — aceitável se houver justificativa nos Estudos Técnicos Preliminares.", sugestao: "Confirme que a hipótese do art. 41, I, “a”–“d” está justificada no ETP e que a equivalência tem parâmetros objetivos.", base: "TCU Súmula 270; Lei 14.133/2021, art. 41, I", trecho: trechoAoRedor(t, marca.index || 0, marca[0].length) });
  }
  const modelo = acha(/\b(modelo|ref(er[êe]ncia)?\.?)\s*[:nº]/i);
  if (modelo) push({ categoria: "Modelo/código de referência", severidade: "alto", motivo: "Amarrar a um modelo/código de um fabricante direciona a compra.", sugestao: "Use a referência apenas de forma descritiva, seguida de “ou equivalente”, admitindo produto compatível.", base: "TCU Acórdão 113/2016-Plenário; TCE-SC Prejulgado 1581", trecho: trechoAoRedor(t, modelo.index || 0, modelo[0].length) });

  const subj = acha(/\b(primeira linha|alta qualidade|melhor qualidade|top de linha|premium)\b/i);
  if (subj) push({ categoria: "Termo subjetivo de qualidade", severidade: "medio", motivo: "Termo não mensurável não define o objeto e abre margem a impugnação.", sugestao: "Troque por requisitos objetivos (norma técnica, tolerância, durabilidade medível).", base: "TCU Súmula 177 (definição precisa e suficiente do objeto)", trecho: trechoAoRedor(t, subj.index || 0, subj[0].length) });

  const temCapital = /capital\s+social/i.test(t), temPL = /patrim[ôo]nio\s+l[íi]quido/i.test(t);
  if (temCapital && temPL) {
    const m = acha(/capital\s+social/i)!;
    push({ categoria: "Habilitação econômico-financeira cumulativa", severidade: "alto", motivo: "Exigir, ao mesmo tempo, capital social mínimo e patrimônio líquido é exigência cumulativa vedada.", sugestao: "Exija apenas UM: capital social mínimo OU patrimônio líquido mínimo OU garantia — nunca cumulados.", base: "TCU Súmula 275", trecho: trechoAoRedor(t, m.index || 0, m[0].length) });
  }
  const cor = acha(/\bcor\s+(?!padr[ãa]o)[a-zç]+/i);
  if (cor) push({ categoria: "Exigência de cor específica", severidade: "baixo", motivo: "Cor específica sem função pode reduzir concorrentes sem ganho real.", sugestao: "Só especifique cor quando for requisito funcional (sinalização, segurança).", base: "TCE-SC Prejulgado 1581; Lei 14.133/2021, art. 25, §1º", trecho: trechoAoRedor(t, cor.index || 0, cor[0].length) });

  // ── AUSÊNCIAS (falta de elemento obrigatório) ──
  const temPreco = /(pesquisa\s+de\s+pre[çc]os|pre[çc]o\s+de\s+refer[êe]ncia|valor\s+estimad|cesta\s+de\s+pre[çc]os|mediana)/i.test(t);
  if (t.length > 200 && !temPreco)
    push({ categoria: "Ausência de pesquisa de preços", severidade: "medio", motivo: "Não se identifica a estimativa de valor / pesquisa de preços que fundamenta a contratação.", sugestao: "Inclua a estimativa por “cesta de preços” (preferir preços públicos), com no mínimo 3 fontes e excluindo outliers; use a mediana em caso de dispersão alta.", base: "TCU Acórdão 1875/2021-Plenário; IN SEGES/ME 65/2021, art. 6º; TCE-SC Nota Técnica 1/2021" });

  const temDispensa = acha(/(dispensa\s+de\s+licita[çc][ãa]o|inexigibilidade)/i);
  if (temDispensa) push({ categoria: "Contratação direta (dispensa/inexigibilidade)", severidade: "baixo", motivo: "O documento indica contratação direta — a licitação é a regra; a contratação direta é exceção taxativa.", sugestao: "Confirme o enquadramento legal e, na dispensa por valor, verifique o somatório de despesas de MESMA NATUREZA no exercício (evitar fracionamento).", base: "TCE-SC Prejulgados 1199 e 803; Lei 14.133/2021, arts. 72–75", trecho: trechoAoRedor(t, temDispensa.index || 0, temDispensa[0].length) });

  // ── POSITIVOS (boas práticas encontradas) ──
  if (marca && temMitigacaoMarca) push({ categoria: "Ressalva de equivalência presente", severidade: "ok", motivo: "O documento admite “ou equivalente/similar” — preserva a competição.", sugestao: "", base: "TCU Acórdão 113/2016-Plenário" });
  if (temPreco) push({ categoria: "Estimativa de preços presente", severidade: "ok", motivo: "Há referência a pesquisa/estimativa de preços.", sugestao: "", base: "IN SEGES/ME 65/2021" });
  if (/(estudo\s+t[ée]cnico\s+preliminar|\bETP\b)/i.test(t)) push({ categoria: "ETP referenciado", severidade: "ok", motivo: "O documento referencia o Estudo Técnico Preliminar.", sugestao: "", base: "Lei 14.133/2021, art. 18, §1º" });

  const nAlto = achados.filter((a) => a.severidade === "alto").length;
  const nMedio = achados.filter((a) => a.severidade === "medio").length;
  const nBaixo = achados.filter((a) => a.severidade === "baixo").length;
  const score = Math.max(0, 100 - (nAlto * 20 + nMedio * 10 + nBaixo * 5));
  const resumo = nAlto > 0
    ? `Foram encontrados ${nAlto} ponto(s) de alta gravidade que podem restringir a competição ou fragilizar o processo — revise antes de publicar.`
    : nMedio > 0
    ? "Sem riscos graves, mas há pontos de atenção a ajustar para reforçar a conformidade e a disputa."
    : "Não foram detectados riscos relevantes pelas regras automáticas. A revisão técnica e jurídica do órgão continua indispensável.";
  return { score, nAlto, nMedio, nBaixo, achados, resumo };
}

export const SEVERIDADE_LABEL: Record<Severidade, string> = { alto: "Alta gravidade", medio: "Atenção", baixo: "Baixa", ok: "Boa prática" };
