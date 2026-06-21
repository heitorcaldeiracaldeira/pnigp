"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowRight, BarChart3, BookOpen, ClipboardCheck, CircleDollarSign, Database, Gauge, HeartPulse } from "lucide-react";
import type { MacProducaoSC } from "@/lib/queries";
import { SABER_REPASSE } from "@/lib/saude-repasses-saber";
import { fmtBRLCompact } from "@/lib/ui";

type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";
const PILULAS: { id: Visao; label: string; icon: typeof Gauge; desc: string }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge, desc: "Dinheiro → produção → benefício" },
  { id: "tatico", label: "Tático", icon: BarChart3, desc: "Hospitalar × ambulatorial" },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck, desc: "O que fazer para melhorar" },
  { id: "tecnico", label: "Técnico", icon: Database, desc: "Série, variação e fonte" },
];
const nf = (n: number) => n.toLocaleString("pt-BR");

export function AssuntoMAC({ producao, repasseValor, repasseAno, internMil, internMilPares, nome }: {
  producao: MacProducaoSC; repasseValor: number | null; repasseAno: number | null; internMil: number; internMilPares: number; nome: string;
}) {
  const [v, setV] = useState<Visao>("estrategico");
  const saber = SABER_REPASSE.mac;
  if (!producao.length) return null;
  const ult = producao[producao.length - 1], ini = producao[0];
  const tendInt = ini.internacoes > 0 ? ((ult.internacoes - ini.internacoes) / ini.internacoes) * 100 : 0;
  const tendSia = ini.siaQtd > 0 ? ((ult.siaQtd - ini.siaQtd) / ini.siaQtd) * 100 : 0;
  const acessoOk = internMil >= internMilPares;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-rose-50 to-white px-5 py-3">
        <h3 className="text-base font-bold text-slate-900">{saber.emoji} {saber.nome}</h3>
        <p className="text-xs text-slate-500">Consultas especializadas, exames, cirurgias e internações — em 4 visões de gestão.</p>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
        {PILULAS.map((p) => { const Icon = p.icon; return (
          <button key={p.id} onClick={() => setV(p.id)} title={p.desc} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${v === p.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
            <Icon className="h-4 w-4" /> {p.label}
          </button>
        ); })}
        <span className="ml-1 hidden items-center text-xs text-slate-400 sm:inline-flex">{PILULAS.find((p) => p.id === v)?.desc}</span>
      </div>

      <div className="p-5">
        {/* ESTRATÉGICO — cadeia de valor */}
        {v === "estrategico" && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
              <p className="text-slate-700"><b className="text-slate-900">O que é:</b> {saber.oQueE}</p>
              <p className="text-slate-700"><b className="text-slate-900">Por que importa:</b> {saber.porQueImporta}</p>
            </div>
            <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><CircleDollarSign className="h-4 w-4" /> 💰 Dinheiro</div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{repasseValor != null ? fmtBRLCompact(repasseValor) : fmtBRLCompact(ult.sihValor + ult.siaValor)}</div>
                <div className="text-[11px] text-slate-500">{repasseValor != null ? `repasse MAC (${repasseAno})` : "produção paga (SIH+SIA)"}</div>
              </div>
              <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800"><Activity className="h-4 w-4" /> 🏭 Produção</div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{nf(ult.internacoes)}</div>
                <div className="text-[11px] text-slate-500">internações + {nf(ult.siaQtd)} proc. ambulatoriais ({ult.ano})</div>
              </div>
              <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800"><HeartPulse className="h-4 w-4" /> ❤️ Benefício</div>
                <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${acessoOk ? "text-emerald-600" : "text-amber-600"}`}>{internMil.toFixed(1)}</div>
                <div className="text-[11px] text-slate-500">internações/mil hab · pares: {internMilPares.toFixed(1)}</div>
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <b>Leitura:</b> a alta/média complexidade entregou {nf(ult.internacoes)} internações e {nf(ult.siaQtd)} procedimentos ambulatoriais em {ult.ano}, com acesso de {internMil.toFixed(1)} internações/mil hab ({acessoOk ? "acima" : "abaixo"} dos pares). {acessoOk ? "Cadeia saudável." : "Acesso abaixo dos pares — ver Operacional para ampliar produção/pactuação."}
            </p>
          </div>
        )}

        {/* TÁTICO — composição */}
        {v === "tatico" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-700">🏥 Hospitalar (SIH)</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{nf(ult.internacoes)}</div>
              <div className="text-[11px] text-slate-500">internações · {fmtBRLCompact(ult.sihValor)} · {tendInt >= 0 ? "+" : ""}{tendInt.toFixed(0)}% desde {ini.ano}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-700">🩻 Ambulatorial (SIA)</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{nf(ult.siaQtd)}</div>
              <div className="text-[11px] text-slate-500">procedimentos · {fmtBRLCompact(ult.siaValor)} · {tendSia >= 0 ? "+" : ""}{tendSia.toFixed(0)}% desde {ini.ano}</div>
            </div>
            <p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">A MAC se divide entre hospitalar (internações/cirurgias) e ambulatorial (consultas/exames especializados). O equilíbrio mostra onde está a capacidade — e o gargalo de acesso.</p>
          </div>
        )}

        {/* OPERACIONAL */}
        {v === "operacional" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><BookOpen className="h-4 w-4" /> Como melhorar a Média e Alta Complexidade</p>
            <p className="mt-1 text-xs text-slate-600">{saber.porQueImporta}</p>
            <ol className="mt-2 space-y-1.5">
              {saber.comoMelhorar.map((passo, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{i + 1}</span>{passo}</li>
              ))}
            </ol>
          </div>
        )}

        {/* TÉCNICO — série + variação por ano */}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Produção por ano, com a variação a cada ano (o que de fato mudou na ponta).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 text-xs font-semibold text-slate-700">🏥 Internações (SIH) por ano</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={producao} margin={{ top: 6, right: 12, left: 4, bottom: 2 }}>
                    <defs><linearGradient id="gSih" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e11d48" stopOpacity={0.5} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.05} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => nf(Number(v))} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [nf(Number(v)), "internações"]} />
                    <Area type="monotone" dataKey="internacoes" stroke="#e11d48" strokeWidth={2} fill="url(#gSih)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 text-xs font-semibold text-slate-700">🩻 Procedimentos ambulatoriais (SIA) por ano</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={producao} margin={{ top: 6, right: 12, left: 4, bottom: 2 }}>
                    <defs><linearGradient id="gSia" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => Number(v) >= 1e6 ? (Number(v) / 1e6).toFixed(0) + "M" : nf(Number(v))} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [nf(Number(v)), "procedimentos"]} />
                    <Area type="monotone" dataKey="siaQtd" stroke="#2563eb" strokeWidth={2} fill="url(#gSia)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Ano</th><th className="text-right">Internações</th><th className="text-right">Δ</th><th className="text-right">Proc. ambulatoriais</th><th className="text-right">Δ</th><th className="text-right">Valor (SIH+SIA)</th></tr></thead>
                <tbody>
                  {producao.map((r, idx) => {
                    const dInt = idx > 0 ? r.internacoes - producao[idx - 1].internacoes : 0;
                    const dSia = idx > 0 ? r.siaQtd - producao[idx - 1].siaQtd : 0;
                    return (
                      <tr key={r.ano} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{r.ano}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{nf(r.internacoes)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${dInt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{idx > 0 ? `${dInt >= 0 ? "▲+" : "▼"}${nf(dInt)}` : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{nf(r.siaQtd)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${dSia >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{idx > 0 ? `${dSia >= 0 ? "▲+" : "▼"}${nf(dSia)}` : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtBRLCompact(r.sihValor + r.siaValor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">Fonte: SIH/SIA-SUS (DATASUS). Valor = produção aprovada (proxy do repasse MAC por produção).</p>
          </div>
        )}
      </div>
    </div>
  );
}
