"use client";

import { useEffect, useState } from "react";
import { Database, Loader2, ShoppingCart, TriangleAlert } from "lucide-react";
import { Donut } from "@/components/charts/donut";
import { fmtBRLCompact } from "@/lib/ui";

type Compras = {
  n_contratos: number; valor_estimado: number; valor_homologado: number; economia_pct: number; dispensa_pct: number;
  por_modalidade: { modalidade: string; n: number; valor: number }[];
  top: { objeto: string; modalidade: string; orgao: string; estimado: number; homologado: number; economia_pct: number | null; data: string }[];
};

export function ComprasSCSection({ codigo, tipo }: { codigo: string; tipo: "M" | "E" }) {
  const [data, setData] = useState<Compras | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    setData(undefined);
    fetch(`/api/compras-sc/${codigo}`)
      .then((r) => r.json())
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData(null));
    return () => { vivo = false; };
  }, [codigo]);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
        Carregando compras públicas do PNCP… (primeira consulta pode levar alguns segundos)
      </div>
    );
  }
  if (!data || data.n_contratos === 0) return null;

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-orange-600" />
          <h3 className="font-semibold text-slate-800">Compras públicas · PNCP 2024</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <Database className="h-3 w-3" /> Dados oficiais
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Contratações publicadas no Portal Nacional de Contratações Públicas — esfera {tipo === "E" ? "estadual" : "municipal"}.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Valor contratado</div>
            <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(data.valor_homologado)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Contratações</div>
            <div className="font-display text-xl font-bold tabular-nums text-slate-900">{data.n_contratos.toLocaleString("pt-BR")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Economia (estimado × homologado)</div>
            <div className="font-display text-xl font-bold tabular-nums text-emerald-600">{data.economia_pct.toFixed(1)}%</div>
          </div>
          <div className={`rounded-xl border p-3 ${data.dispensa_pct >= 40 ? "border-rose-200 bg-rose-50" : data.dispensa_pct >= 25 ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
            <div className="text-xs text-slate-500">Sem licitação (dispensa/inexig.)</div>
            <div className={`font-display text-xl font-bold tabular-nums ${data.dispensa_pct >= 40 ? "text-rose-700" : data.dispensa_pct >= 25 ? "text-amber-700" : "text-slate-900"}`}>{data.dispensa_pct.toFixed(1)}%</div>
          </div>
        </div>
        {data.dispensa_pct >= 25 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span><strong>Ponto de atenção (TCU):</strong> {data.dispensa_pct.toFixed(0)}% do valor contratado foi por dispensa/inexigibilidade — possível fuga à licitação. Recomenda-se verificar a fundamentação das contratações diretas.</span>
          </div>
        )}
      </div>

      {data.por_modalidade.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">Compras por modalidade · 2024</h3>
          <p className="mb-2 text-xs text-slate-500">Valor contratado por modalidade (PNCP)</p>
          <Donut data={data.por_modalidade.map((m) => ({ label: m.modalidade, valor: m.valor }))} />
        </section>
      )}

      {data.top.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-800">Maiores contratações · 2024</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="p-2 font-medium">Objeto</th>
                  <th className="hidden p-2 font-medium md:table-cell">Modalidade</th>
                  <th className="p-2 text-right font-medium">Contratado</th>
                  <th className="hidden p-2 text-right font-medium sm:table-cell">Economia</th>
                </tr>
              </thead>
              <tbody>
                {data.top.slice(0, 10).map((c, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="p-2 text-slate-700"><span className="line-clamp-2">{c.objeto}</span></td>
                    <td className="hidden p-2 text-slate-500 md:table-cell">{c.modalidade}</td>
                    <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(c.homologado)}</td>
                    <td className="hidden p-2 text-right tabular-nums sm:table-cell">
                      {c.economia_pct != null && c.economia_pct > 0 ? <span className="text-emerald-600">−{c.economia_pct.toFixed(0)}%</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Amostra de contratações de 2024 publicadas no PNCP (janela recente, principais modalidades). Capitais podem ter cobertura parcial.</p>
        </section>
      )}
    </>
  );
}
