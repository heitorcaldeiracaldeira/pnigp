import { AlertTriangle, ArrowRight, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/insights-sc";

const SEV = {
  critico: { label: "Crítico", border: "border-l-rose-500", chip: "bg-rose-100 text-rose-700", Icon: ShieldAlert },
  atencao: { label: "Atenção", border: "border-l-amber-400", chip: "bg-amber-100 text-amber-700", Icon: AlertTriangle },
  oportunidade: { label: "Oportunidade", border: "border-l-sky-400", chip: "bg-sky-100 text-sky-700", Icon: Lightbulb },
  destaque: { label: "Destaque", border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700", Icon: TrendingUp },
};

export function InsightsPanelSC({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  const nCrit = insights.filter((i) => i.severidade === "critico").length;
  const nAt = insights.filter((i) => i.severidade === "atencao").length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 rounded-t-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-3">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <span className="text-sm font-semibold text-white">Análise automática — o que o sistema viu</span>
        <span className="ml-auto text-[11px] text-slate-300">{nCrit > 0 ? `${nCrit} crítico(s) · ` : ""}{nAt} atenção · {insights.length} no total</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {insights.map((i, idx) => {
          const s = SEV[i.severidade];
          return (
            <li key={idx} className={`border-l-4 ${s.border} px-4 py-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <s.Icon className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-800">{i.titulo}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{i.area}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{i.detalhe}</p>
              {i.acao && <p className="mt-1 flex items-start gap-1 text-[13px] text-slate-700"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /> <span><b>Ação:</b> {i.acao}</span></p>}
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2 text-[11px] text-slate-500">Gerado automaticamente a partir dos dados oficiais (SICONFI, SIOPS, CNES, PNCP, IBGE) vs. pares de porte e limites legais. Sinais para priorizar — não substituem análise técnica.</p>
    </div>
  );
}
