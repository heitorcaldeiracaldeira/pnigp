import type { IdebSC } from "@/lib/queries";

// Painel do IDEB — observado × meta + série histórica. Exibição neutra e pedagógica.
export function IdebPainel({ dados, nome }: { dados: IdebSC; nome: string }) {
  if (!dados) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800">🎓 IDEB — qualidade do aprendizado</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Dados oficiais · INEP</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Índice de Desenvolvimento da Educação Básica de {nome}: nota observada × meta projetada, por etapa. O IDEB combina aprendizado (SAEB) e fluxo (aprovação); escala 0–10.</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {dados.etapas.map((e) => {
          const max = Math.max(10, ...e.serie.map((s) => Math.max(s.ideb, s.meta || 0)));
          return (
            <div key={e.etapa} className="rounded-xl border border-slate-200 p-3">
              <div className="text-[13px] font-semibold text-slate-800">{e.label}</div>
              <div className="text-[10px] text-slate-400">rede {e.rede.toLowerCase()}</div>
              {e.atual && (
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{e.atual.ideb.toFixed(1)}</span>
                  <span className="pb-0.5 text-[11px] text-slate-500">meta {e.atual.meta != null ? e.atual.meta.toFixed(1) : "—"} · {e.atual.ano}</span>
                  {e.cumpriu != null && <span className={`mb-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${e.cumpriu ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{e.cumpriu ? "cumpriu" : "abaixo"}</span>}
                </div>
              )}
              <div className="mt-2 flex items-end gap-1" style={{ height: 54 }}>
                {e.serie.map((s) => (
                  <div key={s.ano} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${s.ano}: ${s.ideb.toFixed(1)}${s.meta != null ? ` (meta ${s.meta.toFixed(1)})` : ""}`}>
                    <div className={`w-full rounded-t ${s.meta != null && s.ideb >= s.meta ? "bg-emerald-500" : "bg-teal-400"}`} style={{ height: `${(s.ideb / max) * 46}px` }} />
                    <span className="text-[8px] text-slate-400">{String(s.ano).slice(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Barras verdes = atingiu a meta do ano. Fonte: INEP/IDEB. Anos iniciais e finais são responsabilidade do município; ensino médio, do Estado.</p>
    </section>
  );
}
