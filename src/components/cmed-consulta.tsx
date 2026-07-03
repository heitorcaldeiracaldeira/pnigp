"use client";

// Consulta do preço-teto legal de medicamentos (CMED/Anvisa PMVG) — referência para compras de saúde.
// SC usa a alíquota de ICMS 17% (PMVG 17%). Fonte oficial; o comprador não pode pagar acima do PMVG.
import { useEffect, useState } from "react";
import { Database, Pill, Search } from "lucide-react";

type Item = { substancia: string; produto: string; apresentacao: string; laboratorio: string; pmvg_17: number; pmvg_0: number; restricao_hospitalar: boolean };
const brl = (n: number) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CmedConsulta() {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setItens([]); return; }
    setCarregando(true);
    const id = setTimeout(() => {
      fetch(`/api/cmed-pmvg?q=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .then((d) => setItens(Array.isArray(d) ? d : []))
        .catch(() => setItens([]))
        .finally(() => setCarregando(false));
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Pill aria-hidden className="h-4 w-4 text-teal-600" /> Preço-teto de medicamentos (CMED/PMVG)</div>
      <p className="mt-1 text-sm text-slate-600">Consulte o <b>Preço Máximo de Venda ao Governo</b> — o teto legal que o município <b>não pode ultrapassar</b> na compra de medicamentos (Anvisa/CMED). Valores para SC (ICMS 17%).</p>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
        <Search aria-hidden className="h-4 w-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por substância ou produto (ex.: dipirona, losartana)…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
      </div>

      {q.trim().length >= 3 && (
        <div className="mt-3 overflow-x-auto">
          {carregando && !itens.length ? (
            <div className="p-4 text-sm text-slate-500">Buscando…</div>
          ) : itens.length ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500">
                <th className="py-1.5">Substância · apresentação</th><th>Produto</th><th className="text-right">PMVG (teto)</th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i} className="border-b border-slate-50 align-top">
                    <td className="py-1.5"><div className="font-medium text-slate-700">{it.substancia}</div><div className="text-[11px] text-slate-500">{it.apresentacao}{it.restricao_hospitalar ? " · uso hospitalar" : ""}</div></td>
                    <td className="text-[12px] text-slate-600">{it.produto}<div className="text-[10px] text-slate-400">{it.laboratorio}</div></td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums text-teal-700">{brl(it.pmvg_17)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-sm text-slate-500">Nenhum medicamento encontrado para “{q}”.</div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dados oficiais</span>Fonte: Anvisa/CMED — Lista de Conformidade Gov (PMVG). O teto se aplica às compras públicas; preços acima exigem justificativa. Atualização mensal.</p>
    </section>
  );
}
