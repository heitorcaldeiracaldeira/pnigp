// VARIAÇÃO INTERNA DE PREÇOS — o próprio município comprou o mesmo item a preços diferentes.
// Achado difícil de contestar: é o município provando que conseguia o item mais barato. Economia = padronizar pelo menor preço próprio.
import { Repeat } from "lucide-react";
import type { VariacaoInternaSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const brlU = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function VariacaoInterna({ data, nome }: { data: NonNullable<VariacaoInternaSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Repeat className="h-4 w-4 text-orange-600" /> Mesmo item, preços diferentes — variação interna</h3>
        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">{brl(data.totalEconomia)} de economia potencial</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Itens que <b>{nome}</b> comprou <b>mais de uma vez a preços unitários diferentes</b>. A economia estimada é quanto se pouparia padronizando pelo <b>menor preço que o próprio município já conseguiu</b> — em <b>{data.nItens}</b> itens. É o achado mais difícil de contestar: o próprio histórico prova que dava para comprar mais barato.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5">Item</th><th className="text-right">Compras</th><th className="text-right">Menor</th><th className="text-right">Maior</th><th className="text-right">Variação</th><th className="text-right">Economia</th>
          </tr></thead>
          <tbody>
            {data.itens.map((it, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1.5 text-slate-700"><span className="line-clamp-1">{it.descricao}</span><span className="text-[10px] text-slate-400">por {it.unidade}</span></td>
                <td className="text-right tabular-nums text-slate-500">{it.nCompras}×</td>
                <td className="text-right tabular-nums text-emerald-700">{brlU(it.menor)}</td>
                <td className="text-right font-semibold tabular-nums text-rose-600">{brlU(it.maior)}</td>
                <td className="text-right tabular-nums font-semibold text-orange-700">{it.razao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×</td>
                <td className="text-right tabular-nums font-semibold text-slate-800">{brl(it.economia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Metodologia: por município, mesmo item (descrição normalizada) e mesma unidade, comprado ≥4 vezes com variação de preço unitário entre 1,8× e 12× (faixa sã, exclui erros e itens diferentes); só bens (exclui obras/serviços). Economia = gasto efetivo − (menor preço próprio × quantidade total). Diferenças podem refletir época, lote, marca ou especificação — o registro é informativo, para padronização e renegociação.</p>
    </section>
  );
}
