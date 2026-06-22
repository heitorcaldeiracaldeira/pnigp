"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, BarChart3, BookOpen, ClipboardCheck, CircleDollarSign, Database, Gauge, GraduationCap, Users } from "lucide-react";
import type { EducacaoSerieSC, EducacaoSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";
const PIL: { id: Visao; label: string; icon: typeof Gauge; desc: string }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge, desc: "Dinheiro → produção → benefício" },
  { id: "tatico", label: "Tático", icon: BarChart3, desc: "Aplicação (MDE/FUNDEB)" },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck, desc: "O que fazer para melhorar" },
  { id: "tecnico", label: "Técnico", icon: Database, desc: "Série, valores e fonte" },
];
const COMO_MELHORAR = [
  "Alfabetizar na idade certa (até o 2º ano) — programas de reforço e avaliação diagnóstica.",
  "Busca ativa de crianças fora da escola e combate à evasão (Censo + visita).",
  "Formação continuada e valorização dos professores.",
  "Aplicar o FUNDEB com foco em sala de aula (mín. 70% na remuneração dos profissionais).",
  "Cumprir os 25% de MDE com qualidade do gasto (priorizar ensino, não meio).",
];

export function AssuntoEducacao({ serie, edu, fundebValor, matriculas, nome }: { serie: EducacaoSerieSC; edu: NonNullable<EducacaoSC>; fundebValor: number | null; matriculas?: number | null; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const u = serie[serie.length - 1];
  const educPct = u?.educPct ?? edu.educPct ?? 0;
  const nvMDE = educPct >= 25 ? "ok" : educPct >= 24 ? "warn" : "bad";
  const corMDE = nvMDE === "ok" ? "text-emerald-600" : nvMDE === "warn" ? "text-amber-600" : "text-rose-600";
  const alfabOk = edu.alfab != null && edu.alfab >= edu.alfabPares;
  const parecer = nvMDE === "ok" ? { t: "Cumpre o mínimo constitucional (25%)", c: "bg-emerald-100 text-emerald-700" } : { t: "Abaixo do mínimo de 25% (CF art. 212)", c: "bg-rose-100 text-rose-700" };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-amber-50 to-white px-5 py-3"><h3 className="text-base font-bold text-slate-900">🎓 Educação</h3><p className="text-xs text-slate-500">Aplicação obrigatória, financiamento e resultado, em 4 visões de gestão.</p></div>
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
        {PIL.map((p) => { const Icon = p.icon; return <button key={p.id} onClick={() => setV(p.id)} title={p.desc} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${v === p.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}><Icon className="h-4 w-4" /> {p.label}</button>; })}
      </div>

      <div className="p-5">
        {v === "estrategico" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs text-slate-500">Aplicação em educação (MDE) {u ? `· ${u.ano}` : ""}</div><div className={`font-display text-3xl font-bold tabular-nums ${corMDE}`}>{educPct.toFixed(1)}%</div><div className="text-[11px] text-slate-500">mínimo 25% — CF art. 212</div></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${parecer.c}`}>{parecer.t}</span></div>
            {/* cadeia de valor */}
            <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"><div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><CircleDollarSign className="h-4 w-4" /> 💰 Dinheiro</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{u ? fmtBRLCompact(u.educValor) : "—"}</div><div className="text-[11px] text-slate-500">MDE aplicado{fundebValor ? ` · FUNDEB ${fmtBRLCompact(fundebValor)}` : ""}</div></div>
              <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Users className="h-4 w-4" /> 🏭 Produção</div>{matriculas ? <><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{matriculas.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-500">matrículas na rede municipal (Censo)</div></> : <><div className="mt-1 text-lg font-bold text-slate-400">matrículas</div><div className="text-[11px] text-slate-400">Censo Escolar/INEP — a coletar</div></>}</div>
              <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800"><GraduationCap className="h-4 w-4" /> ❤️ Benefício</div><div className={`mt-1 text-2xl font-bold tabular-nums ${alfabOk ? "text-emerald-600" : "text-amber-600"}`}>{edu.alfab != null ? `${edu.alfab.toFixed(1)}%` : "—"}</div><div className="text-[11px] text-slate-500">alfabetização · pares: {edu.alfabPares.toFixed(1)}%</div></div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>Leitura:</b> {nome} aplica {educPct.toFixed(0)}% em educação ({nvMDE === "ok" ? "cumpre" : "abaixo de"} 25%) e tem {edu.alfab != null ? `${edu.alfab.toFixed(0)}% de alfabetização` : "alfabetização não disponível"}.{matriculas ? ` Esse dinheiro atende ${matriculas.toLocaleString("pt-BR")} matrículas na rede municipal (Censo).` : " O elo de produção (matrículas, IDEB) será completado com o Censo Escolar/INEP."}</p>
          </div>
        )}
        {v === "tatico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Aplicação obrigatória ({u?.ano}):</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">MDE — Manutenção e Desenvolvimento do Ensino</div><div className={`text-2xl font-bold tabular-nums ${corMDE}`}>{educPct.toFixed(1)}%</div><div className="text-[11px] text-slate-500">mín. 25% · {u ? fmtBRLCompact(u.educValor) : ""}</div></div>
              <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">FUNDEB (aplicação)</div><div className="text-2xl font-bold tabular-nums text-slate-900">{u?.fundebPct != null ? `${u.fundebPct.toFixed(1)}%` : "—"}</div><div className="text-[11px] text-slate-500">mín. 70% na remuneração dos profissionais</div></div>
            </div>
          </div>
        )}
        {v === "operacional" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><BookOpen className="h-4 w-4" /> Como melhorar a educação</p>
            <ol className="mt-2 space-y-1.5">{COMO_MELHORAR.map((p, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{i + 1}</span>{p}</li>)}</ol>
          </div>
        )}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Série da aplicação em educação (MDE) por ano.</p>
            {serie.length >= 2 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={serie} margin={{ top: 6, right: 12, left: 4, bottom: 2 }}>
                  <defs><linearGradient id="gEdu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d97706" stopOpacity={0.5} /><stop offset="100%" stopColor="#d97706" stopOpacity={0.05} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis unit="%" domain={[0, 40]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v2) => [`${Number(v2).toFixed(1)}%`, "MDE"]} />
                  <Area type="monotone" dataKey="educPct" stroke="#d97706" strokeWidth={2} fill="url(#gEdu)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Ano</th><th className="text-right">MDE %</th><th className="text-right">MDE R$</th><th className="text-right">FUNDEB %</th></tr></thead><tbody>
              {serie.map((r) => <tr key={r.ano} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.ano}</td><td className={`px-3 py-1.5 text-right tabular-nums ${r.educPct >= 25 ? "text-emerald-600" : "text-rose-600"}`}>{r.educPct.toFixed(1)}%</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtBRLCompact(r.educValor)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.fundebPct != null ? `${r.fundebPct.toFixed(1)}%` : "—"}</td></tr>)}
            </tbody></table></div>
            <p className="text-[11px] text-slate-500">Fonte: SICONFI (RREO Anexo 08 — educação) · alfabetização: IBGE Censo 2022. Matrículas e IDEB (INEP) a integrar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
