import type { ComprasCategorias } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";
import { MetodologiaItens } from "@/components/metodologia-itens";

// Gasto efetivado por categoria oficial CATMAT/CATSER — para onde vai o dinheiro, no eixo do catálogo federal.
// Tom neutro/didático. Read-only: apenas leitura das compras cruzada com a classificação.
const confChip = (c: string) =>
  c === "alta" ? "bg-emerald-100 text-emerald-700" : c === "media" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
const confLabel = (c: string) => (c === "alta" ? "alta" : c === "media" ? "média" : "indicativa");

export function ComprasCategorias({ dados, nome }: { dados: ComprasCategorias; nome: string }) {
  if (!dados || dados.categorias.length === 0) return null;
  const lider = dados.categorias[0];
  const maxPct = Math.max(...dados.categorias.map((c) => c.pct), 1);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🗂️ Gasto por categoria — catálogo oficial CATMAT/CATSER</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">catálogo federal · Compras.gov.br</span>
      </div>
      <p className="text-sm text-slate-500">
        Para onde vai o dinheiro de {nome}, agrupado pela <b>categoria oficial do governo federal</b> (CATMAT para materiais, CATSER para serviços) — o mesmo eixo que permite comparar com outros estados. Cada item de compra é classificado por similaridade de texto, com <b>faixa de confiança</b>.
      </p>

      {/* KPIs */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Gasto classificado</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{dados.pctClassificado}%</div>
          <div className="text-[11px] text-slate-500">{fmtBRLCompact(dados.classificado)} de {fmtBRLCompact(dados.totalEfetivado)} efetivado</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Categorias distintas</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{dados.nClasses}</div>
          <div className="text-[11px] text-slate-500">classes CATMAT/CATSER com gasto</div>
        </div>
        <div className="col-span-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3 lg:col-span-1">
          <div className="text-[11px] uppercase tracking-wide text-teal-700">Maior categoria</div>
          <div className="truncate font-display text-base font-bold text-slate-800" title={lider.classe}>{lider.classe.toLowerCase()}</div>
          <div className="text-[11px] text-slate-500">{fmtBRLCompact(lider.valor)} · {lider.pct}% do classificado</div>
        </div>
      </div>

      {/* Tabela: top categorias por valor */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[600px] text-xs">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-2 font-medium">Categoria (classe oficial)</th>
            <th className="p-2 font-medium">Tipo</th>
            <th className="p-2 text-right font-medium">Gasto</th>
            <th className="p-2 font-medium">% do classificado</th>
            <th className="p-2 text-center font-medium">Confiança</th>
          </tr></thead>
          <tbody>
            {dados.categorias.map((c, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 align-middle">
                <td className="p-2 text-slate-700">{c.classe.toLowerCase()}</td>
                <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.tipo === "Material" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>{c.tipo}</span></td>
                <td className="p-2 text-right tabular-nums font-medium text-slate-800">{fmtBRLCompact(c.valor)}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-2 rounded bg-teal-400" style={{ width: `${Math.max(3, (c.pct / maxPct) * 100)}%` }} /></div>
                    <span className="w-9 shrink-0 text-right tabular-nums text-slate-500">{c.pct}%</span>
                  </div>
                </td>
                <td className="p-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${confChip(c.conf)}`}>{confLabel(c.conf)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Percentual sobre o gasto <b>classificado</b> (efetivado). {100 - dados.pctClassificado > 0 ? <>Os <b>{100 - dados.pctClassificado}%</b> restantes ficam sem classificação (descritivo livre que não atingiu o mínimo) — não forçados a uma categoria.</> : null}
      </p>

      <MetodologiaItens />
    </section>
  );
}
