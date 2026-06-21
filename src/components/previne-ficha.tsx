"use client";

import { useState } from "react";
import { Activity, BookOpen, ChevronDown, Lightbulb, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { PrevineFichaSC } from "@/lib/queries";
import { PREVINE_SABER, nivelPrevine } from "@/lib/previne-saber";

const COR = {
  ok: { dot: "bg-emerald-500", txt: "text-emerald-700", pill: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", rotulo: "Na meta" },
  warn: { dot: "bg-amber-500", txt: "text-amber-700", pill: "bg-amber-100 text-amber-700", bar: "bg-amber-500", rotulo: "Quase lá" },
  bad: { dot: "bg-rose-500", txt: "text-rose-700", pill: "bg-rose-100 text-rose-700", bar: "bg-rose-500", rotulo: "Precisa de atenção" },
} as const;

function fmtComp(c: string) {
  const m = c.match(/(\d{4})Q(\d)/);
  return m ? `${m[2]}º quad/${m[1]}` : c;
}

function Ficha({ ind }: { ind: PrevineFichaSC extends null ? never : NonNullable<PrevineFichaSC>["indicadores"][number] }) {
  const [aberto, setAberto] = useState(true); // "como melhorar" aberto por padrão — a ação é o foco
  const saber = PREVINE_SABER[ind.codigo];
  if (!saber) return null;
  const nv = nivelPrevine(ind.pct, saber.meta);
  const c = COR[nv];
  const falta = Math.max(0, saber.meta - ind.pct);
  const serie = ind.serie;
  const tend = serie.length >= 2 ? ind.pct - serie[0].pct : 0;
  const vsPares = ind.pct - ind.paresPct;

  return (
    <div className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
      {/* topo: nome + semáforo */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{saber.emoji}</span>
          <div>
            <h3 className="text-sm font-bold leading-tight text-slate-800">{saber.curto}</h3>
            <p className="text-[11px] text-slate-400">Indicador {ind.codigo} · Previne Brasil</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.pill}`}>{c.rotulo}</span>
      </div>

      {/* número grande + meta + barra */}
      <div className="mt-3 flex items-end gap-3">
        <span className={`font-display text-4xl font-bold tabular-nums ${c.txt}`}>{ind.pct.toFixed(1)}%</span>
        <span className="pb-1 text-sm text-slate-500">você · meta {saber.meta}%</span>
      </div>
      <div className="relative mt-2 h-2.5 w-full rounded-full bg-slate-100">
        <div className={`h-2.5 rounded-full ${c.bar}`} style={{ width: `${Math.min(100, ind.pct)}%` }} />
        <div className="absolute inset-y-0" style={{ left: `${Math.min(100, saber.meta)}%` }} title={`meta ${saber.meta}%`}>
          <div className="h-2.5 w-px bg-slate-700" />
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          {tend > 0.5 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : tend < -0.5 ? <TrendingDown className="h-3 w-3 text-rose-600" /> : <Activity className="h-3 w-3" />}
          tendência: {serie.map((s) => `${s.pct.toFixed(0)}%`).join(" → ")}
        </span>
        <span>pares do seu porte: <b className="text-slate-600">{ind.paresPct.toFixed(1)}%</b> ({vsPares >= 0 ? "+" : ""}{vsPares.toFixed(1)} p.p.)</span>
        {falta > 0 && <span className="font-medium text-slate-600">faltam {falta.toFixed(1)} p.p. para a meta</span>}
      </div>

      {/* o que é + por que importa (sempre visível — ensina) */}
      <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
        <p className="text-slate-700"><b className="text-slate-900">O que é:</b> {saber.oQueE}</p>
        <p className="text-slate-700"><b className="text-slate-900">Por que importa:</b> {saber.porQueImporta}</p>
      </div>

      {/* expandível: como é medido + como melhorar */}
      <button onClick={() => setAberto((v) => !v)} className="mt-3 flex w-full items-center justify-between rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100">
        <span className="inline-flex items-center gap-1.5"><Lightbulb className="h-4 w-4" /> Como melhorar este indicador</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Target className="h-3.5 w-3.5 text-slate-500" /> Como é medido (o que conta)</p>
            <p className="mt-1 text-xs text-slate-600">{saber.comoMedido}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><BookOpen className="h-3.5 w-3.5" /> Plano de ação prático</p>
            <ol className="mt-1.5 space-y-1.5">
              {saber.comoMelhorar.map((passo, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{i + 1}</span>
                  {passo}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function PrevineFicha({ dados, nome }: { dados: NonNullable<PrevineFichaSC>; nome: string }) {
  const ordenados = [...dados.indicadores].sort((a, b) => {
    const na = nivelPrevine(a.pct, PREVINE_SABER[a.codigo]?.meta ?? 100);
    const nb = nivelPrevine(b.pct, PREVINE_SABER[b.codigo]?.meta ?? 100);
    const peso = { bad: 0, warn: 1, ok: 2 };
    return peso[na] - peso[nb]; // pior primeiro = pontos de atenção no topo
  });
  const abaixo = dados.indicadores.filter((i) => i.pct < (PREVINE_SABER[i.codigo]?.meta ?? 100)).length;

  return (
    <div className="space-y-4">
      {/* intro — ensina o contexto antes dos números */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Activity className="h-5 w-5 text-teal-700" /> Previne Brasil — sua Atenção Primária, indicador a indicador</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          O governo federal <b>paga {nome} por desempenho</b> na saúde básica: cada indicador abaixo da meta é <b>dinheiro federal deixado na mesa</b> e, mais importante, cuidado que não chegou ao cidadão.
          Aqui cada indicador vem com <b>o que é, como você está e o que fazer para melhorar</b> — em linguagem direta.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700">{dados.indicadores.length} indicadores</span>
          <span className={`rounded-lg px-3 py-1.5 font-semibold ${abaixo ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{abaixo} abaixo da meta</span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-slate-500">competência: {fmtComp(dados.competenciaUlt)} · pares: {dados.grupo}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ordenados.map((ind) => <Ficha key={ind.codigo} ind={ind} />)}
      </div>

      <p className="text-[11px] text-slate-500">
        Fonte: SISAB/Previne Brasil (Min. Saúde). Metas conforme metodologia oficial do Previne — confira a Nota Técnica vigente. O "como melhorar" deriva do que cada indicador oficialmente contabiliza.
      </p>
    </div>
  );
}
