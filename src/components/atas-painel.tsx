import type { AtasSC } from "@/lib/queries";
import { fmtBRL, fmtData } from "@/lib/ui";

// Atas de Registro de Preço — visão própria (preço registrado + quantidade máxima; gasto real = empenhos contra a ata).
export function AtasPainel({ dados, nome }: { dados: AtasSC; nome: string }) {
  if (!dados) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800">📋 Atas de Registro de Preço</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">PNCP</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">A ata registra um <b>preço unitário</b> e uma <b>quantidade máxima</b> por um período — o gasto real são os empenhos contra a ata. Por isso é separada das compras diretas (não infla a economicidade). {nome}.</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi v={dados.total.toLocaleString("pt-BR")} l="atas (total)" />
        <Kpi v={dados.vigentes.toLocaleString("pt-BR")} l="vigentes" cor="text-emerald-600" />
        <Kpi v={dados.aVencer90.toLocaleString("pt-BR")} l="a vencer (≤90 dias)" cor={dados.aVencer90 > 0 ? "text-amber-600" : undefined} />
        <Kpi v={dados.vencidas.toLocaleString("pt-BR")} l="vencidas" />
        <Kpi v={dados.canceladas.toLocaleString("pt-BR")} l="canceladas" cor={dados.canceladas > 0 ? "text-rose-600" : undefined} />
      </div>

      {dados.lista.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-slate-700">Atas recentes — itens e preços registrados</h4>
          <div className="mt-2 space-y-2">
            {dados.lista.map((a, i) => (
              <details key={i} className="rounded-xl border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800"><span className="line-clamp-1 inline">{a.objeto}</span></span>
                  <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{fmtData(a.vigInicio)} → {fmtData(a.vigFim)}</span>
                    {a.dias != null && a.dias >= 0 && a.dias <= 90 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">vence em {a.dias}d</span>}
                    {a.dias != null && a.dias < 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">vencida</span>}
                  </span>
                </summary>
                {a.fornecedor && <div className="mt-1 text-[11px] text-slate-400">{a.fornecedor}</div>}
                {a.itens.length > 0 ? (
                  <table className="mt-2 w-full text-[13px]">
                    <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="p-1.5 font-medium">Item registrado</th><th className="p-1.5 text-right font-medium">Qtd máx.</th><th className="p-1.5 text-right font-medium">Estimado</th><th className="p-1.5 text-right font-medium">Registrado</th><th className="p-1.5 text-right font-medium">Economia</th></tr></thead>
                    <tbody>
                      {a.itens.map((it, j) => {
                        const ok = it.est != null && it.preco != null && it.est > 0 && it.preco <= it.est;
                        const eco = ok ? ((it.est! - it.preco!) / it.est!) * 100 : null;
                        return (
                          <tr key={j} className="border-b border-slate-50 align-top">
                            <td className="p-1.5 text-slate-700"><span className="line-clamp-2">{it.descricao}</span></td>
                            <td className="p-1.5 text-right tabular-nums text-slate-500">{it.quantidade.toLocaleString("pt-BR")}</td>
                            <td className="p-1.5 text-right tabular-nums text-slate-400">{it.est != null ? fmtBRL(it.est) : "—"}</td>
                            <td className="p-1.5 text-right tabular-nums font-semibold text-slate-800">{it.preco != null ? fmtBRL(it.preco) : "—"}</td>
                            <td className="p-1.5 text-right tabular-nums">{eco != null ? <span className="text-emerald-600">{eco.toFixed(0)}%</span> : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <div className="mt-2 text-xs text-slate-400">Itens do processo desta ata ainda não coletados.</div>}
              </details>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Quantidade = máxima registrada (teto), não o efetivamente comprado. Economia = preço estimado → registrado por unidade. Fonte: PNCP (/atas + itens do processo).</p>
    </section>
  );
}
function Kpi({ v, l, cor }: { v: string; l: string; cor?: string }) {
  return <div className="rounded-xl border border-slate-200 p-3"><div className={`text-xl font-bold tabular-nums ${cor || "text-slate-800"}`}>{v}</div><div className="text-[11px] text-slate-500">{l}</div></div>;
}
