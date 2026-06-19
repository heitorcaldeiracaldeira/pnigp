"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { fmtBRLCompact } from "@/lib/ui";

type Props = { ano: number; receita: number; despesa: number; pessoal: number; investimento: number; rclAjustada: number; pessoalPctBase: number };

function faixaLRF(pct: number) {
  if (pct > 54) return { txt: "acima do limite (54%)", cls: "text-rose-700", bg: "bg-rose-100" };
  if (pct > 51.3) return { txt: "limite prudencial (51,3%)", cls: "text-amber-700", bg: "bg-amber-100" };
  if (pct > 48.6) return { txt: "alerta (48,6%)", cls: "text-amber-700", bg: "bg-amber-50" };
  return { txt: "dentro do limite", cls: "text-emerald-700", bg: "bg-emerald-100" };
}

export function SimuladorFiscal({ ano, receita, despesa, pessoal, investimento, rclAjustada, pessoalPctBase }: Props) {
  const [dp, setDp] = useState(0); // Δ% pessoal
  const [di, setDi] = useState(0); // Δ% investimento

  const novaPessoal = pessoal * (1 + dp / 100);
  const novoInvest = investimento * (1 + di / 100);
  const novaDespesa = despesa + (novaPessoal - pessoal) + (novoInvest - investimento);
  const resultadoBase = receita - despesa;
  const resultadoNovo = receita - novaDespesa;
  const pessoalPctNovo = pessoalPctBase * (1 + dp / 100); // pct ∝ pessoal (RCL fixa) — estimativa
  const invPctBase = despesa > 0 ? (investimento / despesa) * 100 : 0;
  const invPctNovo = novaDespesa > 0 ? (novoInvest / novaDespesa) * 100 : 0;
  const fb = faixaLRF(pessoalPctBase), fn = faixaLRF(pessoalPctNovo);

  const Linha = ({ label, base, novo, fmt, bom }: { label: string; base: string; novo: string; fmt?: string; bom: boolean }) => (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="text-slate-400">{base}</span>
        <span className="text-slate-300">→</span>
        <span className={`font-semibold ${bom ? "text-emerald-600" : "text-rose-600"}`}>{novo}{fmt}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><SlidersHorizontal className="h-4 w-4 text-teal-600" /> Simulador fiscal — exercício {ano}</div>
        <p className="mt-1 text-sm text-slate-600">Ajuste as alavancas e veja o impacto estimado no resultado, no limite de pessoal da LRF (sobre RCL oficial) e na taxa de investimento.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Despesa de pessoal <span className={`tabular-nums ${dp === 0 ? "text-slate-400" : dp > 0 ? "text-rose-600" : "text-emerald-600"}`}>{dp > 0 ? "+" : ""}{dp}%</span></label>
          <input type="range" min={-20} max={20} step={1} value={dp} onChange={(e) => setDp(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Investimento <span className={`tabular-nums ${di === 0 ? "text-slate-400" : di > 0 ? "text-emerald-600" : "text-rose-600"}`}>{di > 0 ? "+" : ""}{di}%</span></label>
          <input type="range" min={-20} max={20} step={1} value={di} onChange={(e) => setDi(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
        </div>
      </div>

      <div className="space-y-2">
        <Linha label="Resultado orçamentário" base={fmtBRLCompact(resultadoBase)} novo={fmtBRLCompact(resultadoNovo)} bom={resultadoNovo >= resultadoBase} />
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="text-slate-600">Pessoal / RCL (LRF)</span>
          <span className="flex items-center gap-2 tabular-nums">
            <span className={`rounded px-1.5 py-0.5 text-xs ${fb.bg} ${fb.cls}`}>{pessoalPctBase.toFixed(1)}%</span>
            <span className="text-slate-300">→</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${fn.bg} ${fn.cls}`}>{pessoalPctNovo.toFixed(1)}% · {fn.txt}</span>
          </span>
        </div>
        <Linha label="Taxa de investimento" base={`${invPctBase.toFixed(1)}%`} novo={`${invPctNovo.toFixed(1)}`} fmt="%" bom={invPctNovo >= invPctBase} />
      </div>

      <p className="text-[11px] text-slate-400">Estimativa linear (mantém demais despesas e a RCL constantes). O % de pessoal usa a RCL ajustada oficial do RGF como base. Serve para explorar trade-offs, não como projeção orçamentária formal.</p>
    </div>
  );
}
