import { ArrowDownRight, ArrowUpRight, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { BarComposicao } from "@/components/bar-composicao";
import { despesaCategoriaArvore, despesaFuncaoArvore, receitaClassificacao } from "@/lib/orcamento";
import type { Financas } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact } from "@/lib/ui";

export function FinancasPanel({
  financas,
  anterior,
  populacao,
  seed = "",
  tipo = "M",
}: {
  financas: Financas;
  anterior: Financas | null;
  populacao: number;
  seed?: string;
  tipo?: "M" | "E";
}) {
  const f = financas;
  const resultado = f.receita_total - f.despesa_total;
  const superavit = resultado >= 0;
  const rpc = f.receita_total / populacao;
  const deltaRec = anterior && anterior.receita_total
    ? ((f.receita_total - anterior.receita_total) / anterior.receita_total) * 100
    : null;

  const receitaRaizes = receitaClassificacao(f, seed, tipo);
  const categoriaRaizes = despesaCategoriaArvore(f, seed);
  const funcaoRaizes = despesaFuncaoArvore(f, seed);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Wallet className="h-4 w-4 text-teal-600" /> Receita total
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{fmtBRLCompact(f.receita_total)}</div>
          {deltaRec != null && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${deltaRec >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {deltaRec >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(deltaRec).toFixed(1)}% vs. 2023
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Landmark className="h-4 w-4 text-indigo-600" /> Despesa total
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{fmtBRLCompact(f.despesa_total)}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${superavit ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {superavit ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />}
            Resultado do exercício
          </div>
          <div className={`mt-1 text-2xl font-bold ${superavit ? "text-emerald-700" : "text-rose-700"}`}>
            {fmtBRLCompact(resultado)}
          </div>
          <div className="text-xs font-medium text-slate-500">{superavit ? "Superávit" : "Déficit"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Wallet className="h-4 w-4 text-slate-500" /> Receita por habitante
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{fmtBRL(rpc)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Receita por origem */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="De onde vem o dinheiro">
          <h3 className="font-semibold text-slate-800">De onde vem o dinheiro</h3>
          <p className="mb-4 text-xs text-slate-500">
            Composição da receita por origem · <span className="font-medium text-teal-700">clique para abrir espécie e rubrica</span>
          </p>
          <BarComposicao raizes={receitaRaizes} total={f.receita_total} />
        </section>

        {/* Despesa por categoria */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Como o dinheiro é gasto">
          <h3 className="font-semibold text-slate-800">Como o dinheiro é gasto</h3>
          <p className="mb-4 text-xs text-slate-500">
            Despesa por categoria econômica · <span className="font-medium text-teal-700">clique para abrir os elementos</span>
          </p>
          <BarComposicao raizes={categoriaRaizes} total={f.despesa_total} />
        </section>
      </div>

      {/* Despesa por função (com drill: função → ação → elemento) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Para onde vai o dinheiro">
        <h3 className="font-semibold text-slate-800">Para onde vai o dinheiro</h3>
        <p className="mb-4 text-xs text-slate-500">
          Despesa por área (função) · <span className="font-medium text-teal-700">clique para abrir ação e elemento de despesa</span>
        </p>
        <BarComposicao raizes={funcaoRaizes} total={f.despesa_total} />
      </section>

      <p className="text-center text-xs text-slate-500">
        Fonte: SICONFI/FINBRA · valores do exercício de 2024 · dados simulados para demonstração
      </p>
    </div>
  );
}
