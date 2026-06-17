import { AlertTriangle, ShieldAlert, ShieldCheck, Info, type LucideIcon } from "lucide-react";
import type { NivelRisco, RiscoCompra } from "@/lib/compras-risco";

const META: Record<NivelRisco, { label: string; chip: string; border: string; icon: LucideIcon; cor: string }> = {
  alto: { label: "Risco alto", chip: "bg-rose-100 text-rose-700", border: "border-l-rose-500", icon: ShieldAlert, cor: "text-rose-500" },
  medio: { label: "Risco médio", chip: "bg-amber-100 text-amber-700", border: "border-l-amber-500", icon: AlertTriangle, cor: "text-amber-500" },
  baixo: { label: "Risco baixo", chip: "bg-sky-100 text-sky-700", border: "border-l-sky-500", icon: Info, cor: "text-sky-500" },
};

export function ComprasRiscos({ riscos }: { riscos: RiscoCompra[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-4 text-white">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5" />
          <div>
            <h3 className="font-semibold leading-tight">Riscos em compras</h3>
            <p className="text-xs text-slate-400">Red flags inspiradas na fiscalização do TCU</p>
          </div>
        </div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur">
          {riscos.length === 0 ? "Sem riscos" : `${riscos.length} ponto(s)`}
        </span>
      </div>

      {riscos.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-emerald-700">
          <ShieldCheck className="h-5 w-5" /> Nenhum risco relevante identificado nas contratações analisadas.
        </div>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {riscos.map((r) => {
            const m = META[r.nivel];
            const Icon = m.icon;
            return (
              <div key={r.id} className={`rounded-xl border border-slate-200 border-l-4 ${m.border} bg-white p-4`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${m.cor}`} />
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${m.chip}`}>{m.label}</span>
                  <h4 className="text-sm font-semibold text-slate-800">{r.titulo}</h4>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{r.detalhe}</p>
                <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-relaxed text-slate-600">
                  <strong className="font-semibold text-slate-700">Recomendação:</strong> {r.recomendacao}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500">Base: {r.ref}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
