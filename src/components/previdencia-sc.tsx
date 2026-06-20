import { Database, PiggyBank, TrendingDown, TrendingUp, Users } from "lucide-react";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import type { RppsSC } from "@/lib/queries";

const brl = (x: number) => (Math.abs(x) >= 1e9 ? "R$ " + (x / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi" : "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi");
const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function PrevidenciaSC({ data }: { data: NonNullable<RppsSC> }) {
  const d = data;
  const deficit = d.resultado < 0;
  const contrib = d.contribSegurados + d.contribPatronais;
  const benef = d.aposentadorias + d.pensoes;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><PiggyBank className="h-4 w-4 text-teal-600" /> Previdência própria (RPPS) — RREO Anexo 04 · {d.ano}</div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${deficit ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{deficit ? "Déficit no exercício" : "Superávit no exercício"}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">O fundo de aposentadorias e pensões dos servidores. Receitas previdenciárias × despesas com benefícios — déficit recorrente vira aporte do tesouro municipal.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><TrendingUp className="h-3.5 w-3.5" /> Receitas previdenciárias</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{brl(d.receita)}</div>
          <div className="text-[11px] text-slate-500">contribuições + patrimonial</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><TrendingDown className="h-3.5 w-3.5" /> Despesas (benefícios)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{brl(d.despesa)}</div>
          <div className="text-[11px] text-slate-500">aposentadorias + pensões</div>
        </div>
        <div className={`rounded-xl border p-4 ${deficit ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="text-xs text-slate-600">Resultado previdenciário</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${deficit ? "text-rose-700" : "text-emerald-700"}`}>{d.resultado >= 0 ? "+" : "−"}{brl(d.resultado)}</div>
          <div className="text-[11px] text-slate-500">{deficit ? "coberto por aporte do tesouro" : "fundo superavitário"}</div>
        </div>
      </div>

      {/* Cobertura: contribuições cobrem quanto dos benefícios */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-1.5 font-semibold text-slate-700"><Users className="h-4 w-4 text-teal-600" /> Contribuições cobrem dos benefícios</span><span className={`font-display text-lg font-bold tabular-nums ${d.coberturaPct >= 100 ? "text-emerald-700" : d.coberturaPct >= 70 ? "text-amber-700" : "text-rose-700"}`}>{n1(d.coberturaPct)}%</span></div>
        <div className="h-2.5 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${d.coberturaPct >= 100 ? "bg-emerald-500" : d.coberturaPct >= 70 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, d.coberturaPct)}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-slate-500">Contribuições (segurados {brl(d.contribSegurados)} + patronais {brl(d.contribPatronais)}) = {brl(contrib)} · Benefícios = {brl(benef)}. Abaixo de 100% indica dependência crescente de aporte.</p>
      </div>

      {d.serie.filter((s) => s.resultado !== 0).length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">Resultado previdenciário ao longo do tempo</h3>
          <p className="mb-2 text-xs text-slate-500">Déficit recorrente = bomba fiscal futura (aporte cresce)</p>
          <LinhasFinanceiras data={d.serie as unknown as Record<string, number>[]} linhas={[{ key: "resultado", label: "Resultado RPPS", cor: deficit ? "#e11d48" : "#0f766e" }]} />
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fonte: SICONFI RREO Anexo 04 (RPPS). Resultado = receitas − despesas previdenciárias do fundo. Déficit atuarial (projeção de longo prazo) está no CADPREV/MPS — complemento futuro.
      </p>
    </div>
  );
}
