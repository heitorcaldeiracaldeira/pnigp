import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Insight } from "@/lib/insights";
import type { Parecer } from "@/lib/audit";

const TOM = {
  ok: { wrap: "border-emerald-200 bg-emerald-50", accent: "bg-emerald-500", icon: CheckCircle2, iconColor: "text-emerald-600" },
  ressalva: { wrap: "border-amber-200 bg-amber-50", accent: "bg-amber-500", icon: Info, iconColor: "text-amber-600" },
  critico: { wrap: "border-rose-200 bg-rose-50", accent: "bg-rose-500", icon: AlertTriangle, iconColor: "text-rose-600" },
} as const;

export function ResumoBanner({
  nome,
  igp360,
  posicao,
  total,
  insights,
  parecer,
}: {
  nome: string;
  igp360: number;
  posicao?: number;
  total: number;
  insights: Insight[];
  parecer: Parecer;
}) {
  const t = TOM[parecer.tom];
  const Icon = t.icon;

  const critico = insights.find((i) => i.severidade === "critico");
  const atencao = insights.find((i) => i.severidade === "atencao");
  const oportunidade = insights.find((i) => i.severidade === "oportunidade");
  const destaque = insights.find((i) => i.severidade === "destaque");

  // Estado geral em uma frase
  const estado =
    parecer.tom === "critico"
      ? "requer providências"
      : parecer.tom === "ressalva"
        ? "vai bem em parte, com pontos de atenção"
        : "está bem";

  const prioridade = critico ?? atencao ?? oportunidade ?? destaque;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border ${t.wrap} p-4`}>
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.accent}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-slate-800 sm:text-base">
          A gestão de <strong>{nome}</strong> {estado} — <strong>IGP 360 {igp360.toFixed(1)}</strong>
          {posicao ? (
            <>
              {" "}
              (<strong>{posicao}º</strong> de {total} no país)
            </>
          ) : null}
          .
        </p>
        {prioridade && (
          <p className="mt-0.5 text-sm text-slate-600">
            <span className="font-medium text-slate-700">
              {critico ? "Prioridade: " : atencao ? "Atenção: " : oportunidade ? "Oportunidade: " : "Destaque: "}
            </span>
            {prioridade.titulo}.
          </p>
        )}
      </div>
    </div>
  );
}
