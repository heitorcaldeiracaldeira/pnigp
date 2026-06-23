import type { SazonalidadePreco } from "@/lib/queries";

// Melhor mês de compra por grupo de produtos (SC). Índice relativo: 100 = preço típico; <100 = mais barato que o normal.
const MES = ["", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MESL = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function cor(idx: number) {
  if (idx <= 90) return "bg-emerald-500 text-white";
  if (idx <= 96) return "bg-emerald-200 text-emerald-900";
  if (idx < 104) return "bg-slate-100 text-slate-500";
  if (idx < 112) return "bg-rose-200 text-rose-900";
  return "bg-rose-500 text-white";
}

export function SazonalidadePreco({ dados }: { dados: SazonalidadePreco }) {
  if (!dados || !dados.length) return null;
  const comPadrao = dados.filter((c) => c.melhorIndice <= 96);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">📆 Melhor mês de compra — por grupo de produtos</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">SC · PNCP</span>
      </div>
      <p className="text-sm text-slate-500">Quando, no ano, cada grupo costuma ser <b>mais barato</b> em Santa Catarina. Índice <b>100 = preço típico</b>; <span className="text-emerald-700 font-medium">verde = abaixo</span>, <span className="text-rose-600 font-medium">vermelho = acima</span>. Use para planejar o calendário de licitações e atas.</p>

      {comPadrao.length > 0 && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-slate-700">💡 <b>Padrões mais claros:</b> {comPadrao.map((c) => `${c.categoria.toLowerCase()} → ${MESL[c.melhorMes]} (${100 - c.melhorIndice}% abaixo)`).join(" · ")}.</p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-center text-[11px]">
          <thead>
            <tr className="text-slate-400"><th className="p-1 text-left font-medium">Grupo</th>{MES.slice(1).map((m, i) => <th key={i} className="p-1 font-medium">{m}</th>)}<th className="p-1 font-medium">melhor</th></tr>
          </thead>
          <tbody>
            {dados.map((c) => (
              <tr key={c.categoria}>
                <td className="p-1 text-left font-medium text-slate-700">{c.categoria}</td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => { const m = c.meses.find((x) => x.mes === mes); const best = mes === c.melhorMes && c.melhorIndice <= 96; return (
                  <td key={mes} className="p-0.5">
                    {m ? <span className={`flex h-6 items-center justify-center rounded ${cor(m.indice)} ${best ? "ring-2 ring-emerald-600" : ""}`} title={`${MESL[mes]}: índice ${m.indice} (${m.n} compras)`}>{m.indice}</span> : <span className="flex h-6 items-center justify-center rounded bg-slate-50 text-slate-300">—</span>}
                  </td>
                ); })}
                <td className={`p-1 font-semibold ${c.melhorIndice <= 96 ? "text-emerald-700" : "text-slate-400"}`}>{c.melhorIndice <= 96 ? MESL[c.melhorMes].slice(0, 3) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Metodologia: para cada item canônico (descrição + unidade), o preço do mês é dividido pela mediana anual do próprio item (normaliza itens diferentes); o índice é a média por grupo/mês. Base: PNCP, itens com data de publicação do processo. Grupos com índice sempre ~100 não têm sazonalidade de preço marcante.</p>
    </section>
  );
}
