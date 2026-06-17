"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NoFin } from "@/lib/orcamento";
import { fmtBRLCompact } from "@/lib/ui";

/** Barras de composição (% do total) expansíveis em N níveis. */
export function BarComposicao({
  raizes,
  total,
  cor = "bg-teal-600",
}: {
  raizes: NoFin[];
  total: number;
  cor?: string;
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
    <div className="space-y-2.5">
      {raizes.map((no) => (
        <Barra key={no.nome} no={no} total={total} nivel={0} path={no.nome} cor={cor} abertos={abertos} toggle={toggle} />
      ))}
    </div>
  );
}

function Barra({
  no,
  total,
  nivel,
  path,
  cor,
  abertos,
  toggle,
}: {
  no: NoFin;
  total: number;
  nivel: number;
  path: string;
  cor: string;
  abertos: Set<string>;
  toggle: (p: string) => void;
}) {
  const pct = total > 0 ? (no.realizado / total) * 100 : 0;
  const temFilhos = !!no.filhos && no.filhos.length > 0;
  const aberto = abertos.has(path);
  const barCor = nivel === 0 ? cor : nivel === 1 ? "bg-teal-400" : "bg-teal-300";
  const txt = nivel === 0 ? "text-slate-700" : "text-slate-500";

  return (
    <>
      <div style={{ paddingLeft: nivel * 16 }}>
        <div className="mb-1 flex items-center gap-1.5">
          {temFilhos ? (
            <button
              onClick={() => toggle(path)}
              aria-expanded={aberto}
              className="flex flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {aberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <span className={`flex-1 text-sm ${txt}`}>{no.nome}</span>
              <span className="tabular-nums text-sm text-slate-500">
                <strong className="text-slate-800">{fmtBRLCompact(no.realizado)}</strong> · {pct.toFixed(0)}%
              </span>
            </button>
          ) : (
            <div className="flex flex-1 items-center gap-1.5 pl-[18px]">
              <span className={`flex-1 text-sm ${txt}`}>{no.nome}</span>
              <span className="tabular-nums text-sm text-slate-500">
                {fmtBRLCompact(no.realizado)} · {pct.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        <div className="ml-[18px] h-2 w-full rounded-full bg-slate-100">
          <div className={`h-2 rounded-full ${barCor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
      {temFilhos &&
        aberto &&
        no.filhos!.map((fch) => (
          <Barra key={`${path}›${fch.nome}`} no={fch} total={total} nivel={nivel + 1} path={`${path}›${fch.nome}`} cor={cor} abertos={abertos} toggle={toggle} />
        ))}
    </>
  );
}
