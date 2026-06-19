import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import type { DiagGestor } from "@/lib/queries";

export function AuditoriaSC({ data }: { data: NonNullable<DiagGestor> }) {
  const achados = data.pontos.filter((p) => p.alerta);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-teal-600" /> Auditoria — achados de conformidade (exercício {data.ano})
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${achados.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {achados.length} achado(s)
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Pontos que um Tribunal de Contas examinaria — derivados de regras da LRF, da Constituição e de comparação com pares, sobre dados oficiais.</p>
      </div>

      {achados.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="mb-1 inline h-4 w-4" /> Nenhum achado de conformidade nas regras avaliadas. Indicadores dentro dos limites legais e da mediana dos pares.
        </div>
      ) : (
        <ol className="space-y-3">
          {achados.map((p, i) => (
            <li key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> {p.titulo}</span>
                <span className="shrink-0 font-display text-base font-bold tabular-nums text-slate-900">{p.valor}</span>
              </div>
              <div className="mt-0.5 pl-[22px] text-[11px] text-slate-500">{p.ref}</div>
              <div className="mt-2 pl-[22px] text-sm text-amber-800"><b>Recomendação:</b> {p.sugestao}</div>
            </li>
          ))}
        </ol>
      )}

      <p className="text-[11px] text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Regras ancoradas em LRF (limites de pessoal/dívida), CF art. 212 (educação) e mediana dos pares de porte. Achados são pontos a verificar, não decisões de mérito. Validação contínua de integridade exclui registros inconsistentes.
      </p>
    </div>
  );
}
