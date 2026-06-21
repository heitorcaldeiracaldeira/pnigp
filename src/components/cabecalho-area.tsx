import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Layers, Scale } from "lucide-react";
import type { Insight } from "@/lib/insights-sc";

// Cabeçalho FRACTAL de área: repete o padrão de camadas (Estratégico→Tático→Operacional) dentro do bloco.
// Ensina gestão: como a área está (aqui) · o que fazer (plano da área) · onde aprofundar (links).
type Nivel = "ok" | "warn" | "bad";
const DOT: Record<Nivel, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500" };
const COR: Record<Nivel, string> = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-rose-600" };
const PILL: Record<Nivel, string> = { ok: "bg-emerald-100 text-emerald-700", warn: "bg-amber-100 text-amber-700", bad: "bg-rose-100 text-rose-700" };
const ROTULO: Record<Nivel, string> = { ok: "dentro da lei", warn: "atenção", bad: "abaixo do exigido" };
const SEVDOT = { critico: "bg-rose-500", atencao: "bg-amber-500", oportunidade: "bg-sky-500", destaque: "bg-emerald-500" } as const;

export type Conformidade = { label: string; valor: number; ancora: string; nivel: Nivel } | null;
export type IndicadorChave = { label: string; valor: string; sub?: string };

export function CabecalhoArea({
  titulo, intro, conformidade, indicadores = [], insights = [], links = [],
}: {
  titulo: string;
  intro: string;
  conformidade?: Conformidade;
  indicadores?: IndicadorChave[];
  insights?: Insight[];
  links?: { label: string; href: string }[];
}) {
  const atencoes = insights.filter((i) => i.severidade === "critico" || i.severidade === "atencao");
  const plano = insights.filter((i) => i.acao);

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* faixa título + parecer da área */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-5 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Layers className="h-4 w-4 text-slate-400" /> {titulo} <span className="text-sm font-normal text-slate-400">— em camadas</span></h2>
        {conformidade && (
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${PILL[conformidade.nivel]}`}>
            {conformidade.nivel === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {ROTULO[conformidade.nivel]}
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">{intro}</p>

        {/* ESTRATÉGICO da área: conformidade + indicadores-chave */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {conformidade && (
            <div className={`rounded-xl border p-3 ${conformidade.nivel === "ok" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Scale className="h-3.5 w-3.5" /> {conformidade.label}</div>
              <div className={`mt-0.5 text-2xl font-bold tabular-nums ${COR[conformidade.nivel]}`}>{conformidade.valor.toFixed(1)}%</div>
              <div className="text-[11px] text-slate-500">{conformidade.ancora}</div>
            </div>
          )}
          {indicadores.map((ind) => (
            <div key={ind.label} className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">{ind.label}</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{ind.valor}</div>
              {ind.sub && <div className="text-[11px] text-slate-500">{ind.sub}</div>}
            </div>
          ))}
        </div>

        {/* atenções da área */}
        {atencoes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Atenção nesta área</div>
            <ul className="mt-1.5 space-y-1">
              {atencoes.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVDOT[a.severidade]}`} /><span><b>{a.titulo}</b> — {a.detalhe}</span></li>
              ))}
            </ul>
          </div>
        )}

        {/* plano da área (ações) */}
        {plano.length > 0 && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-800"><ClipboardList className="h-3.5 w-3.5" /> O que fazer nesta área</div>
            <ol className="mt-1.5 space-y-1.5">
              {plano.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">{i + 1}</span>
                  <span><b>{p.acao}</b> <span className="text-slate-500">— {p.detalhe}</span></span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* aprofunde: links pro tático/operacional (camadas conectadas) */}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Aprofunde:</span>
            {links.map((l) => (
              <a key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                {l.label} <ArrowRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
        <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">Indicadores e conformidade a partir de dados oficiais (SICONFI, SIOPS, DATASUS, IBGE). Detalhe e fonte de cada número nas seções abaixo.</p>
      </div>
    </div>
  );
}
