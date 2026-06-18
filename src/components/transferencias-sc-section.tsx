"use client";

import { useEffect, useState } from "react";
import { Database, HandCoins, Loader2 } from "lucide-react";
import { Donut } from "@/components/charts/donut";
import { fmtBRLCompact } from "@/lib/ui";

type Transf = {
  n_instrumentos: number; valor_total: number; valor_liberado: number;
  por_situacao: { situacao: string; n: number; valor: number }[];
  por_orgao: { orgao: string; n: number; valor: number }[];
  top: { objeto: string; orgao: string; situacao: string; valor: number; liberado: number; inicio: string; fim: string }[];
};

export function TransferenciasSCSection({ codigo }: { codigo: string }) {
  const [data, setData] = useState<Transf | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    setData(undefined);
    fetch(`/api/transferencias-sc/${codigo}`)
      .then((r) => r.json())
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData(null));
    return () => { vivo = false; };
  }, [codigo]);

  // sem chave / sem dados → não renderiza nada (seção oculta)
  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Carregando transferências da União…
      </div>
    );
  }
  if (!data || data.n_instrumentos === 0) return null;
  const pctLiberado = data.valor_total > 0 ? (data.valor_liberado / data.valor_total) * 100 : 0;

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <HandCoins className="h-4 w-4 text-violet-600" />
          <h3 className="font-semibold text-slate-800">Transferências da União · convênios (Transferegov)</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <Database className="h-3 w-3" /> Dados oficiais
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">Recursos federais captados via convênios e instrumentos de repasse — fonte: Portal da Transparência (CGU).</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Valor celebrado</div>
            <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(data.valor_total)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Valor liberado</div>
            <div className="font-display text-xl font-bold tabular-nums text-violet-700">{fmtBRLCompact(data.valor_liberado)}</div>
            <div className="text-[11px] text-slate-500">{pctLiberado.toFixed(0)}% do celebrado</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Instrumentos</div>
            <div className="font-display text-xl font-bold tabular-nums text-slate-900">{data.n_instrumentos.toLocaleString("pt-BR")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Órgãos concedentes</div>
            <div className="font-display text-xl font-bold tabular-nums text-slate-900">{data.por_orgao.length}</div>
          </div>
        </div>
      </div>

      {data.por_orgao.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">De quem vem o recurso federal</h3>
          <p className="mb-2 text-xs text-slate-500">Valor celebrado por órgão concedente</p>
          <Donut data={data.por_orgao.map((o) => ({ label: o.orgao, valor: o.valor }))} />
        </section>
      )}

      {data.top.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-800">Maiores convênios / instrumentos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="p-2 font-medium">Objeto</th>
                  <th className="hidden p-2 font-medium md:table-cell">Concedente</th>
                  <th className="hidden p-2 font-medium sm:table-cell">Situação</th>
                  <th className="p-2 text-right font-medium">Celebrado</th>
                  <th className="hidden p-2 text-right font-medium lg:table-cell">Liberado</th>
                </tr>
              </thead>
              <tbody>
                {data.top.slice(0, 10).map((t, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="p-2 text-slate-700"><span className="line-clamp-2">{t.objeto}</span></td>
                    <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-2">{t.orgao}</span></td>
                    <td className="hidden p-2 text-slate-500 sm:table-cell">{t.situacao}</td>
                    <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(t.valor)}</td>
                    <td className="hidden p-2 text-right tabular-nums text-violet-700 lg:table-cell">{fmtBRLCompact(t.liberado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Fonte: Portal da Transparência (CGU) — universo Transferegov/SICONV.</p>
        </section>
      )}
    </>
  );
}
