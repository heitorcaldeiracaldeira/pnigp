import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Gavel,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Achado, AchadoTipo, AreaScore, Oportunidade, Parecer } from "@/lib/audit";
import { fmtPop } from "@/lib/ui";

const TIPO: Record<
  AchadoTipo,
  { label: string; chip: string; icon: LucideIcon; border: string; iconColor: string }
> = {
  risco: { label: "Risco", chip: "bg-rose-100 text-rose-700", icon: ShieldAlert, border: "border-l-rose-500", iconColor: "text-rose-500" },
  ressalva: { label: "Ressalva", chip: "bg-amber-100 text-amber-700", icon: AlertTriangle, border: "border-l-amber-500", iconColor: "text-amber-500" },
  recomendacao: { label: "Recomendação", chip: "bg-sky-100 text-sky-700", icon: ClipboardList, border: "border-l-sky-500", iconColor: "text-sky-500" },
  boa_pratica: { label: "Boa prática", chip: "bg-emerald-100 text-emerald-700", icon: BadgeCheck, border: "border-l-emerald-500", iconColor: "text-emerald-500" },
};

const PARECER_COR: Record<Parecer["tom"], string> = {
  ok: "bg-emerald-500",
  ressalva: "bg-amber-500",
  critico: "bg-rose-500",
};

const BAR_COR: Record<AreaScore["classe"], string> = {
  acima: "bg-emerald-500",
  media: "bg-amber-500",
  abaixo: "bg-rose-500",
};

const CLASSE_LABEL: Record<AreaScore["classe"], string> = {
  acima: "Acima dos pares",
  media: "Na média",
  abaixo: "Abaixo dos pares",
};

export function AuditPanel({
  parecer,
  areas,
  achados,
  oportunidades,
}: {
  parecer: Parecer;
  areas: AreaScore[];
  achados: Achado[];
  oportunidades: Oportunidade[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Gavel className="h-5 w-5" />
          <div>
            <h3 className="font-semibold leading-tight">Visão do Auditor</h3>
            <p className="text-xs text-slate-400">
              Análise cross-área inspirada em metodologias de controle externo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Parecer:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${PARECER_COR[parecer.tom]}`} />
            {parecer.rotulo}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Matriz de desempenho por área */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">
            Desempenho por área <span className="font-normal text-slate-500">(vs. pares · 50 = na média)</span>
          </h4>
          <div className="space-y-3">
            {areas.map((a) => (
              <div key={a.area}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{a.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {a.score}/100 · <span className="font-medium">{CLASSE_LABEL[a.classe]}</span>
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-slate-100">
                  <div
                    className={`h-2.5 rounded-full ${BAR_COR[a.classe]}`}
                    style={{ width: `${a.score}%` }}
                  />
                  {/* marcador dos pares (50) */}
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-400/70" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {CLASSE_LABEL.acima}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {CLASSE_LABEL.media}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> {CLASSE_LABEL.abaixo}</span>
          </div>

          {/* Onde focar pelo cidadão */}
          {oportunidades.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Users className="h-4 w-4 text-teal-600" />
                Onde focar para o cidadão
              </h4>
              <div className="space-y-2">
                {oportunidades.map((o, idx) => (
                  <div key={o.area} className="rounded-lg border border-teal-100 bg-teal-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-teal-800">
                        {idx + 1}. {o.label}
                      </span>
                      <span className="rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        +{o.ganho} pts até os pares
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Impacta toda a população — ~{fmtPop(o.habitantes)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Achados de auditoria */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">
            Achados e apontamentos
          </h4>
          <div className="space-y-3">
            {achados.length === 0 ? (
              <p className="text-sm text-slate-500">Sem apontamentos relevantes neste ciclo.</p>
            ) : (
              achados.map((a) => {
                const t = TIPO[a.tipo];
                const Icon = t.icon;
                return (
                  <div key={a.id} className={`rounded-xl border border-slate-200 border-l-4 ${t.border} bg-white p-3.5`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${t.iconColor}`} />
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${t.chip}`}>
                        {t.label}
                      </span>
                      <h5 className="text-sm font-semibold text-slate-800">{a.titulo}</h5>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{a.fundamentacao}</p>
                    <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-relaxed text-slate-600">
                      <strong className="font-semibold text-slate-700">Recomendação:</strong> {a.recomendacao}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <p className="border-t border-slate-100 px-5 py-3 text-center text-xs text-slate-500">
        Análise automática inspirada na lógica dos Tribunais de Contas · não substitui auditoria oficial · dados simulados
      </p>
    </section>
  );
}
