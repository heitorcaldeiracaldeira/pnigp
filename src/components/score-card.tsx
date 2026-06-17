import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { classifyIndex } from "@/lib/ui";

export function ScoreCard({
  sigla,
  nome,
  valor,
  anterior,
  posicao,
  total,
  descricao,
}: {
  sigla: string;
  nome: string;
  valor: number;
  anterior: number | null;
  posicao?: number;
  total?: number;
  descricao?: string;
}) {
  const cls = classifyIndex(valor);
  const delta = anterior != null ? valor - anterior : null;

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="inline-flex items-center gap-1 text-sm font-bold tracking-wide text-slate-900">
            {sigla}
            {descricao && <InfoTip text={descricao} label={`O que é ${sigla}`} />}
          </span>
          <p className="text-xs text-slate-500">{nome}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${cls.color}`}>
          {cls.label}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span className="font-display text-4xl font-bold tabular-nums tracking-tight text-slate-900">{valor.toFixed(1)}</span>
        <span className="pb-1 text-sm text-slate-500">/ 100</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        {delta != null ? (
          <span
            className={`inline-flex items-center gap-0.5 font-medium ${
              delta >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta).toFixed(1)} pts vs. 2023
          </span>
        ) : (
          <span />
        )}
        {posicao && total && (
          <span className="text-slate-500">
            {posicao}º de {total}
          </span>
        )}
      </div>

      <div className={`absolute inset-x-0 bottom-0 h-1 rounded-b-2xl ${cls.color}`} />
    </div>
  );
}
