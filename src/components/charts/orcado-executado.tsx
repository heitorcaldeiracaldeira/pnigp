import { fmtBRLCompact } from "@/lib/ui";

// Orçado × Executado por função — formato barra de progresso (executado preenchendo o orçado), com % e valores
// escritos. Mais intuitivo que barras agrupadas: lê-se "executou X% do planejado (R$ a de R$ b)".
export function OrcadoExecutado({
  data,
}: {
  data: { label: string; orcado: number; executado: number }[];
}) {
  const itens = [...data].sort((a, b) => b.orcado - a.orcado);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-600" /> Executado (empenhado)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" /> Orçado (dotação)</span>
      </div>
      {itens.map((it) => {
        const pct = it.orcado > 0 ? (it.executado / it.orcado) * 100 : 0;
        const acima = pct > 100;
        const cor = acima ? "bg-rose-500" : pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-teal-600" : "bg-amber-500";
        const corTxt = acima ? "text-rose-600" : pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-teal-700" : "text-amber-600";
        return (
          <div key={it.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-slate-700">{it.label}</span>
              <span className={`text-[13px] font-bold tabular-nums ${corTxt}`}>{Math.round(pct)}%</span>
            </div>
            <div className="mt-1 h-5 w-full overflow-hidden rounded-md bg-slate-200">
              <div className={`flex h-5 items-center rounded-md ${cor}`} style={{ width: `${Math.min(100, pct)}%`, minWidth: pct > 0 ? "2px" : 0 }} />
            </div>
            <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-slate-500">
              <span>Executado <b className="text-slate-700">{fmtBRLCompact(it.executado)}</b></span>
              <span>de <b className="text-slate-700">{fmtBRLCompact(it.orcado)}</b> orçado</span>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-slate-400">A barra mostra quanto de cada área já foi <b>empenhado</b> em relação ao que foi <b>orçado</b> na LOA. Verde ≥80% · azul 50–79% · amarelo &lt;50% (execução baixa) · vermelho acima do orçado.</p>
    </div>
  );
}
