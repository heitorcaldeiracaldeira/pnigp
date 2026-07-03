// ACOMPANHAMENTO intra-anual — execução do orçamento até o bimestre vigente vs ritmo esperado (proporcional).
// Dá ao gestor o "como estou indo" no meio do exercício: receita no ritmo? despesa adiantada?
import { Gauge } from "lucide-react";
import type { AcompanhamentoSC } from "@/lib/queries";

const mi = (n: number) => `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

export function Acompanhamento({ data, nome }: { data: NonNullable<AcompanhamentoSC>; nome: string }) {
  const recRitmo = data.receitaPct - data.ritmoEsperado; // + = adiantado; - = atrasado (risco de frustração)
  const barra = (pct: number, cor: string) => (
    <div className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cor }} />
      <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: `${Math.min(100, data.ritmoEsperado)}%` }} title={`ritmo esperado ${data.ritmoEsperado}%`} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Gauge className="h-4 w-4 text-teal-600" /> Acompanhamento da execução — {nome} · {data.ano}</div>
        <p className="mt-1 text-sm text-slate-600">Como o município está indo no meio do exercício: execução <b>até o {data.bimestre}º bimestre</b> (mês {data.mesAte}) contra o ritmo proporcional esperado (<b>{data.ritmoEsperado}%</b> do ano). Fonte: RREO/SICONFI, atualizado a cada bimestre.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700">Receita arrecadada</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-sky-600">{data.receitaPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            <span className="text-xs text-slate-500">da previsão anual</span>
          </div>
          {barra(data.receitaPct, "#0ea5e9")}
          <div className="mt-2 text-xs text-slate-600">{mi(data.receitaRealizada)} de {mi(data.receitaPrevista)} previstos</div>
          <div className={`mt-1 rounded-lg px-2 py-1 text-xs font-semibold ${recRitmo >= -2 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {recRitmo >= 2 ? `▲ ${recRitmo.toFixed(1)} p.p. acima do ritmo` : recRitmo <= -2 ? `▼ ${Math.abs(recRitmo).toFixed(1)} p.p. abaixo do ritmo — risco de frustração de receita` : "no ritmo esperado"}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Média de SC: {data.receitaUfMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700">Despesa empenhada</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-violet-600">{data.despesaPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            <span className="text-xs text-slate-500">da dotação atualizada</span>
          </div>
          {barra(data.despesaPct, "#7c3aed")}
          <div className="mt-2 text-xs text-slate-600">{mi(data.despesaEmpenhada)} de {mi(data.despesaDotacao)} orçados</div>
          <div className={`mt-1 rounded-lg px-2 py-1 text-xs font-semibold ${data.despesaPct - data.ritmoEsperado <= 10 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {data.despesaPct - data.ritmoEsperado > 10 ? "empenho adiantado — atenção ao fôlego do 2º semestre" : "empenho no ritmo"}
          </div>
        </section>
      </div>

      <p className="text-[11px] text-slate-400">A linha vertical nas barras marca o <b>ritmo esperado</b> ({data.ritmoEsperado}% = {data.mesAte}/12 meses). Receita abaixo da linha = sinal de frustração de receita; despesa muito acima = empenho concentrado no início. Fonte: SICONFI — RREO Anexos 01 e 02 do bimestre vigente.</p>
    </div>
  );
}
