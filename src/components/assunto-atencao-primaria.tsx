"use client";

import { Fragment, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ClipboardCheck, Database, Gauge, LineChart as LineIcon } from "lucide-react";
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
// o que o numerador conta (a "produção" de cada indicador)
const UNIDADE: Record<string, string> = {
  "10": "gestantes com 6+ consultas", "20": "gestantes testadas", "30": "gestantes c/ atend. odontológico",
  "40": "exames citopatológicos", "50": "crianças vacinadas", "70": "exames de HbA1c",
};

export function AssuntoAtencaoPrimaria({ dados, nome, cod }: { dados: Dados; nome: string; cod: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const [causas, setCausas] = useState<{ ano: number; texto: string }[]>([]);
  const [formEv, setFormEv] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  useEffect(() => { fetch(`/api/serie-anotacao?escopo=causa-aps&cod=${cod}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setCausas(d.anotacoes || [])).catch(() => {}); }, [cod]);
  async function salvarCausa(label: string) {
    if (!txt.trim()) return;
    const texto = `${label} — ${txt.trim()}`;
    await fetch("/api/serie-anotacao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ escopo: "causa-aps", cod, ano: 2024, texto }) }).catch(() => {});
    setCausas((c) => [...c, { ano: 2024, texto }]); setFormEv(null); setTxt("");
  }
  const inds = dados.indicadores.filter((i) => PREVINE_SABER[i.codigo]);
  const comMeta = inds.map((i) => ({ ...i, meta: PREVINE_SABER[i.codigo].meta, nv: nivelPrevine(i.pct, PREVINE_SABER[i.codigo].meta), saber: PREVINE_SABER[i.codigo] }));
  const naMeta = comMeta.filter((i) => i.nv === "ok").length;
  const piores = [...comMeta].sort((a, b) => a.pct / a.meta - b.pct / b.meta);
  const mediaMun = comMeta.reduce((s, i) => s + i.pct, 0) / (comMeta.length || 1);
  const mediaPar = comMeta.reduce((s, i) => s + i.paresPct, 0) / (comMeta.length || 1);
  const CORES = ["#0d9488", "#2563eb", "#db2777", "#d97706", "#7c3aed", "#16a34a"];
  const comps = [...new Set(comMeta.flatMap((i) => i.serie.map((s) => s.competencia)))].sort();
  const evol = comps.map((c) => { const row: Record<string, number | string> = { competencia: fmtComp(c) }; comMeta.forEach((i) => { const p = i.serie.find((s) => s.competencia === c); if (p) row[i.saber.curto] = p.pct; }); return row; });
  // leitura pedagógica da evolução (fato neutro + como ler)
  const trends = comMeta.map((i) => ({ i, d: i.serie.length >= 2 ? i.pct - i.serie[0].pct : 0 }));
  const melhoraram = trends.filter((t) => t.d > 0.5);
  const recuaram = trends.filter((t) => t.d < -0.5);
  const maiorAlta = [...trends].sort((a, b) => b.d - a.d)[0];
  const maiorQueda = [...trends].sort((a, b) => a.d - b.d)[0];
  // EVENTOS: cada variação de produção entre quadrimestres (fato → causa provável → ação)
  const eventos = comMeta.flatMap((i) => i.serie.slice(1).map((s, idx) => ({ i, comp: s.competencia, compAnt: i.serie[idx].competencia, delta: s.numerador - i.serie[idx].numerador })))
    .filter((e) => e.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
  const causaProvavel = (delta: number) => delta < 0
    ? "Queda na produção registrada. Causa provável: subnotificação no e-SUS, falta de insumo/equipe ou menor procura — verifique o registro antes de concluir."
    : "Aumento na produção. Provável efeito de busca ativa, mais cadastro ou melhor registro — boa prática a manter.";
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
            <p className="text-sm text-slate-600">A prova de cada número: evolução por quadrimestre, numerador/denominador e fonte oficial.</p>
            {evol.length >= 2 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><LineIcon className="h-3.5 w-3.5" /> Evolução dos indicadores (% por quadrimestre)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={evol} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="competencia" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                    <YAxis unit="%" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n as string]} />
                    {comMeta.map((i, idx) => <Line key={i.codigo} type="monotone" dataKey={i.saber.curto} stroke={CORES[idx % CORES.length]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />)}
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {comMeta.map((i, idx) => <span key={i.codigo} className="inline-flex items-center gap-1 text-[10px] text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: CORES[idx % CORES.length] }} /> {i.saber.curto}</span>)}
                </div>
                {/* leitura pedagógica da evolução (fato + como ler, tom neutro) */}
                {maiorAlta && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-700"><span className="mr-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Fato</span>
                      No período: <b>{melhoraram.length}</b> indicador(es) melhoraram e <b>{recuaram.length}</b> recuaram.
                      {maiorAlta.d > 0.5 && <> Maior alta: <b>{maiorAlta.i.saber.curto}</b> (+{maiorAlta.d.toFixed(1)} p.p.).</>}
                      {maiorQueda.d < -0.5 && <> Maior recuo: <b>{maiorQueda.i.saber.curto}</b> ({maiorQueda.d.toFixed(1)} p.p.).</>}
                    </p>
                    <p className="text-xs text-slate-700"><span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Como ler</span>
                      No Previne, altas vêm de mais cadastro, busca ativa e melhor registro no e-SUS; recuos muitas vezes são queda de <b>registro</b> (e não de atendimento) — confira o registro antes de concluir. Para subir cada um, veja a visão <b>Operacional</b> (“como melhorar”).
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-3 text-xs font-semibold text-slate-700">📦 Atendimentos e exames realizados — e quanto mudou a cada quadrimestre</div>
              <div className="space-y-3.5">
                {comMeta.map((i) => (
                  <div key={i.codigo}>
                    <div className="mb-1 text-xs font-medium text-slate-700">{i.saber.emoji} {i.saber.curto} <span className="text-[10px] font-normal text-slate-400">· {UNIDADE[i.codigo] || "registros"}</span></div>
                    <div className="flex items-stretch gap-1">
                      {i.serie.map((s, idx) => {
                        const d = idx > 0 ? s.numerador - i.serie[idx - 1].numerador : 0;
                        return (
                          <Fragment key={s.competencia}>
                            {idx > 0 && (
                              <div className="flex w-14 shrink-0 flex-col items-center justify-center">
                                <span className={`text-[11px] font-bold ${d >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{d >= 0 ? "▲ +" : "▼ −"}{Math.abs(d).toLocaleString("pt-BR")}</span>
                                <span className="text-slate-300">→</span>
                              </div>
                            )}
                            <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                              <div className="text-base font-bold tabular-nums text-slate-800">{s.numerador.toLocaleString("pt-BR")}</div>
                              <div className="text-[10px] text-slate-500">{fmtComp(s.competencia)}</div>
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Cada caixa = total realizado no quadrimestre. Entre elas, quanto <b className="text-emerald-600">aumentou (▲)</b> ou <b className="text-rose-500">diminuiu (▼)</b>. Fonte: e-SUS / SISAB.</p>
            </div>
            {eventos.length > 0 && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-3">
                <div className="mb-2 text-xs font-semibold text-teal-800">🧭 Diário de gestão — evento → por quê → o que fazer (confira e, se quiser, registre a causa real)</div>
                <div className="space-y-2">
                  {eventos.map((e) => {
                    const label = `${e.i.saber.curto} (${fmtComp(e.compAnt)}→${fmtComp(e.comp)})`;
                    return (
                      <div key={label} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{e.i.saber.emoji} {e.i.saber.curto}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{e.delta >= 0 ? "▲ +" : "▼ "}{e.delta.toLocaleString("pt-BR")} {UNIDADE[e.i.codigo] || ""}</span>
                          <span className="text-[10px] text-slate-400">{fmtComp(e.compAnt)} → {fmtComp(e.comp)}</span>
                        </div>
                        <p className="mt-1 text-slate-600"><span className="font-semibold text-violet-700">Por quê (provável):</span> {causaProvavel(e.delta)}</p>
                        <p className="mt-0.5 text-slate-600"><span className="font-semibold text-teal-700">O que fazer:</span> {e.i.saber.comoMelhorar[0]}</p>
                        {causas.filter((c) => c.texto.startsWith(label)).map((c, ci) => <p key={ci} className="mt-0.5 text-emerald-700">✓ Registrado: {c.texto.replace(label + " — ", "")}</p>)}
                        {formEv === label ? (
                          <div className="mt-1.5 flex gap-1.5">
                            <input value={txt} onChange={(e2) => setTxt(e2.target.value)} placeholder="o que aconteceu de verdade neste período?" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                            <button onClick={() => salvarCausa(label)} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white">Salvar</button>
                            <button onClick={() => { setFormEv(null); setTxt(""); }} className="px-1 text-slate-400">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setFormEv(label); setTxt(""); }} className="mt-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">+ registrar a causa real</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2">
              {comMeta.map((i) => {
                return (
                  <div key={i.codigo} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{i.saber.emoji} {i.saber.curto}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.nv === "ok" ? "bg-emerald-100 text-emerald-700" : i.nv === "warn" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                        {i.nv === "ok" ? "✓ Atingiu a meta" : i.nv === "warn" ? "Quase na meta" : "Abaixo da meta"}
                      </span>
                    </div>
                    {/* barra: desempenho atual com marcador da meta */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-3 rounded-full ${BAR[i.nv]}`} style={{ width: `${Math.min(100, i.pct)}%` }} />
                        <div className="absolute inset-y-0" style={{ left: `${Math.min(100, i.meta)}%` }} title={`meta ${i.meta}%`}><div className="h-3 w-0.5 bg-slate-800" /></div>
                      </div>
                      <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">{i.pct.toFixed(0)}%<span className="text-[10px] font-normal text-slate-400"> /{i.meta}%</span></span>
                    </div>
                    {/* série por quadrimestre com tendência */}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {i.serie.map((s, idx) => {
                        const d = idx > 0 ? s.pct - i.serie[idx - 1].pct : 0;
                        return (
                          <span key={s.competencia} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
                            <span className="text-slate-400">{fmtComp(s.competencia)}</span> {s.pct.toFixed(0)}%
                            {idx > 0 && <b className={d >= 0 ? "text-emerald-600" : "text-rose-500"}>{d >= 0 ? "▲" : "▼"}{Math.abs(d).toFixed(0)}</b>}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500"><b className="tabular-nums text-slate-700">{i.numerador.toLocaleString("pt-BR")}</b> de {i.denominador.toLocaleString("pt-BR")} {UNIDADE[i.codigo] || "registros"}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">Fonte: SISAB / Previne Brasil (Min. Saúde). Cálculo: numerador ÷ denominador, conforme a metodologia oficial de cada indicador. Competência: {dados.competenciaUlt}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
