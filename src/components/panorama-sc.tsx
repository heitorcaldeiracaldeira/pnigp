"use client";

import { Database, Radar } from "lucide-react";
import { CapacityRadar } from "@/components/charts/capacity-radar";

export function PanoramaSC({ radar, grupo }: { radar: { dimensao: string; valor: number; bruto: string }[]; grupo: string }) {
  const nota = (v: number) => (v >= 65 ? { t: "forte", c: "text-emerald-600" } : v >= 45 ? { t: "na média", c: "text-slate-500" } : { t: "frágil", c: "text-amber-600" });
  const fortes = radar.filter((d) => d.valor >= 65).length;
  const frageis = radar.filter((d) => d.valor < 45).length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><Radar className="h-4 w-4" /> Panorama 360° — desempenho cruzado vs pares ({grupo})</div>
        <p className="mt-1 text-sm text-slate-600">Todas as dimensões num só lugar, normalizadas contra os municípios de porte semelhante. <b>50 = mediana do grupo</b>; acima é melhor. {fortes} forte(s) · {frageis} frágil(eis).</p>
      </div>

      <div className="grid items-center gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <CapacityRadar data={radar.map((d) => ({ dimensao: d.dimensao, valor: d.valor }))} />
        </div>
        <ul className="space-y-2">
          {radar.map((d) => {
            const n = nota(d.valor);
            return (
              <li key={d.dimensao} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="text-slate-700">{d.dimensao}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">{d.bruto}</span>
                  <span className="w-16 text-right tabular-nums font-semibold text-slate-800">{d.valor.toFixed(0)}<span className="text-[10px] text-slate-500">/100</span></span>
                  <span className={`w-16 text-right text-xs font-medium ${n.c}`}>{n.t}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Pontuação relativa: 50 = mediana dos pares de porte; 100 = o dobro do desempenho mediano (ou metade, nas dimensões onde menor é melhor). Síntese das fontes SICONFI, PNCP, SIOPS, CNES, SIH/SIA, IBGE, CGU.
      </p>
    </div>
  );
}
