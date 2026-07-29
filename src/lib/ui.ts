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

/** Formata data para DD/MM/AAAA. Aceita ISO ("2025-12-18..."), Date ou Date.toString(). "—" se vazio. */
export function fmtData(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = v instanceof Date ? v : new Date(s);
  if (!isNaN(d.getTime())) return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return s;
}

// FUSO: o servidor (Vercel/Node) roda em UTC e o usuário está em UTC−3. Duas consequências, ambas já
// morderam este projeto: (1) `new Date("2026-07-29")` vira meia-noite UTC e, formatado em horário local,
// exibe 28/07 — um dia a MENOS (use fmtData acima, que lê a string); (2) entre 21h e 24h no Brasil o
// servidor já está no dia seguinte, então "hoje" calculado no servidor carimba a data de AMANHÃ.
// As funções abaixo resolvem (2): a data é sempre a de Brasília, não importa o fuso de quem executa.
const _fmtSP = (opts: Intl.DateTimeFormatOptions, locale = "pt-BR") =>
  new Intl.DateTimeFormat(locale, { timeZone: "America/Sao_Paulo", ...opts });

/** HOJE em Brasília no formato ISO (AAAA-MM-DD) — independente do fuso do servidor. */
export function hojeISOBR(): string {
  return _fmtSP({ year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA").format(new Date());
}

/** HOJE em Brasília no formato DD/MM/AAAA — independente do fuso do servidor. */
export function hojeBR(): string {
  const [a, m, d] = hojeISOBR().split("-");
  return `${d}/${m}/${a}`;
}

/** Formata um INSTANTE (timestamp com hora, ex.: "coletado em") na data de Brasília. Diferente de fmtData,
 *  que é para data pura (AAAA-MM-DD) e não deve sofrer conversão de fuso nenhuma. */
export function fmtDataInstante(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return "—";
  return _fmtSP({ year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** HOJE em Brasília por extenso ("29 de julho de 2026") — para o rodapé de documentos oficiais. */
export function hojeExtensoBR(): string {
  return _fmtSP({ day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

/** Formata CNPJ (XX.XXX.XXX/XXXX-XX) ou CPF (XXX.XXX.XXX-XX). Mantém o valor original se não for 11/14 dígitos. */
export function fmtCNPJ(v: string | null | undefined): string {
  if (!v) return "—";
  const d = String(v).replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(v);
}

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
