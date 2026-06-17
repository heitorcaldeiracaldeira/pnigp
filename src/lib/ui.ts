// Configuração visual compartilhada do Painel (áreas, formatação, cores de índice).

export type AreaKey =
  | "saude"
  | "educacao"
  | "seguranca"
  | "fiscal"
  | "social"
  | "economia";

export const AREAS: Record<
  AreaKey,
  { label: string; icon: string; color: string; bg: string }
> = {
  saude: { label: "Saúde", icon: "HeartPulse", color: "text-rose-600", bg: "bg-rose-50" },
  educacao: { label: "Educação", icon: "GraduationCap", color: "text-amber-600", bg: "bg-amber-50" },
  seguranca: { label: "Segurança", icon: "ShieldCheck", color: "text-sky-600", bg: "bg-sky-50" },
  fiscal: { label: "Fiscal", icon: "Landmark", color: "text-emerald-600", bg: "bg-emerald-50" },
  social: { label: "Social", icon: "Users", color: "text-violet-600", bg: "bg-violet-50" },
  economia: { label: "Economia", icon: "TrendingUp", color: "text-cyan-700", bg: "bg-cyan-50" },
};

export const AREA_ORDER: AreaKey[] = [
  "saude",
  "educacao",
  "seguranca",
  "fiscal",
  "social",
  "economia",
];

export const PORTE_LABEL: Record<string, string> = {
  pequeno: "Pequeno porte",
  medio: "Médio porte",
  grande: "Grande porte",
  metropole: "Metrópole",
};

/** Faixa de classificação de um índice 0-100. */
export function classifyIndex(v: number): {
  label: string;
  color: string;
  text: string;
} {
  if (v >= 80) return { label: "Muito alta", color: "bg-emerald-500", text: "text-emerald-700" };
  if (v >= 65) return { label: "Alta", color: "bg-lime-500", text: "text-lime-700" };
  if (v >= 50) return { label: "Média", color: "bg-amber-500", text: "text-amber-700" };
  if (v >= 35) return { label: "Baixa", color: "bg-orange-500", text: "text-orange-700" };
  return { label: "Crítica", color: "bg-rose-500", text: "text-rose-700" };
}

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function fmtNumber(v: number, casas = 1): string {
  if (casas === 0) return nf0.format(v);
  if (casas === 2) return nf2.format(v);
  return nf1.format(v);
}

export function fmtValor(v: number, unidade: string): string {
  if (unidade.startsWith("R$")) return brl.format(v);
  if (unidade === "%") return `${nf1.format(v)}%`;
  if (unidade === "índice") return nf2.format(v);
  return nf1.format(v);
}

export function fmtPop(v: number): string {
  if (v >= 1_000_000) return `${nf2.format(v / 1_000_000)} mi hab.`;
  if (v >= 1_000) return `${nf0.format(v / 1_000)} mil hab.`;
  return `${nf0.format(v)} hab.`;
}

export const fmtBRL = (v: number) => brl.format(v);

/** R$ compacto para valores grandes (mi / bi). */
export function fmtBRLCompact(v: number): string {
  const neg = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${neg}R$ ${(a / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1_000_000) return `${neg}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${neg}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return brl.format(v);
}

/** Variação percentual considerando a direção desejada (retorna se é "bom"). */
export function evalDelta(
  atual: number,
  anterior: number | null,
  direcaoMelhor: "alta" | "baixa",
): { pct: number; bom: boolean } | null {
  if (anterior == null || anterior === 0) return null;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const bom = direcaoMelhor === "alta" ? pct >= 0 : pct <= 0;
  return { pct, bom };
}

/** Compara valor com a média do porte: retorna se o município está melhor. */
export function melhorQueMedia(
  valor: number,
  media: number,
  direcaoMelhor: "alta" | "baixa",
): boolean {
  return direcaoMelhor === "alta" ? valor >= media : valor <= media;
}
