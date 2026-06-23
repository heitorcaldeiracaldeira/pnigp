import type { ComprasExtra } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact } from "@/lib/ui";

// Curva ABC (concentração do gasto) + dispersão de preço entre municípios (onde o "preço único" mais falha). Tom didático.
export function ComprasExtraCard({ dados, nome }: { dados: ComprasExtra; nome: string }) {
  if (!dados || (!dados.abc && !dados.dispersao.length)) return null;
  const a = dados.abc;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800">📊 Curva ABC e dispersão de preço</h3>
      <p className="text-sm text-slate-500">Onde concentrar o esforço de compra de {nome}: poucos itens que somam a maior parte do gasto, e itens cujo preço mais varia em SC (onde pesquisar bem rende mais).</p>

      {a && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Curva ABC — {a.totalItens.toLocaleString("pt-BR")} itens · {fmtBRLCompact(a.totalValor)}</div>
          <div className="flex h-7 w-full overflow-hidden rounded-lg text-[10px] font-semibold text-white">
            <div className="flex items-center justify-center bg-rose-500" style={{ width: `${Math.max(6, a.a.pct)}%` }} title="Classe A">A: {a.a.n} itens</div>
            <div className="flex items-center justify-center bg-amber-400" style={{ width: `${Math.max(6, a.b.pct)}%` }} title="Classe B">B: {a.b.n}</div>
            <div className="flex items-center justify-center bg-slate-300 text-slate-600" style={{ width: `${Math.max(6, a.c.pct)}%` }} title="Classe C">C: {a.c.n}</div>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-600">🎯 <b>{a.a.pct}% dos itens</b> (classe A, {a.a.n}) concentram <b>80% do gasto</b> — é onde negociar/pesquisar preço rende mais. Classe B = próximos 15% · Classe C = cauda longa ({a.c.n} itens, 5% do valor).</p>
        </div>
      )}

      {dados.dispersao.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Itens com maior dispersão de preço em SC (oportunidade de pesquisa)</div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2 font-medium">Item (unidade)</th><th className="p-2 text-right font-medium">+ barato (P25)</th><th className="p-2 text-right font-medium">Mediana</th><th className="p-2 text-right font-medium">+ caro (P75)</th><th className="p-2 text-right font-medium">Variação</th></tr></thead>
              <tbody>
                {dados.dispersao.map((d, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-2 text-slate-700">{d.item.slice(0, 38).toLowerCase()} <span className="text-slate-400">({d.unidade})</span></td>
                    <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBRL(d.p25)}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">{fmtBRL(d.mediana)}</td>
                    <td className="p-2 text-right tabular-nums text-rose-600">{fmtBRL(d.p75)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-slate-800">{d.ratio}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Quanto maior a variação (P75 ÷ P25), mais o preço do item difere entre municípios de SC — e mais uma boa pesquisa de preço/negociação economiza. Itens comprados por {nome} com referência em ≥5 municípios.</p>
        </div>
      )}
    </section>
  );
}
