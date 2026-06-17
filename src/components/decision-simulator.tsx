"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  GraduationCap,
  HeartPulse,
  Landmark,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  TrendingUp as TrendIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { simular, type SimArea } from "@/lib/simulate";
import { type AreaKey, AREAS, fmtPop } from "@/lib/ui";

const ICONS: Record<string, LucideIcon> = {
  HeartPulse,
  GraduationCap,
  ShieldCheck,
  Landmark,
  Users,
  TrendingUp,
};

const MAX = 500; // R$/hab por área

function brlCompact(v: number): string {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export function DecisionSimulator({
  areas,
  indices,
  populacao,
  outrosIgp,
  posAtual,
  total,
}: {
  areas: SimArea[];
  indices: { iceb: number; invp: number; igp360: number };
  populacao: number;
  outrosIgp: number[];
  posAtual: number;
  total: number;
}) {
  const [invest, setInvest] = useState<Record<string, number>>({});

  const res = useMemo(
    () => simular({ areas, investPerCapita: invest, indices, populacao, outrosIgp }),
    [areas, invest, indices, populacao, outrosIgp],
  );

  const algumInvest = Object.values(invest).some((v) => v > 0);
  const set = (area: string, v: number) => setInvest((s) => ({ ...s, [area]: v }));
  const reset = () => setInvest({});
  const sugerir = () => {
    // foca nas 2 áreas finalísticas mais fracas
    const fin = areas
      .filter((a) => ["saude", "educacao", "seguranca", "social"].includes(a.area))
      .sort((x, y) => x.score - y.score)
      .slice(0, 2);
    setInvest(Object.fromEntries(fin.map((a) => [a.area, 300])));
  };

  const subiu = res.novaPos < posAtual;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-700 to-violet-700 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="h-5 w-5" />
          <div>
            <h3 className="font-semibold leading-tight">Simulador de Decisão</h3>
            <p className="text-xs text-indigo-100/80">
              Distribua o investimento e veja o impacto projetado nos índices e no ranking
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sugerir}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur transition hover:bg-white/25"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Sugerir foco
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur transition hover:bg-white/25"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Zerar
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Sliders por área */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">
            Investimento adicional por área <span className="font-normal text-slate-500">(R$ por habitante)</span>
          </h4>
          <div className="space-y-4">
            {areas.map((a) => {
              const Icon = ICONS[AREAS[a.area as AreaKey].icon];
              const v = invest[a.area] ?? 0;
              const ganho = res.deltasArea[a.area] ?? 0;
              return (
                <div key={a.area}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      <Icon className={`h-4 w-4 ${AREAS[a.area as AreaKey].color}`} />
                      {a.label}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="font-semibold text-slate-700">R$ {v}/hab</span>
                      {ganho >= 0.5 && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                          +{ganho.toFixed(0)} pts
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={MAX}
                    step={10}
                    value={v}
                    onChange={(e) => set(a.area, Number(e.target.value))}
                    aria-label={`Investimento adicional em ${a.label}, reais por habitante`}
                    aria-valuetext={`R$ ${v} por habitante`}
                    className="h-2.5 w-full cursor-pointer rounded-full bg-slate-200 accent-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Resultado projetado (fixo no topo no mobile enquanto ajusta os controles) */}
        <div className="order-first self-start rounded-xl border border-slate-200 bg-slate-50 p-4 lg:order-none lg:static lg:top-auto sticky top-[calc(var(--header-h)+3rem)] z-[5]">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Resultado projetado</h4>

          <div className="grid grid-cols-3 gap-3">
            {[
              { sigla: "IGP 360", atual: indices.igp360, novo: res.igp360, d: res.dIgp },
              { sigla: "INVP", atual: indices.invp, novo: res.invp, d: res.dInvp },
              { sigla: "ICEB", atual: indices.iceb, novo: res.iceb, d: res.dIceb },
            ].map((m) => (
              <div key={m.sigla} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <div className="text-xs font-semibold text-slate-500">{m.sigla}</div>
                <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                  <span>{m.atual.toFixed(1)}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="text-base font-bold text-slate-900">{m.novo.toFixed(1)}</span>
                </div>
                <div className={`mt-0.5 text-xs font-semibold ${m.d >= 0.05 ? "text-emerald-600" : "text-slate-400"}`}>
                  {m.d >= 0.05 ? `+${m.d.toFixed(1)} pts` : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Ranking */}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <TrendIcon className="h-4 w-4 text-indigo-600" />
              Posição no ranking
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <span className="text-slate-500">{posAtual}º</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              <span className={subiu ? "text-emerald-600" : "text-slate-700"}>{res.novaPos}º</span>
              <span className="text-xs font-normal text-slate-500">de {total}</span>
              {subiu && (
                <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  ▲ {posAtual - res.novaPos}
                </span>
              )}
            </span>
          </div>

          {/* Investimento e cidadãos */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Investimento total</div>
              <div className="text-lg font-bold text-slate-900">{brlCompact(res.totalInvest)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">População beneficiada</div>
              <div className="text-lg font-bold text-slate-900">
                {algumInvest ? fmtPop(populacao) : "—"}
              </div>
            </div>
          </div>

          {!algumInvest && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Mova os controles ou clique em <strong>Sugerir foco</strong> para simular um plano.
            </p>
          )}
        </div>
      </div>

      <p className="border-t border-slate-100 px-5 py-3 text-center text-xs text-slate-500">
        Projeção didática com retornos decrescentes · não é previsão · serve para apoiar a priorização
      </p>
    </section>
  );
}
