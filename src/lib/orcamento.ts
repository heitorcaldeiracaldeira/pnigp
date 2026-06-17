// Execução orçamentária por unidade (órgão) e por ação/programa.
// Derivada de forma determinística das funções de despesa (consistente com a despesa total).

import type { Financas } from "./queries";

export type Elemento = { nome: string; orcado: number; executado: number; execucao: number };
export type Acao = {
  nome: string;
  orcado: number;
  executado: number;
  execucao: number;
  elementos: Elemento[];
};
export type Unidade = {
  nome: string;
  orcado: number;
  executado: number;
  execucao: number;
  acoes: Acao[];
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ACOES: Record<string, string[]> = {
  gabinete: ["Gabinete e Representação", "Comunicação Social", "Planejamento e Coordenação"],
  fazenda: ["Administração Geral", "Gestão Tributária", "Tecnologia da Informação"],
  saude: ["Atenção Primária", "Média e Alta Complexidade", "Vigilância em Saúde", "Gestão do SUS"],
  educacao: ["Ensino Fundamental", "Educação Infantil", "Transporte e Merenda", "Gestão Escolar"],
  seguranca: ["Guarda Municipal", "Videomonitoramento", "Defesa Civil"],
  assistencia: ["Proteção Social Básica (CRAS)", "Proteção Especial (CREAS)", "Transferência de Renda"],
  infra: ["Pavimentação e Vias", "Saneamento e Drenagem", "Iluminação Pública", "Manutenção Urbana"],
  legislativo: ["Atividade Legislativa", "Fiscalização e Controle"],
  encargos: ["Serviço da Dívida", "Inativos e Pensionistas", "Reserva de Contingência"],
  administracao: ["Gestão Administrativa", "Gestão Fiscal e Tributária", "Tecnologia da Informação", "Gabinete e Comunicação"],
  outras: ["Atividade Legislativa", "Encargos e Serviço da Dívida", "Demais Despesas"],
};

// Elementos de despesa (classificação econômica) por tipo de órgão
const ELEMENTOS_PADRAO = [
  "Vencimentos e Vantagens Fixas",
  "Obrigações Patronais",
  "Material de Consumo",
  "Outros Serviços de Terceiros – PJ",
  "Equipamentos e Material Permanente",
];
const ELEMENTOS_KEY: Record<string, string[]> = {
  infra: ["Obras e Instalações", "Outros Serviços de Terceiros – PJ", "Material de Consumo", "Equipamentos e Material Permanente"],
  encargos: ["Amortização e Encargos da Dívida", "Aposentadorias e Pensões", "Sentenças Judiciais"],
  assistencia: ["Subvenções Sociais e Auxílios", "Vencimentos e Vantagens Fixas", "Material de Consumo", "Outros Serviços de Terceiros – PJ"],
};

function taxaExec(nome: string, seed: string): number {
  return 0.78 + (hashStr(nome + seed) % 20) / 100; // 0,78–0,97
}

function montarElementos(key: string, acaoNome: string, execTotal: number, seed: string): Elemento[] {
  const nomes = ELEMENTOS_KEY[key] ?? ELEMENTOS_PADRAO;
  const pesos = nomes.map((n) => 0.5 + (hashStr(n + acaoNome + seed) % 90) / 100); // 0,5–1,4
  const soma = pesos.reduce((a, b) => a + b, 0);
  return nomes
    .map((nome, i) => {
      const executado = execTotal * (pesos[i] / soma);
      const taxa = taxaExec(nome + acaoNome + key, seed);
      return { nome, executado, orcado: executado / taxa, execucao: taxa * 100 };
    })
    .sort((a, b) => b.executado - a.executado);
}

function montarAcoes(key: string, execTotal: number, seed: string): Acao[] {
  const nomes = ACOES[key] ?? ["Despesas gerais"];
  const pesos = nomes.map((n) => 0.6 + (hashStr(n + key + seed) % 80) / 100); // 0,6–1,4
  const soma = pesos.reduce((a, b) => a + b, 0);
  return nomes.map((nome, i) => {
    const alvo = execTotal * (pesos[i] / soma);
    const elementos = montarElementos(key, nome, alvo, seed);
    const executado = elementos.reduce((s, e) => s + e.executado, 0);
    const orcado = elementos.reduce((s, e) => s + e.orcado, 0);
    return { nome, executado, orcado, execucao: orcado > 0 ? (executado / orcado) * 100 : 0, elementos };
  });
}

/* ---- Árvore financeira genérica (usada por receita e despesa) ---- */
export type NoFin = {
  nome: string;
  previsto: number; // orçado / previsto
  realizado: number; // executado / arrecadado
  pct: number; // % execução / arrecadação
  filhos?: NoFin[];
};

const ESPECIES: Record<string, string[]> = {
  tributaria: ["Impostos", "Taxas", "Contribuições"],
  transferencias: ["Transferências da União", "Transferências Estaduais/Constitucionais", "Convênios e Outras"],
  outras: ["Receita Patrimonial", "Receita de Serviços", "Demais Receitas"],
};

function rubricasDe(especie: string, tipo: "M" | "E"): string[] {
  switch (especie) {
    case "Impostos":
      return tipo === "E" ? ["ICMS", "IPVA", "ITCMD", "IRRF"] : ["IPTU", "ISS", "ITBI", "IRRF"];
    case "Taxas":
      return ["Taxas de Poder de Polícia", "Taxas de Serviços"];
    case "Contribuições":
      return tipo === "E" ? ["Contribuição Previdenciária"] : ["COSIP (Iluminação Pública)", "Contribuição Previdenciária"];
    case "Transferências da União":
      return tipo === "E" ? ["FPE", "SUS (Bloco Saúde)", "FUNDEB", "Royalties"] : ["FPM", "SUS (Bloco Saúde)", "FNDE", "Royalties"];
    case "Transferências Estaduais/Constitucionais":
      return tipo === "E" ? ["FUNDEB", "Demais transferências"] : ["ICMS (cota-parte)", "IPVA (cota-parte)", "IPI-Exportação"];
    case "Convênios e Outras":
      return ["Convênios", "Demais transferências"];
    case "Receita Patrimonial":
      return ["Aluguéis e Arrendamentos", "Rendimentos de Aplicações"];
    case "Receita de Serviços":
      return ["Tarifas e Serviços Públicos"];
    default:
      return ["Multas e Juros", "Dívida Ativa", "Receitas Diversas"];
  }
}

/** Distribui um total por nomes com pesos determinísticos. */
function distribuir(nomes: string[], total: number, seed: string): { nome: string; valor: number }[] {
  const pesos = nomes.map((n) => 0.55 + (hashStr(n + seed) % 90) / 100);
  const soma = pesos.reduce((a, b) => a + b, 0);
  return nomes.map((nome, i) => ({ nome, valor: total * (pesos[i] / soma) }));
}

/** Classificação da receita: Origem → Espécie → Rubrica (Previsto × Arrecadado). */
export function receitaClassificacao(f: Financas, seed: string, tipo: "M" | "E"): NoFin[] {
  const origens = [
    { key: "tributaria", nome: "Receita Tributária (própria)", arr: f.rec_tributaria },
    { key: "transferencias", nome: "Transferências Correntes", arr: f.rec_transferencias },
    { key: "outras", nome: "Outras Receitas", arr: f.rec_outras },
  ];

  const noFolha = (nome: string, arrecadado: string | number, s: string): NoFin => {
    const a = Number(arrecadado);
    const taxa = 0.88 + (hashStr(nome + s) % 22) / 100; // 0,88–1,09 (arrecadação vs previsão)
    const previsto = a / taxa;
    return { nome, realizado: a, previsto, pct: previsto > 0 ? (a / previsto) * 100 : 0 };
  };

  const agregar = (nome: string, filhos: NoFin[]): NoFin => {
    const realizado = filhos.reduce((s, c) => s + c.realizado, 0);
    const previsto = filhos.reduce((s, c) => s + c.previsto, 0);
    return { nome, realizado, previsto, pct: previsto > 0 ? (realizado / previsto) * 100 : 0, filhos };
  };

  return origens
    .map((o) => {
      const especies = distribuir(ESPECIES[o.key], o.arr, `${o.key}:${seed}`).map((esp) => {
        const rubNomes = rubricasDe(esp.nome, tipo);
        const rubricas = distribuir(rubNomes, esp.valor, `${esp.nome}:${seed}`).map((r) =>
          noFolha(r.nome, r.valor, `${esp.nome}:${r.nome}:${seed}`),
        );
        return agregar(esp.nome, rubricas.sort((a, b) => b.realizado - a.realizado));
      });
      return agregar(o.nome, especies.sort((a, b) => b.realizado - a.realizado));
    })
    .sort((a, b) => b.realizado - a.realizado);
}

/** Despesa por CATEGORIA econômica → elemento (drill nas barras "Como o dinheiro é gasto"). */
export function despesaCategoriaArvore(f: Financas, seed: string): NoFin[] {
  const cats = [
    { nome: "Pessoal e encargos", v: f.desp_pessoal, itens: ["Vencimentos e Vantagens Fixas", "Obrigações Patronais", "Aposentadorias e Pensões"] },
    { nome: "Custeio (manutenção)", v: f.desp_custeio, itens: ["Material de Consumo", "Outros Serviços de Terceiros – PJ", "Serviços de Terceiros – PF", "Diárias e Passagens"] },
    { nome: "Investimentos", v: f.desp_investimento, itens: ["Obras e Instalações", "Equipamentos e Material Permanente"] },
    { nome: "Dívida", v: f.desp_divida, itens: ["Amortização da Dívida", "Juros e Encargos"] },
  ];
  return cats
    .map((c) => {
      const filhos: NoFin[] = distribuir(c.itens, c.v, `cat:${c.nome}:${seed}`).map((it) => {
        const taxa = taxaExec(it.nome + c.nome, seed);
        return { nome: it.nome, realizado: it.valor, previsto: it.valor / taxa, pct: taxa * 100 };
      });
      const realizado = filhos.reduce((s, x) => s + x.realizado, 0);
      const previsto = filhos.reduce((s, x) => s + x.previsto, 0);
      return { nome: c.nome, realizado, previsto, pct: previsto > 0 ? (realizado / previsto) * 100 : 0, filhos };
    })
    .sort((a, b) => b.realizado - a.realizado);
}

/** Despesa por FUNÇÃO → ação → elemento (para drill nas barras "Para onde vai o dinheiro"). */
export function despesaFuncaoArvore(f: Financas, seed: string): NoFin[] {
  const funcs = [
    { key: "saude", nome: "Saúde", v: f.func_saude },
    { key: "educacao", nome: "Educação", v: f.func_educacao },
    { key: "seguranca", nome: "Segurança", v: f.func_seguranca },
    { key: "assistencia", nome: "Assistência social", v: f.func_assistencia },
    { key: "infra", nome: "Infraestrutura", v: f.func_infraestrutura },
    { key: "administracao", nome: "Administração", v: f.func_administracao },
    { key: "outras", nome: "Outras", v: f.func_outras },
  ];
  return funcs
    .map((fn) => {
      const acoes = montarAcoes(fn.key, fn.v, `F:${seed}`);
      const filhos: NoFin[] = acoes.map((a) => ({
        nome: a.nome,
        previsto: a.orcado,
        realizado: a.executado,
        pct: a.execucao,
        filhos: a.elementos.map((e) => ({ nome: e.nome, previsto: e.orcado, realizado: e.executado, pct: e.execucao })),
      }));
      const realizado = filhos.reduce((s, c) => s + c.realizado, 0);
      const previsto = filhos.reduce((s, c) => s + c.previsto, 0);
      return { nome: fn.nome, previsto, realizado, pct: previsto > 0 ? (realizado / previsto) * 100 : 0, filhos };
    })
    .sort((a, b) => b.realizado - a.realizado);
}

/** Adapta a execução por unidade (despesa) para a árvore genérica. */
export function despesaArvore(unidades: Unidade[]): NoFin[] {
  return unidades.map((u) => ({
    nome: u.nome,
    previsto: u.orcado,
    realizado: u.executado,
    pct: u.execucao,
    filhos: u.acoes.map((a) => ({
      nome: a.nome,
      previsto: a.orcado,
      realizado: a.executado,
      pct: a.execucao,
      filhos: a.elementos.map((e) => ({
        nome: e.nome,
        previsto: e.orcado,
        realizado: e.executado,
        pct: e.execucao,
      })),
    })),
  }));
}

export function unidadesOrcamentarias(f: Financas, seed: string): Unidade[] {
  const base = [
    { key: "gabinete", nome: "Gabinete do Chefe do Executivo", exec: f.func_administracao * 0.3 },
    { key: "fazenda", nome: "Sec. de Fazenda e Administração", exec: f.func_administracao * 0.7 },
    { key: "saude", nome: "Sec. de Saúde", exec: f.func_saude },
    { key: "educacao", nome: "Sec. de Educação", exec: f.func_educacao },
    { key: "seguranca", nome: "Sec. de Segurança e Ordem Pública", exec: f.func_seguranca },
    { key: "assistencia", nome: "Sec. de Assistência Social", exec: f.func_assistencia },
    { key: "infra", nome: "Sec. de Infraestrutura e Obras", exec: f.func_infraestrutura },
    { key: "legislativo", nome: "Poder Legislativo (Câmara)", exec: f.func_outras * 0.45 },
    { key: "encargos", nome: "Encargos Gerais", exec: f.func_outras * 0.55 },
  ];

  return base
    .map((u) => {
      const acoes = montarAcoes(u.key, u.exec, seed);
      const executado = acoes.reduce((s, a) => s + a.executado, 0);
      const orcado = acoes.reduce((s, a) => s + a.orcado, 0);
      return {
        nome: u.nome,
        executado,
        orcado,
        execucao: orcado > 0 ? (executado / orcado) * 100 : 0,
        acoes: acoes.sort((a, b) => b.executado - a.executado),
      };
    })
    .sort((a, b) => b.executado - a.executado);
}
