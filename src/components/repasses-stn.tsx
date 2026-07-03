// Repasses da União por município — matriz MENSAL + total anual por repasse + soma de todos (STN/Tesouro).
// Comportamento dos repasses (timing/sazonalidade) pressiona os mínimos de saúde (15%) e educação (25%).
import { Landmark } from "lucide-react";
import type { TransferenciasStnSC } from "@/lib/queries";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : n ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—");
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function RepassesStn({ data, nome }: { data: NonNullable<TransferenciasStnSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Landmark className="h-4 w-4 text-indigo-600" /> Repasses da União por mês — {nome} · {data.ano}</h3>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Total {brl(data.totalAnual)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Cada transferência constitucional/legal mês a mês, com o total do ano e a soma de todos. O <b>timing</b> dos repasses afeta o cumprimento dos mínimos de <b>saúde (15%)</b> e <b>educação (25%)</b>. Fonte oficial: STN/Tesouro Transparente.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-400">
              <th className="py-1.5 text-left">Repasse</th>
              {MES.map((m) => <th key={m} className="px-1">{m}</th>)}
              <th className="px-1 text-indigo-600">Anual</th>
            </tr>
          </thead>
          <tbody>
            {data.itens.map((it) => (
              <tr key={it.item} className="border-b border-slate-50">
                <td className="py-1.5 text-left font-medium text-slate-700">{it.item}{it.compoeFundeb && <span className="text-amber-500" title="compõe o FUNDEB (dedução de 20%)">*</span>}</td>
                {it.meses.map((v, i) => <td key={i} className="px-1 tabular-nums text-slate-500">{compact(v)}</td>)}
                <td className="px-1 font-bold tabular-nums text-slate-800">{compact(it.anual)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="py-1.5 text-left text-slate-800">TOTAL</td>
              {data.totalMeses.map((v, i) => <td key={i} className="px-1 tabular-nums text-slate-700">{compact(v)}</td>)}
              <td className="px-1 tabular-nums text-indigo-700">{compact(data.totalAnual)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <b className="text-amber-600">* Sobre o FUNDEB:</b> FPM, ITR e Lei Kandir (LC 87/96) — assim como ICMS e IPVA, estaduais e não exibidos aqui — <b>compõem o FUNDEB</b>: sofrem dedução constitucional de <b>20%</b>, que é redistribuída pelo fundo. Os valores acima são os repasses <b>brutos</b> (antes da dedução); a linha <b>FUNDEB</b> é a cota que o município <b>recebe de volta</b> (pode ser maior ou menor que o que contribuiu). <b>CIDE-Combustíveis, FEX, IOF-Ouro e LC 176/2020 NÃO compõem o FUNDEB.</b> Portanto o TOTAL é bruto — a receita efetivamente disponível = (repasses − 20% dos que compõem o FUNDEB + FUNDEB recebido).
      </p>
      <p className="mt-1 text-[11px] text-slate-400">Fonte: STN — Transferências Obrigatórias da União por Município (Tesouro Transparente). Soma dos repasses mensais; anos disponíveis: {data.anosDisponiveis[data.anosDisponiveis.length - 1]}–{data.anosDisponiveis[0]}.</p>
    </section>
  );
}
