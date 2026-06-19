import { AlertTriangle, CheckCircle2, Database, Stethoscope } from "lucide-react";
import { GlossarioStrip } from "@/components/termo";
import type { DiagGestor } from "@/lib/queries";

export function DiagnosticoGestor({ data }: { data: NonNullable<DiagGestor> }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <Stethoscope className="h-4 w-4" /> Diagnóstico do Gestor
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500">exercício fechado {data.ano} · grupo {data.grupo}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">Pontos de análise comparados aos municípios de porte semelhante, com sugestões ancoradas em LRF, Constituição e referenciais do TCE-SC/TCU.</p>
          </div>
          <div className={`rounded-xl px-4 py-2 text-center ${data.nAlertas > 0 ? "bg-amber-100" : "bg-emerald-100"}`}>
            <div className={`font-display text-2xl font-bold tabular-nums ${data.nAlertas > 0 ? "text-amber-700" : "text-emerald-700"}`}>{data.nAlertas}</div>
            <div className="text-[11px] text-slate-600">{data.nAlertas === 1 ? "ponto de atenção" : "pontos de atenção"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.pontos.map((p, i) => (
          <div key={i} className={`rounded-xl border p-4 ${p.alerta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                {p.alerta ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                {p.titulo}
              </span>
              <span className="shrink-0 font-display text-lg font-bold tabular-nums text-slate-900">{p.valor}</span>
            </div>
            <div className="mt-0.5 pl-[22px] text-[11px] text-slate-500">{p.ref}</div>
            {p.alerta && <div className="mt-2 pl-[22px] text-sm text-amber-800">→ {p.sugestao}</div>}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Pessoal e DCL: RGF (SICONFI, % oficial sobre RCL ajustada). Educação/FUNDEB: RREO Anexo 14. Saúde (ASPS/LC 141): SIOPS/Min. Saúde. Finanças: RREO. Benchmarks por grupo de porte populacional. Sugestões são pontos a verificar, não veredictos.
      </p>
      <GlossarioStrip ks={["LRF", "pessoal", "RCL", "DCL", "MDE", "FUNDEB"]} />
    </div>
  );
}
