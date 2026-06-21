import { BookOpen, TrendingDown, TrendingUp } from "lucide-react";
import type { RepasseSaudeFichaSC } from "@/lib/queries";
import { SABER_REPASSE } from "@/lib/saude-repasses-saber";
import { fmtBRLCompact } from "@/lib/ui";

// Programas/repasses da saúde no MOLDE do Previne: o que é · por que importa · série · como melhorar.
export function RepassesSaudeFicha({ dados, nome }: { dados: NonNullable<RepasseSaudeFichaSC>; nome: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
        <h2 className="text-base font-bold text-slate-900">Programas e repasses federais de saúde — como melhorar cada um</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Todo recurso federal de saúde de {nome}, programa por programa: o que é, quanto recebe, como evoluiu e <b>o que fazer para otimizar/aumentar</b> cada repasse.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-800">Total {dados.anoUlt}: {fmtBRLCompact(dados.totalUlt)}</span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-slate-600">{dados.programas.length} programas</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {dados.programas.map((p) => {
          const s = SABER_REPASSE[p.key] || SABER_REPASSE.outros;
          const ini = p.serie[0];
          const tend = ini && ini.valor > 0 ? ((p.valorUlt - ini.valor) / ini.valor) * 100 : 0;
          return (
            <div key={p.key} className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{s.emoji}</span>
                  <h3 className="text-sm font-bold leading-tight text-slate-800">{s.nome}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{p.pctTotal.toFixed(0)}% do total</span>
              </div>

              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-3xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(p.valorUlt)}</span>
                <span className="pb-1 text-xs text-slate-500">em {dados.anoUlt}</span>
              </div>
              {p.serie.length >= 2 && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  {tend >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-rose-600" />}
                  {p.serie[0].ano}–{dados.anoUlt}: {tend >= 0 ? "+" : ""}{tend.toFixed(0)}% · série {p.serie.map((x) => fmtBRLCompact(x.valor)).slice(-5).join(" → ")}
                </div>
              )}

              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
                <p className="text-slate-700"><b className="text-slate-900">O que é:</b> {s.oQueE}</p>
                <p className="text-slate-700"><b className="text-slate-900">Por que importa:</b> {s.porQueImporta}</p>
              </div>

              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><BookOpen className="h-3.5 w-3.5" /> Como melhorar este repasse</p>
                <ol className="mt-1.5 space-y-1.5">
                  {s.comoMelhorar.map((passo, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-700">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{i + 1}</span>
                      {passo}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        Fonte: Fundo Nacional de Saúde (repasses fundo-a-fundo). O "como melhorar" descreve a metodologia de financiamento de cada bloco — orientativo, sem juízo sobre a gestão.
      </p>
    </div>
  );
}
