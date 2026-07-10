// COMPRAS POR PREÇO UNITÁRIO — itens em que o município pagou acima da mediana de SC (e, quando há, da referência
// NACIONAL) para o mesmo item. Tom neutro/didático: compara o preço UNITÁRIO com dois benchmarks; economia = quanto
// pouparia no preço mediano de SC. O nacional (Painel de Preços, forma avulsa) e o CV (confiabilidade) enriquecem a leitura.
import { Tag } from "lucide-react";
import type { SobreprecoSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const brlU = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SobreprecoCompras({ data, nome }: { data: NonNullable<SobreprecoSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Tag className="h-4 w-4 text-amber-600" /> Compras acima da referência — preço unitário</h3>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{brl(data.totalEconomia)} de economia potencial</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Itens em que {nome} pagou um <b>preço unitário acima da mediana</b> dos demais municípios de SC para o <b>mesmo item</b> — em <b>{data.nItens}</b> itens. A economia estimada é quanto se pouparia comprando ao preço mediano. É um ponto de partida para renegociação, não um juízo sobre a compra.</p>
      {data.nComNacional > 0 && (
        <p className="mt-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-[12px] text-slate-600"><b className="text-indigo-700">Referência nacional:</b> {data.nComNacional} desses itens têm preço comparável no <b>Painel de Preços do Brasil</b> — e em <b>{data.nAcimaNacional}</b> o município paga acima também do <b>país</b> (sinal mais forte que só o benchmark estadual).</p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5">Item</th><th className="text-right">Qtd.</th><th className="text-right">Pago/un</th><th className="text-right">Mediana SC</th><th className="text-right">Acima SC</th><th className="text-right">País</th><th className="text-right">Acima país</th><th className="text-right">Economia</th>
          </tr></thead>
          <tbody>
            {data.itens.map((it, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1.5 text-slate-700"><span className="line-clamp-1">{it.descricao}</span><span className="text-[10px] text-slate-400">{it.ano} · ref. {it.nMunisRef} munis{it.cvRef != null && it.cvRef <= 0.5 ? <span className="ml-1 text-emerald-600">· referência homogênea</span> : it.cvRef != null && it.cvRef > 1 ? <span className="ml-1 text-slate-400">· dispersão alta (rever)</span> : null}</span></td>
                <td className="text-right tabular-nums text-slate-500">{it.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} {it.unidade}</td>
                <td className="text-right font-semibold tabular-nums text-amber-700">{brlU(it.unitPago)}</td>
                <td className="text-right tabular-nums text-slate-500">{brlU(it.unitRef)}</td>
                <td className="text-right tabular-nums font-semibold text-rose-600">+{it.acimaPct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</td>
                <td className="text-right tabular-nums text-slate-500">{it.unitNac != null ? brlU(it.unitNac) : <span className="text-slate-300">—</span>}</td>
                <td className="text-right tabular-nums font-semibold">{it.acimaNacPct != null ? <span style={{ color: it.acimaNacPct > 0 ? "#e11d48" : "#059669" }}>{it.acimaNacPct > 0 ? "+" : ""}{it.acimaNacPct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span> : <span className="text-slate-300">—</span>}</td>
                <td className="text-right tabular-nums font-semibold text-slate-800">{brl(it.economia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Metodologia: preço unitário homologado (PNCP) comparado à <b>mediana de SC</b> e, quando o item é classificado no CATMAT, à <b>referência nacional</b> (Painel de Preços do Compras.gov.br, forma avulsa, mesma unidade). Apenas <b>bens</b> com referência de ≥8 municípios e dispersão controlada (exclui obras/serviços). Marca-se acima do 3º quartil e ≥20% da mediana de SC. O <b>coeficiente de variação (CV)</b> sinaliza a confiabilidade da referência (IN SEGES/ME 65/2021): CV baixo = itens homogêneos; CV alto = a especificação pode variar. Diferenças podem refletir especificação, marca, prazo ou logística — o registro é informativo, para verificação e renegociação.</p>
    </section>
  );
}
