import { CONHECIMENTO } from "@/lib/referencias-conhecimento";

// Base metodológica de uma área: marcos legais + biblioteca de materiais oficiais (modelo de Compras).
export function BaseMetodologica({ area }: { area: keyof typeof CONHECIMENTO | string }) {
  const c = CONHECIMENTO[area];
  if (!c) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">📚 Base metodológica — {c.titulo}</h3>
      <p className="mb-3 text-xs text-slate-500">Marcos legais e materiais oficiais que fundamentam esta área — exibição neutra, para estudo e aplicação.</p>

      <div className="grid gap-2 sm:grid-cols-3">
        {c.marcos.map((m) => (
          <div key={m.titulo} className="rounded-xl border border-slate-200 p-3">
            <div className="text-[13px] font-semibold text-slate-800">{m.titulo}</div>
            <p className="mt-0.5 text-[11px] text-slate-500">{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {c.materiais.map((mt) => (
          <a key={mt.url} href={mt.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-sm transition hover:border-teal-400 hover:bg-teal-50/50">
            <span className="text-slate-700">{mt.titulo}</span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{mt.fonte} ↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
