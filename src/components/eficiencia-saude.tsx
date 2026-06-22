import type { EficienciaSaudeSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Índice de Eficiência (Saúde) — gasto/hab × resultado da APS (média Previne) vs pares. Quadrante + leitura. Tom neutro.
const Q: Record<string, { t: string; cls: string; ler: (n: string) => string }> = {
  eficiente: { t: "✓ Eficiente (referência)", cls: "border-emerald-200 bg-emerald-50", ler: (n) => `${n} gasta menos por habitante que os pares e tem APS acima da mediana — boa relação custo×resultado.` },
  alto_custo: { t: "Resultado bom, custo alto", cls: "border-sky-200 bg-sky-50", ler: (n) => `${n} tem APS acima da mediana, mas gasta mais por habitante. Há margem para eficiência sem perder resultado.` },
  atencao: { t: "⚠️ Atenção: gasta mais, entrega menos", cls: "border-rose-200 bg-rose-50", ler: (n) => `${n} gasta acima da mediana por habitante e a APS está abaixo dela — baixa eficiência. Rever onde o recurso vai e o registro no e-SUS.` },
  investir: { t: "Investir com foco", cls: "border-amber-200 bg-amber-50", ler: (n) => `${n} gasta abaixo da mediana e a APS está abaixo — pode precisar investir mais (e melhor) na atenção primária.` },
};

export function EficienciaSaude({ dados, nome }: { dados: EficienciaSaudeSC; nome: string }) {
  if (!dados) return null;
  const q = Q[dados.quadrante];
  const maxG = Math.max(dados.gastoHab, dados.medianaGasto, 1);
  const maxR = Math.max(dados.resultado || 0, dados.medianaResultado || 0, 1);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">📐 Índice de Eficiência — custo × resultado</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">gasto saúde × APS (Previne)</span>
      </div>
      <p className="text-sm text-slate-500">O quanto cada real investido em saúde vira resultado na atenção primária, comparado a municípios do mesmo porte. Base {dados.ano} · {dados.nPares} pares.</p>

      <div className={`mt-3 rounded-xl border p-3 ${q.cls}`}>
        <div className="text-sm font-bold text-slate-800">{q.t}</div>
        <p className="mt-0.5 text-[13px] text-slate-700">{q.ler(nome)}</p>
        {dados.potencialEconomia > 1000 && <p className="mt-1 text-[13px] font-semibold text-rose-700">Potencial de economia (até o gasto mediano): {fmtBRLCompact(dados.potencialEconomia)}/ano.</p>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500">Gasto em saúde por habitante/ano</div>
          <div className="text-xl font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.gastoHab)}</div>
          <div className="mt-1 h-2 w-full rounded bg-slate-100"><div className={`h-2 rounded ${dados.gastoHab > dados.medianaGasto ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${(dados.gastoHab / maxG) * 100}%` }} /></div>
          <div className="mt-0.5 text-[11px] text-slate-400">mediana dos pares: {fmtBRLCompact(dados.medianaGasto)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500">Resultado APS (média Previne)</div>
          <div className="text-xl font-bold tabular-nums text-slate-800">{dados.resultado != null ? `${dados.resultado.toFixed(0)}%` : "—"}</div>
          {dados.medianaResultado != null && <><div className="mt-1 h-2 w-full rounded bg-slate-100"><div className={`h-2 rounded ${(dados.resultado || 0) >= dados.medianaResultado ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${((dados.resultado || 0) / maxR) * 100}%` }} /></div>
          <div className="mt-0.5 text-[11px] text-slate-400">mediana dos pares: {dados.medianaResultado.toFixed(0)}%</div></>}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Gasto/hab = despesa empenhada em Saúde ÷ população. Resultado = média dos indicadores do Previne Brasil. Comparação por faixa populacional. Referência, não meta. Fontes: SICONFI + Previne/SISAB.</p>
    </section>
  );
}
