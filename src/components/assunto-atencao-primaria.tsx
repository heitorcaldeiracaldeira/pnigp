"use client";

import { useState } from "react";
import { BarChart3, ClipboardCheck, Database, Gauge } from "lucide-react";
import type { PrevineFichaSC } from "@/lib/queries";
import { PREVINE_SABER, nivelPrevine } from "@/lib/previne-saber";
import { PrevineFicha } from "@/components/previne-ficha";

type Dados = NonNullable<PrevineFichaSC>;
type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";

const PILULAS: { id: Visao; label: string; icon: typeof Gauge; desc: string }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge, desc: "Como está e por que importa" },
  { id: "tatico", label: "Tático", icon: BarChart3, desc: "Do que é feito · onde está o gargalo" },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck, desc: "O que fazer para melhorar" },
  { id: "tecnico", label: "Técnico", icon: Database, desc: "A prova: série, cálculo e fonte" },
];

const COR = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-rose-600" } as const;
const BAR = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500" } as const;
const fmtComp = (c: string) => { const m = c.match(/(\d{4})Q(\d)/); return m ? `${m[2]}º/${m[1].slice(2)}` : c; };

export function AssuntoAtencaoPrimaria({ dados, nome }: { dados: Dados; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const inds = dados.indicadores.filter((i) => PREVINE_SABER[i.codigo]);
  const comMeta = inds.map((i) => ({ ...i, meta: PREVINE_SABER[i.codigo].meta, nv: nivelPrevine(i.pct, PREVINE_SABER[i.codigo].meta), saber: PREVINE_SABER[i.codigo] }));
  const naMeta = comMeta.filter((i) => i.nv === "ok").length;
  const piores = [...comMeta].sort((a, b) => a.pct / a.meta - b.pct / b.meta);
  const mediaMun = comMeta.reduce((s, i) => s + i.pct, 0) / (comMeta.length || 1);
  const mediaPar = comMeta.reduce((s, i) => s + i.paresPct, 0) / (comMeta.length || 1);
  const parecer = naMeta === comMeta.length ? { t: "Todos os indicadores na meta", c: "bg-emerald-100 text-emerald-700" }
    : naMeta >= comMeta.length / 2 ? { t: "Maioria na meta — alguns pontos a subir", c: "bg-amber-100 text-amber-700" }
    : { t: "Vários indicadores abaixo da meta", c: "bg-rose-100 text-rose-700" };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50 to-white px-5 py-3">
        <h3 className="text-base font-bold text-slate-900">Atenção Primária à Saúde (Previne Brasil)</h3>
        <p className="text-xs text-slate-500">O mesmo assunto em 4 visões de gestão — escolha a profundidade.</p>
      </div>

      {/* pílulas das 4 visões */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
        {PILULAS.map((p) => {
          const Icon = p.icon;
          return (
            <button key={p.id} onClick={() => setV(p.id)} title={p.desc}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${v === p.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
              <Icon className="h-4 w-4" /> {p.label}
            </button>
          );
        })}
        <span className="ml-1 hidden items-center text-xs text-slate-400 sm:inline-flex">{PILULAS.find((p) => p.id === v)?.desc}</span>
      </div>

      <div className="p-5">
        {/* ESTRATÉGICO */}
        {v === "estrategico" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">Indicadores na meta</div>
                <div className="font-display text-3xl font-bold tabular-nums text-slate-900">{naMeta}<span className="text-lg text-slate-400">/{comMeta.length}</span></div>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${parecer.c}`}>{parecer.t}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Cobertura média do município</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900">{mediaMun.toFixed(1)}%</div>
                <div className="text-[11px] text-slate-500">média dos {comMeta.length} indicadores</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Pares do mesmo porte</div>
                <div className={`text-2xl font-bold tabular-nums ${mediaMun >= mediaPar ? "text-emerald-600" : "text-amber-600"}`}>{mediaPar.toFixed(1)}%</div>
                <div className="text-[11px] text-slate-500">{nome} está {mediaMun >= mediaPar ? "acima" : "abaixo"} ({(mediaMun - mediaPar >= 0 ? "+" : "") + (mediaMun - mediaPar).toFixed(1)} p.p.)</div>
              </div>
            </div>
            <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
              <b>Por que importa:</b> a Atenção Primária resolve a maioria dos problemas de saúde perto de casa e é financiada por desempenho — cada indicador na meta significa mais cuidado ao cidadão e mais repasse federal.
            </p>
          </div>
        )}

        {/* TÁTICO — composição e gargalo */}
        {v === "tatico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Do que a nota é feita: cada indicador que compõe a APS. Os de cima são os que mais puxam o resultado para baixo (o gargalo).</p>
            {piores.map((i) => (
              <div key={i.codigo}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="text-slate-700">{i.saber.emoji} {i.saber.curto}</span>
                  <span className="tabular-nums text-slate-500"><b className={COR[i.nv]}>{i.pct.toFixed(1)}%</b> / meta {i.meta}%</span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-slate-100">
                  <div className={`h-2.5 rounded-full ${BAR[i.nv]}`} style={{ width: `${Math.min(100, i.pct)}%` }} />
                  <div className="absolute inset-y-0" style={{ left: `${Math.min(100, i.meta)}%` }}><div className="h-2.5 w-px bg-slate-700" /></div>
                </div>
              </div>
            ))}
            {piores[0] && piores[0].nv !== "ok" && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><b>Maior gargalo:</b> {piores[0].saber.curto} ({piores[0].pct.toFixed(1)}% vs meta {piores[0].meta}%). Priorize este na visão Operacional.</p>
            )}
          </div>
        )}

        {/* OPERACIONAL — as fichas com "como melhorar" */}
        {v === "operacional" && <PrevineFicha dados={dados} nome={nome} />}

        {/* TÉCNICO — série, cálculo, fonte */}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">A prova de cada número: série por quadrimestre, numerador/denominador e fonte oficial.</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>Indicador</th><th className="text-center">Série (quadrimestres)</th><th className="text-right">Último (num/den)</th><th className="text-center">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {comMeta.map((i) => (
                    <tr key={i.codigo} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{i.saber.emoji} {i.saber.curto}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">{i.serie.map((s) => `${fmtComp(s.competencia)}: ${s.pct.toFixed(0)}%`).join("  ·  ")}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{i.numerador.toLocaleString("pt-BR")} / {i.denominador.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-500">{i.meta}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">Fonte: SISAB / Previne Brasil (Min. Saúde). Cálculo: numerador ÷ denominador, conforme a metodologia oficial de cada indicador. Competência: {dados.competenciaUlt}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
