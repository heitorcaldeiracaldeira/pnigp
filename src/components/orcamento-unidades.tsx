"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Unidade } from "@/lib/orcamento";
import { fmtBRLCompact } from "@/lib/ui";

function corExec(p: number) {
  return p >= 90 ? "bg-emerald-500" : p >= 80 ? "bg-amber-500" : "bg-rose-500";
}

export function OrcamentoUnidades({ unidades }: { unidades: Unidade[] }) {
  const [openU, setOpenU] = useState<string | null>(null);
  const [openA, setOpenA] = useState<string | null>(null);

  const toggleU = (nome: string) => {
    setOpenU(openU === nome ? null : nome);
    setOpenA(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-2 font-medium">Órgão · ação · elemento de despesa</th>
            <th className="pb-2 text-right font-medium">Orçado</th>
            <th className="pb-2 text-right font-medium">Executado</th>
            <th className="hidden pb-2 pl-4 font-medium sm:table-cell">% exec.</th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((u) => {
            const uOpen = openU === u.nome;
            return (
              <Fragment key={u.nome}>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-2">
                    <button
                      onClick={() => toggleU(u.nome)}
                      aria-expanded={uOpen}
                      className="flex items-center gap-1.5 text-left font-medium text-slate-700 transition hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    >
                      {uOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                      {u.nome}
                    </button>
                  </td>
                  <Valores orcado={u.orcado} executado={u.executado} execucao={u.execucao} strong />
                </tr>

                {uOpen &&
                  u.acoes.map((a) => {
                    const aKey = `${u.nome}›${a.nome}`;
                    const aOpen = openA === aKey;
                    return (
                      <Fragment key={aKey}>
                        <tr className="bg-slate-50/60">
                          <td className="py-1.5 pr-2 pl-7">
                            <button
                              onClick={() => setOpenA(aOpen ? null : aKey)}
                              aria-expanded={aOpen}
                              className="flex items-center gap-1.5 text-left text-slate-600 transition hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                            >
                              {aOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                              {a.nome}
                            </button>
                          </td>
                          <Valores orcado={a.orcado} executado={a.executado} execucao={a.execucao} />
                        </tr>

                        {aOpen &&
                          a.elementos.map((e) => (
                            <tr key={`${aKey}›${e.nome}`} className="bg-slate-50 text-xs">
                              <td className="py-1 pr-2 pl-14 text-slate-500">{e.nome}</td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{fmtBRLCompact(e.orcado)}</td>
                              <td className="py-1 text-right tabular-nums text-slate-600">{fmtBRLCompact(e.executado)}</td>
                              <td className="hidden py-1 pl-4 text-right tabular-nums text-slate-500 sm:table-cell">{e.execucao.toFixed(0)}%</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Valores({
  orcado,
  executado,
  execucao,
  strong,
}: {
  orcado: number;
  executado: number;
  execucao: number;
  strong?: boolean;
}) {
  return (
    <>
      <td className="py-2 text-right tabular-nums text-slate-500">{fmtBRLCompact(orcado)}</td>
      <td className={`py-2 text-right tabular-nums ${strong ? "font-semibold text-slate-800" : "text-slate-700"}`}>
        {fmtBRLCompact(executado)}
      </td>
      <td className="hidden py-2 pl-4 sm:table-cell">
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${corExec(execucao)}`} style={{ width: `${execucao}%` }} />
          </div>
          <span className="tabular-nums text-xs text-slate-600">{execucao.toFixed(0)}%</span>
        </div>
      </td>
    </>
  );
}
