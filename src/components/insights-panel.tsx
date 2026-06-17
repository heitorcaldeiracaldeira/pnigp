import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Lightbulb,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { type Insight, type Severidade } from "@/lib/insights";
import { AREAS, type AreaKey } from "@/lib/ui";

const META: Record<
  Severidade,
  { label: string; border: string; chip: string; icon: LucideIcon; iconColor: string; dot: string }
> = {
  critico: { label: "Crítico", border: "border-l-rose-500", chip: "bg-rose-100 text-rose-700", icon: AlertTriangle, iconColor: "text-rose-500", dot: "bg-rose-500" },
  atencao: { label: "Atenção", border: "border-l-amber-500", chip: "bg-amber-100 text-amber-700", icon: AlertCircle, iconColor: "text-amber-500", dot: "bg-amber-500" },
  oportunidade: { label: "Oportunidade", border: "border-l-sky-500", chip: "bg-sky-100 text-sky-700", icon: Lightbulb, iconColor: "text-sky-500", dot: "bg-sky-500" },
  destaque: { label: "Destaque", border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700", icon: Trophy, iconColor: "text-emerald-500", dot: "bg-emerald-500" },
};

function areaLabel(area: string): string {
  return (AREAS as Record<string, { label: string }>)[area]?.label ?? "Gestão";
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  const resumo: [Severidade, number][] = (
    ["critico", "atencao", "oportunidade", "destaque"] as Severidade[]
  )
    .map((s) => [s, insights.filter((i) => i.severidade === s).length] as [Severidade, number])
    .filter(([, n]) => n > 0);

  // Tom do cabeçalho conforme a urgência máxima presente
  const grad = insights.some((i) => i.severidade === "critico")
    ? "from-rose-700 to-rose-600"
    : insights.some((i) => i.severidade === "atencao")
      ? "from-amber-600 to-orange-600"
      : "from-teal-700 to-cyan-700";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Cabeçalho */}
      <div className={`flex flex-col gap-3 bg-gradient-to-r ${grad} px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5" />
          <div>
            <h3 className="font-semibold leading-tight">Inteligência da Gestão</h3>
            <p className="text-xs text-teal-50/80">O que os dados revelam — priorizado para a sua decisão</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {resumo.map(([s, n]) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur"
            >
              <span className={`h-2 w-2 rounded-full ${META[s].dot}`} />
              {n} {META[s].label.toLowerCase()}
              {n > 1 ? "s" : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Achados */}
      {insights.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Nenhum ponto de atenção relevante identificado neste ciclo.
        </p>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {insights.map((i) => {
            const m = META[i.severidade];
            const Icon = m.icon;
            return (
              <div
                key={i.id}
                className={`flex gap-3 rounded-xl border border-slate-200 border-l-4 ${m.border} bg-white p-4`}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${m.iconColor}`} />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${m.chip}`}>
                      {m.label}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {areaLabel(i.area)}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold leading-snug text-slate-800">{i.titulo}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{i.detalhe}</p>
                  {i.acao && (
                    <p className="mt-2 flex items-start gap-1 text-xs font-medium text-teal-700">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                      {i.acao}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
