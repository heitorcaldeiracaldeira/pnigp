"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { fmtBRL } from "@/lib/ui";

type Item = { item: string; unidade: string; mediana: number; p25: number; p75: number; nMuns: number; nCompras: number; min: number; max: number };

// Pesquisa de preço de referência (Lei 14.133): o gestor digita o item e recebe o preço justo (mediana SC + faixa)
// para montar a pesquisa de preços do edital e se proteger no TCE. Fonte: PNCP (preços homologados em SC).
export function PesquisaPreco() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setLoading(true); setRes(null);
    try { const r = await fetch(`/api/preco-referencia/${encodeURIComponent(q.trim())}`); setRes(await r.json()); }
    catch { setRes([]); }
    setLoading(false);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🎯 Pesquisa de preço de referência</h3>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">Lei 14.133</span>
      </div>
      <p className="text-sm text-slate-500">Digite um item (ex.: <i>papel A4</i>, <i>pneu</i>, <i>amoxicilina</i>) e veja o <b>preço praticado em Santa Catarina</b> — mediana e faixa (P25–P75) — para fundamentar a pesquisa de preços do edital.</p>

      <form onSubmit={buscar} className="mt-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item… (mín. 3 letras)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"><Search className="h-4 w-4" /> Buscar</button>
      </form>

      {loading && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Consultando preços de SC…</div>}

      {res && !loading && (res.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum item comparável encontrado para “{q}”. Tente um termo mais genérico (ex.: o nome do produto, sem marca).</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="p-2 font-medium">Item (unidade)</th><th className="p-2 text-right font-medium">P25</th>
              <th className="p-2 text-right font-medium">Mediana (referência)</th><th className="p-2 text-right font-medium">P75</th>
              <th className="p-2 text-right font-medium">Faixa</th><th className="p-2 text-right font-medium">Base</th></tr></thead>
            <tbody>
              {res.map((it, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 text-slate-700">{it.item.toLowerCase()} <span className="text-slate-400">({it.unidade})</span></td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{fmtBRL(it.p25)}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-teal-700">{fmtBRL(it.mediana)}</td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{fmtBRL(it.p75)}</td>
                  <td className="p-2 text-right tabular-nums text-[10px] text-slate-400">{fmtBRL(it.min)}–{fmtBRL(it.max)}</td>
                  <td className="p-2 text-right tabular-nums text-slate-400">{it.nMuns} mun · {it.nCompras}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP — preços <b>homologados</b> em compras efetivadas de municípios de SC (itens equivalentes por descrição + unidade, ≥5 municípios). A <b>mediana</b> é a referência sugerida; <b>P25–P75</b> é a faixa usual. Confirme a especificação do item. Apoia, não substitui, a pesquisa de preços formal.</p>
    </section>
  );
}
