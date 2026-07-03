// MSC ANCORADA AO RREO — despesa empenhada por natureza (pessoal/custeio/investimento) e por fonte (livres×vinculados).
// A forma vem da MSC (mais granular); o total é ancorado ao RREO oficial → reconcilia por construção. Selo de confiança.
import { PieChart, BadgeCheck } from "lucide-react";
import type { MscDespesaSC } from "@/lib/queries";

const mi = (n: number) => `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
const CORES_NAT: Record<string, string> = { "Pessoal e Encargos": "#dc2626", "Outras Despesas Correntes": "#d97706", "Investimentos": "#16a34a", "Inversões Financeiras": "#0891b2", "Amortização da Dívida": "#7c3aed", "Juros e Encargos da Dívida": "#9333ea" };

export function MscDespesa({ data, nome }: { data: NonNullable<MscDespesaSC>; nome: string }) {
  const linha = (item: { categoria: string; valor: number; pct: number }, cor: string) => (
    <div key={item.categoria}>
      <div className="flex justify-between text-xs"><span className="text-slate-600">{item.categoria}</span><span className="font-semibold tabular-nums text-slate-700">{mi(item.valor)} · {item.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></div>
      <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, item.pct)}%`, backgroundColor: cor }} /></div>
    </div>
  );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><PieChart className="h-4 w-4 text-indigo-600" /> Despesa por natureza e fonte · {data.ano}</h3>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> conciliado com o RREO</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Detalhe que o RREO por função não mostra: <b>em que</b> (natureza) e <b>com que recurso</b> (fonte) o município empenhou. A forma vem da MSC; o total é ancorado ao RREO oficial ({mi(data.totalRreo)}) — por isso bate exatamente.</p>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Por natureza da despesa</div>
          <div className="space-y-2">{data.natureza.map((n) => linha(n, CORES_NAT[n.categoria] || "#64748b"))}</div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Por fonte de recursos</div>
          <div className="space-y-2">{data.fonte.map((f) => linha(f, f.categoria.includes("livres") ? "#0ea5e9" : "#f59e0b"))}</div>
          <p className="mt-3 text-[11px] text-slate-400">Recursos <b>livres</b> = aplicação discricionária; <b>vinculados</b> = destinação legal obrigatória (saúde, educação, FUNDEB, convênios). Quanto maior a fatia vinculada, menor a margem de manobra do gestor.</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Fonte: SICONFI — MSC (Matriz de Saldos Contábeis, conta de Crédito Empenhado) para a distribuição, ancorada ao total de despesas empenhadas do RREO. Reconciliação por construção (∑ = total do RREO). Natureza pelo grupo da despesa; fonte agregada em livres × vinculados.</p>
    </section>
  );
}
