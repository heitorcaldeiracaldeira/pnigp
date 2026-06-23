import type { ConveniosSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Convênios e contratos de repasse recebidos (SICONV/Transferegov). Tom neutro: captado, executado e situação.
export function ConveniosCard({ dados, nome }: { dados: ConveniosSC; nome: string }) {
  if (!dados) return null;
  const mx = Math.max(1, ...dados.porSituacao.map((s) => s.valor));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🤝 Convênios e contratos de repasse</h3>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">SICONV/Transferegov</span>
      </div>
      <p className="text-sm text-slate-500">Recursos da União captados por {nome} via convênio / contrato de repasse — valor pactuado e quanto já foi efetivamente liberado.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.n}</div><div className="text-[11px] text-slate-600">convênios</div></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3"><div className="text-xl font-bold tabular-nums text-indigo-700">{fmtBRLCompact(dados.repasse)}</div><div className="text-[11px] text-slate-600">repasse pactuado</div></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{fmtBRLCompact(dados.desembolsado)}</div><div className="text-[11px] text-slate-600">já desembolsado</div></div>
        <div className={`rounded-xl border p-3 ${dados.execPct < 50 ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}><div className={`text-xl font-bold tabular-nums ${dados.execPct < 50 ? "text-amber-700" : "text-slate-800"}`}>{dados.execPct}%</div><div className="text-[11px] text-slate-600">executado</div></div>
      </div>

      {dados.porSituacao.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por situação</div>
          <div className="space-y-1.5">
            {dados.porSituacao.map((s) => (
              <div key={s.situacao} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate text-slate-600" title={s.situacao}>{s.situacao} <span className="text-slate-400">({s.n})</span></span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-indigo-400" style={{ width: `${(s.valor / mx) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{fmtBRLCompact(s.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONV/Transferegov (repositório público detru). "Repasse pactuado" = valor do convênio a cargo da União; "desembolsado" = liberado de fato. Baixa execução pode indicar convênio em andamento ou pendência. Exibição neutra.</p>
    </section>
  );
}
