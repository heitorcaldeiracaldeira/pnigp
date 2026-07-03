// ACOMPANHAMENTO por FUNÇÃO — orçado (dotação) × realizado (empenhado) até o bimestre vigente, por função.
// Mostra ONDE o município está adiantado/atrasado na execução no ano corrente. Fonte: RREO Anexo 02 (parcial).
import { BarChart3 } from "lucide-react";
import type { AcompanhamentoFuncaoSC } from "@/lib/queries";

const mi = (n: number) => (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const corExec = (e: number, ritmo: number) => (e >= ritmo + 12 ? "#d97706" : e >= ritmo - 12 ? "#16a34a" : "#dc2626");

export function AcompanhamentoFuncao({ data, nome }: { data: NonNullable<AcompanhamentoFuncaoSC>; nome: string }) {
  const execGlobal = data.totalDotacao ? Math.round((data.totalEmpenhado / data.totalDotacao) * 1000) / 10 : 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><BarChart3 className="h-4 w-4 text-teal-600" /> Orçado × realizado por função · {data.ano} (até o {data.bimestre}º bim.)</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Execução global {execGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Quanto de cada função já foi <b>empenhado</b> (realizado) frente à <b>dotação</b> (orçado), até abril. A barra cinza marca o <b>ritmo esperado</b> ({data.ritmoEsperado}% = {data.mesAte}/12 meses): acima dela = execução adiantada; bem abaixo = função represada.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5">Função</th><th className="text-right">Orçado (R$ mi)</th><th className="text-right">Realizado</th><th className="w-40">Execução</th>
          </tr></thead>
          <tbody>
            {data.itens.map((f) => (
              <tr key={f.funcao} className="border-b border-slate-50">
                <td className="py-1.5 font-medium text-slate-700">{f.funcao}</td>
                <td className="text-right tabular-nums text-slate-500">{mi(f.dotacao)}</td>
                <td className="text-right tabular-nums text-slate-700">{mi(f.empenhado)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.execucao)}%`, backgroundColor: corExec(f.execucao, data.ritmoEsperado) }} />
                      <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: `${Math.min(100, data.ritmoEsperado)}%` }} />
                    </div>
                    <span className="w-9 text-right text-[11px] tabular-nums text-slate-500">{f.execucao.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 text-slate-800">TOTAL</td>
              <td className="text-right tabular-nums text-slate-700">{mi(data.totalDotacao)}</td>
              <td className="text-right tabular-nums text-slate-700">{mi(data.totalEmpenhado)}</td>
              <td className="pl-2 text-[11px] tabular-nums text-slate-500">{execGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% empenhado</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONFI — RREO Anexo 02 do bimestre vigente (dotação atualizada × despesas empenhadas até o bimestre, exceto intra-orçamentárias). Reconcilia com o total do município (a Reserva de Contingência, por não ser função, fica à parte).</p>
    </section>
  );
}
