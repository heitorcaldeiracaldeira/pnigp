// PPA por programa — detalhamento da despesa por FUNÇÃO → SUBFUNÇÃO (orçado×executado), o nível programático
// que o TCE-SC exige (metas físicas/financeiras por programa). Base: RREO Anexo 02 (SICONFI), último ano completo.
import { Layers } from "lucide-react";
import type { PpaProgramaSC } from "@/lib/queries";

const mi = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`);
const corExec = (e: number) => (e >= 90 ? "#16a34a" : e >= 70 ? "#d97706" : "#dc2626");

export function PpaPrograma({ data, nome }: { data: NonNullable<PpaProgramaSC>; nome: string }) {
  const execGlobal = data.totalDotacao ? Math.round((data.totalEmpenhado / data.totalDotacao) * 1000) / 10 : 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Layers className="h-4 w-4 text-indigo-600" /> PPA por programa — despesa por função › subfunção · {data.ano}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Execução global {execGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">O nível programático que o TCE-SC pede: cada função detalhada em subfunções, com <b>orçado (dotação) × executado (empenhado)</b> e a taxa de execução — base para metas físicas e financeiras por programa.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-xs">
          <thead><tr className="border-b border-slate-200 text-[10px] uppercase text-slate-400">
            <th className="py-1.5 text-left">Função › Subfunção</th><th className="px-2">Orçado (R$ mi)</th><th className="px-2">Executado</th><th className="px-2">Execução</th>
          </tr></thead>
          <tbody>
            {data.funcoes.map((f) => (
              <FuncaoBloco key={f.funcao} f={f} />
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 text-left text-slate-800">TOTAL</td>
              <td className="px-2 tabular-nums text-slate-700">{mi(data.totalDotacao)}</td>
              <td className="px-2 tabular-nums text-slate-700">{mi(data.totalEmpenhado)}</td>
              <td className="px-2 tabular-nums" style={{ color: corExec(execGlobal) }}>{execGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONFI — RREO Anexo 02 (despesa por função/subfunção, dotação atualizada × empenhada), último exercício completo. Próximo nível (programa/ação e metas físicas) está no e-Sfinge/TCE-SC.</p>
    </section>
  );
}

function FuncaoBloco({ f }: { f: NonNullable<PpaProgramaSC>["funcoes"][number] }) {
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/60 font-semibold">
        <td className="py-1.5 text-left text-slate-800">{f.funcao}</td>
        <td className="px-2 tabular-nums text-slate-700">{mi(f.dotacao)}</td>
        <td className="px-2 tabular-nums text-slate-700">{mi(f.empenhado)}</td>
        <td className="px-2 tabular-nums" style={{ color: corExec(f.execucao) }}>{f.execucao.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</td>
      </tr>
      {f.subfuncoes.map((s) => (
        <tr key={s.subfuncao} className="border-b border-slate-50 text-slate-500">
          <td className="py-1 pl-4 text-left">↳ {s.subfuncao}</td>
          <td className="px-2 tabular-nums">{mi(s.dotacao)}</td>
          <td className="px-2 tabular-nums">{mi(s.empenhado)}</td>
          <td className="px-2 tabular-nums" style={{ color: corExec(s.execucao) }}>{s.execucao.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</td>
        </tr>
      ))}
    </>
  );
}
