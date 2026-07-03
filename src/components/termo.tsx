import { InfoTip } from "@/components/info-tip";

// Glossário central — explica siglas/jargão para o gestor não-técnico (público-alvo do PNIGP).
export const GLOSSARIO: Record<string, string> = {
  ASPS: "Ações e Serviços Públicos de Saúde — base do mínimo de 15% da receita aplicada em saúde (LC 141/2012).",
  MDE: "Manutenção e Desenvolvimento do Ensino — base do mínimo de 25% da receita em educação (CF art. 212).",
  FUNDEB: "Fundo da educação básica — ao menos 70% deve ir para remuneração de profissionais do ensino.",
  RCL: "Receita Corrente Líquida — receita corrente menos deduções; é a base dos limites da LRF.",
  DCL: "Dívida Consolidada Líquida — dívida total menos disponibilidades; limite de 120% da RCL nos municípios (Res. SF 40/2001).",
  LRF: "Lei de Responsabilidade Fiscal (LC 101/2000) — fixa limites de pessoal, dívida e metas fiscais.",
  RGF: "Relatório de Gestão Fiscal — demonstrativo quadrimestral da LRF (pessoal e dívida), dado oficial.",
  APS: "Atenção Primária à Saúde — porta de entrada do SUS (Estratégia Saúde da Família / equipes de AP).",
  FNS: "Fundo Nacional de Saúde — repasses federais fundo-a-fundo ao SUS do município (custeio e investimento).",
  SIOPS: "Sistema de Informações sobre Orçamentos Públicos em Saúde — fonte oficial do gasto em saúde.",
  pessoal: "Despesa com pessoal sobre a RCL — limite LRF do Executivo: alerta 48,6% · prudencial 51,3% · máximo 54%.",
  SICONFI: "Sistema de Informações Contábeis e Fiscais do Setor Público Brasileiro (Tesouro Nacional) — fonte oficial das contas dos entes (RREO, RGF, DCA).",
  RREO: "Relatório Resumido da Execução Orçamentária — demonstrativo bimestral da execução do orçamento (CF art. 165; LRF).",
  FPM: "Fundo de Participação dos Municípios — transferência constitucional da União (art. 159 CF), por faixa de coeficiente de população (TCU).",
  MSC: "Matriz de Saldos Contábeis — base contábil mensal que os entes enviam ao Tesouro; origem dos dados do SICONFI.",
  PNCP: "Portal Nacional de Contratações Públicas — base oficial das licitações e contratos (Lei 14.133/2021).",
  CAUC: "Serviço Auxiliar de Informações para Transferências Voluntárias — checklist de regularidade do ente para receber repasses da União.",
  CATMAT: "Catálogo de Materiais do governo federal — classifica itens de compra (permite comparar preços do mesmo item entre municípios).",
  FNAS: "Fundo Nacional de Assistência Social — repasses federais fundo-a-fundo do SUAS (proteção básica e especial).",
  "NOB-SUAS": "Norma Operacional Básica do SUAS — referências de organização da assistência social (ex.: 1 CRAS por ~20 mil habitantes).",
  IGD: "Índice de Gestão Descentralizada — mede a qualidade da gestão do Bolsa Família/CadÚnico e do SUAS; condiciona o cofinanciamento federal.",
  BPC: "Benefício de Prestação Continuada — 1 salário mínimo a idosos e pessoas com deficiência de baixa renda (renda federal direta ao cidadão).",
  PBF: "Programa Bolsa Família — transferência de renda condicionada às famílias em pobreza inscritas no CadÚnico.",
  "CadÚnico": "Cadastro Único — registro federal das famílias de baixa renda; porta de entrada dos programas sociais.",
  CRP: "Certificado de Regularidade Previdenciária — atesta a regularidade do RPPS; sem ele, o ente fica bloqueado de transferências voluntárias.",
  CNES: "Cadastro Nacional de Estabelecimentos de Saúde — base oficial da rede de saúde (unidades, leitos, equipes).",
  PPA: "Plano Plurianual — planejamento de 4 anos (diretrizes, objetivos e metas); base da LDO e da LOA.",
  LDO: "Lei de Diretrizes Orçamentárias — define metas e prioridades do ano seguinte; ponte entre o PPA e a LOA.",
  LOA: "Lei Orçamentária Anual — fixa a receita e a despesa do exercício.",
};

/** Termo com tooltip do glossário: <Termo k="ASPS" /> → "ASPS ⓘ" */
export function Termo({ k, texto }: { k: keyof typeof GLOSSARIO | string; texto?: string }) {
  const def = GLOSSARIO[k];
  if (!def) return <>{texto ?? k}</>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {texto ?? k} <InfoTip text={def} label={`O que é ${k}`} />
    </span>
  );
}

/** Faixa de glossário (rodapé): <GlossarioStrip ks={["RCL","DCL","LRF"]} /> */
export function GlossarioStrip({ ks }: { ks: string[] }) {
  const itens = ks.filter((k) => GLOSSARIO[k]);
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span className="font-semibold text-slate-600">Glossário:</span>
      {itens.map((k) => (
        <span key={k} className="inline-flex items-center gap-0.5"><b className="text-slate-600">{k}</b> <InfoTip text={GLOSSARIO[k]} label={`O que é ${k}`} /></span>
      ))}
    </div>
  );
}
