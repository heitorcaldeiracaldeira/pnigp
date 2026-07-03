import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Alerta } from "@/lib/queries";

const SEV: Record<Alerta["sev"], { label: string; cls: string; dot: string; Icon: typeof AlertTriangle }> = {
  critico: { label: "Crítico", cls: "border-l-rose-500 bg-rose-50/50", dot: "bg-rose-500", Icon: ShieldAlert },
  alto: { label: "Alto", cls: "border-l-amber-500 bg-amber-50/50", dot: "bg-amber-500", Icon: AlertTriangle },
  medio: { label: "Atenção", cls: "border-l-sky-500 bg-sky-50/40", dot: "bg-sky-500", Icon: BellRing },
};

export function CentralAlertas({ alertas, nome }: { alertas: Alerta[]; nome: string }) {
  if (!alertas.length) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm shadow-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <span className="text-slate-700"><b>Nenhum alerta ativo</b> para {nome} nos pontos monitorados (CRP, CAUC, inclusão social, cobertura da rede e fornecedores). Continue acompanhando — os sinais se atualizam a cada coleta.</span>
      </div>
    );
  }
  const nCrit = alertas.filter((a) => a.sev === "critico").length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><BellRing className="h-4 w-4 text-rose-600" /> Central de Alertas — {nome}</div>
        <span className="text-xs text-slate-500">{alertas.length} ponto(s) cego(s){nCrit > 0 ? ` · ${nCrit} crítico(s)` : ""}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">O que o município pode estar perdendo agora — risco a evitar e oportunidade na mesa, num só lugar. Cada item liga a fonte e a ação.</p>
      <div className="space-y-2">
        {alertas.map((a, i) => {
          const s = SEV[a.sev];
          return (
            <div key={i} className={`flex items-start gap-2.5 rounded-xl border border-slate-200 border-l-4 ${s.cls} p-3 text-sm`}>
              <s.Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${s.dot}`}>{s.label}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{a.area}</span>
                  <span className="font-semibold text-slate-800">{a.titulo}</span>
                </div>
                <p className="mt-1 text-[13px] text-slate-600">{a.detalhe}</p>
                <p className="mt-1 flex items-start gap-1 text-[12px] text-slate-700"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /><span><b>O que fazer:</b> {a.acao}</span></p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Exibição neutra e didática. Sinais derivados de dados oficiais (CADPREV, Tesouro/CAUC, MDS/MI Social, PNCP); a decisão de ação é prerrogativa do gestor.</p>
    </div>
  );
}
