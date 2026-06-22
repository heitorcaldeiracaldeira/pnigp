import type { OtimizadorReceitaSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Otimizador de Receitas Próprias — quanto o município poderia arrecadar a mais (IPTU/ISS/ITBI) vs pares de mesmo
// porte, com a ação de maior alavanca. Tom neutro/didático. Fonte: SICONFI (receitas) + IBGE (população).
export function OtimizadorReceita({ dados, nome }: { dados: OtimizadorReceitaSC; nome: string }) {
  if (!dados) return null;
  const max = Math.max(1, ...dados.tributos.map((t) => Math.max(t.pc, t.medianaPc)));
  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">💡 Otimizador de Receitas Próprias</h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">IPTU · ISS · ITBI</span>
      </div>
      <p className="text-sm text-slate-500">Quanto {nome} poderia arrecadar a mais com tributos próprios, comparado a municípios do mesmo porte — <b>sem depender de repasse</b>, fortalecendo a autonomia. Base {dados.ano} (SICONFI) · {dados.nPares} pares.</p>

      {dados.potencialTotal > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="text-[11px] text-slate-600">Potencial total estimado (até a mediana dos pares)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-emerald-700">+{fmtBRLCompact(dados.potencialTotal)}<span className="text-sm font-normal text-slate-500">/ano</span></div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {dados.tributos.map((t) => (
          <div key={t.tributo} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">{t.tributo}</span>
              <span className="text-[12px] text-slate-500">arrecadou <b className="text-slate-700">{fmtBRLCompact(t.valor)}</b> em {dados.ano}</span>
            </div>
            {/* per capita: município vs mediana dos pares */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-28 shrink-0 text-slate-500">{nome}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-2.5 rounded ${t.abaixo ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${(t.pc / max) * 100}%` }} /></div>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-700">R$ {t.pc.toFixed(0)}/hab</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-28 shrink-0 text-slate-500">mediana dos pares</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-2.5 rounded bg-slate-400" style={{ width: `${(t.medianaPc / max) * 100}%` }} /></div>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-500">R$ {t.medianaPc.toFixed(0)}/hab</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {t.potencial > 1000
                ? <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700">Potencial: +{fmtBRLCompact(t.potencial)}/ano</span>
                : <span className="rounded-lg bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-500">No nível dos pares (ou acima) ✓</span>}
              <span className="text-[11px] text-slate-400">acima de {t.posicaoPct}% dos pares</span>
            </div>
            {t.potencial > 1000 && <p className="mt-1.5 text-[12px] text-slate-600">→ <b>Como capturar:</b> {t.acao}</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Metodologia: arrecadação por habitante comparada à mediana dos municípios de mesma faixa populacional; o potencial é a diferença até a mediana × população. É uma referência de oportunidade, não meta — depende da base econômica local. Fonte: SICONFI/STN + IBGE.</p>
    </section>
  );
}
