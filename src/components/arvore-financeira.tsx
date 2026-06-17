"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NoFin } from "@/lib/orcamento";
import { fmtBRLCompact } from "@/lib/ui";

function corPct(p: number) {
  return p >= 90 ? "bg-emerald-500" : p >= 80 ? "bg-amber-500" : "bg-rose-500";
}

export function ArvoreFinanceira({
  raizes,
  colNome,
  colV1,
  colV2,
}: {
  raizes: NoFin[];
  colNome: string;
  colV1: string;
  colV2: string;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const toggle = (p: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 text-left text-xs text-slate-500 [&>th]:border-b [&>th]:border-slate-200 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th>{colNome}</th>
            <th className="text-right">{colV1}</th>
            <th className="text-right">{colV2}</th>
            <th className="w-40 text-right">% exec.</th>
          </tr>
        </thead>
        <tbody>
          {raizes.map((no) => (
            <Linhas key={no.nome} no={no} nivel={0} path={no.nome} abertos={abertos} toggle={toggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Linhas({
  no,
  nivel,
  path,
  abertos,
  toggle,
}: {
  no: NoFin;
  nivel: number;
  path: string;
  abertos: Set<string>;
  toggle: (p: string) => void;
}) {
  const temFilhos = !!no.filhos && no.filhos.length > 0;
  const aberto = abertos.has(path);
  const peso =
    nivel === 0 ? "font-semibold text-slate-800" : nivel === 1 ? "font-medium text-slate-700" : "text-slate-600";

  return (
    <>
      <tr className="border-b border-slate-100 transition-colors hover:bg-teal-50/50">
        {/* Nome com guias de indentação */}
        <td className="px-0 py-0">
          <div className="flex items-stretch">
            {Array.from({ length: nivel }).map((_, i) => (
              <span key={i} className="w-5 shrink-0 border-l border-slate-200" />
            ))}
            <div className={`flex items-center gap-1.5 py-2 pr-3 ${nivel === 0 ? "pl-3" : "pl-1"}`}>
              {temFilhos ? (
                <button
                  onClick={() => toggle(path)}
                  aria-expanded={aberto}
                  className={`flex items-center gap-1.5 text-left transition hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${peso}`}
                >
                  {aberto ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                  {no.nome}
                </button>
              ) : (
                <span className={`pl-[22px] ${peso}`}>{no.nome}</span>
              )}
            </div>
          </div>
        </td>
        <td className={`px-3 text-right tabular-nums ${nivel === 0 ? "text-slate-500" : "text-slate-500"}`}>{fmtBRLCompact(no.previsto)}</td>
        <td className={`px-3 text-right tabular-nums ${peso}`}>{fmtBRLCompact(no.realizado)}</td>
        <td className="px-3">
          <div className="flex items-center justify-end gap-2">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${corPct(no.pct)}`} style={{ width: `${Math.min(100, no.pct)}%` }} />
            </div>
            <span className="w-9 text-right tabular-nums text-xs text-slate-600">{no.pct.toFixed(0)}%</span>
          </div>
        </td>
      </tr>
      {temFilhos &&
        aberto &&
        no.filhos!.map((f) => (
          <Linhas key={`${path}›${f.nome}`} no={f} nivel={nivel + 1} path={`${path}›${f.nome}`} abertos={abertos} toggle={toggle} />
        ))}
    </>
  );
}
