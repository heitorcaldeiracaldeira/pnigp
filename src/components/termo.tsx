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
