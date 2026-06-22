import { BOAS_PRATICAS } from "@/lib/boas-praticas";

// Catálogo de boas práticas por área — ações comprovadas (o que fazer · impacto · base legal). Aditivo, não substitui nada.
export function CatalogoBoasPraticas({ area }: { area: string }) {
  const grupo = BOAS_PRATICAS[area];
  if (!grupo) return null;
  return (
    <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🧰 Boas práticas — {grupo.rotulo}</h3>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">ações comprovadas</span>
      </div>
      <p className="text-sm text-slate-500">O que outros municípios fizeram para melhorar — com o impacto e a base legal. Use como cardápio de ação.</p>
      <div className="mt-3 space-y-2">
        {grupo.praticas.map((p) => (
          <details key={p.titulo} className="group rounded-xl border border-slate-200 open:border-teal-300 open:bg-teal-50/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-slate-800">✓ {p.titulo}</span>
              <span className="shrink-0 text-xs text-slate-400 transition group-open:rotate-180">▾</span>
            </summary>
            <div className="space-y-1.5 border-t border-slate-100 px-3 pb-3 pt-2 text-[13px]">
              <p className="text-slate-700"><b className="text-slate-500">O que fazer:</b> {p.oque}</p>
              <p className="text-emerald-700"><b className="text-slate-500">Impacto:</b> {p.impacto}</p>
              <p className="text-[11px] text-slate-400"><b>Base:</b> {p.base}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
