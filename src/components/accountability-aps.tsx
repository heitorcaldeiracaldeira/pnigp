"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, CircleDollarSign, ClipboardList, HeartPulse, Activity, ShieldCheck, ShieldAlert, UserCheck, Plus } from "lucide-react";
import type { PrevineFichaSC, CaucSC } from "@/lib/queries";
import { PREVINE_SABER, nivelPrevine } from "@/lib/previne-saber";
import { fmtBRLCompact } from "@/lib/ui";

type Prev = NonNullable<PrevineFichaSC>;

// Calendário legal de prestação de contas (obrigações reais — base neutra, sem juízo).
const PRESTACAO = [
  { obr: "SIOPS — saúde", periodo: "bimestral", base: "LC 141/2012", verif: "CAUC/SIOPS" },
  { obr: "RREO (execução orçamentária)", periodo: "bimestral", base: "LRF art. 52", verif: "SICONFI" },
  { obr: "RGF (gestão fiscal)", periodo: "quadrimestral", base: "LRF art. 54-55", verif: "SICONFI" },
  { obr: "Audiência pública de metas", periodo: "quadrimestral", base: "LRF art. 9º §4º · LC 141 art. 36", verif: "local" },
  { obr: "Relatório Anual de Gestão ao Conselho", periodo: "anual", base: "LC 141 art. 36", verif: "local" },
];

export function AccountabilityAPS({ previne, apsValor, apsAno, saudePct, cauc, nome, cod }: {
  previne: Prev; apsValor: number | null; apsAno: number | null; saudePct: number | null; cauc: CaucSC; nome: string; cod: string;
}) {
  const inds = previne.indicadores.filter((i) => PREVINE_SABER[i.codigo]).map((i) => ({ ...i, meta: PREVINE_SABER[i.codigo].meta, saber: PREVINE_SABER[i.codigo], nv: nivelPrevine(i.pct, PREVINE_SABER[i.codigo].meta) }));
  const naMeta = inds.filter((i) => i.nv === "ok").length;
  const cobertura = inds.reduce((s, i) => s + i.pct, 0) / (inds.length || 1);
  const producao = inds.reduce((s, i) => s + i.numerador, 0); // volume de atendimentos registrados (proxy)

  const [resp, setResp] = useState<{ ano: number; texto: string }[]>([]);
  const [form, setForm] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/serie-anotacao?escopo=acc-aps&cod=${cod}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setResp(d.anotacoes || [])).catch(() => {});
  }, [cod]);
  async function salvar() {
    if (!form || !form.trim()) return;
    await fetch("/api/serie-anotacao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ escopo: "acc-aps", cod, ano: apsAno || 2025, texto: form.trim() }) }).catch(() => {});
    setResp((a) => [...a, { ano: apsAno || 2025, texto: form.trim() }]); setForm(null);
  }

  return (
    <div className="space-y-5">
      {/* CADEIA DE VALOR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">Cadeia de valor da APS — o dinheiro vira resultado?</h3>
        <p className="mt-1 text-sm text-slate-600">O caminho científico-gerencial: <b>recurso → produção → benefício</b>. É onde se vê se o investimento chega ao cidadão.</p>
        <div className="mt-4 grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {/* dinheiro */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><CircleDollarSign className="h-4 w-4" /> 💰 Dinheiro</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{apsValor != null ? fmtBRLCompact(apsValor) : "—"}</div>
            <div className="text-[11px] text-slate-500">repasse APS{apsAno ? ` (${apsAno})` : ""}{saudePct != null ? ` · ASPS ${saudePct.toFixed(1)}% (mín. 15%)` : ""}</div>
          </div>
          <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
          {/* produção */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800"><Activity className="h-4 w-4" /> 🏭 Produção</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{producao.toLocaleString("pt-BR")}</div>
            <div className="text-[11px] text-slate-500">atendimentos registrados (soma dos indicadores Previne)</div>
          </div>
          <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-5 w-5 text-slate-300" /></div>
          {/* benefício */}
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800"><HeartPulse className="h-4 w-4" /> ❤️ Benefício</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{cobertura.toFixed(0)}%</div>
            <div className="text-[11px] text-slate-500">cobertura média · {naMeta}/{inds.length} indicadores na meta</div>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <b>Leitura:</b> {apsValor != null ? `${fmtBRLCompact(apsValor)} em APS` : "o repasse de APS"} se converteu em {producao.toLocaleString("pt-BR")} atendimentos registrados e {cobertura.toFixed(0)}% de cobertura média.
          {naMeta < inds.length ? " A cadeia se rompe nos indicadores abaixo da meta — é onde priorizar (ver Atenção Primária → Operacional)." : " Cadeia saudável: recurso, produção e benefício alinhados."}
        </p>
      </div>

      {/* QUADRO DE ACCOUNTABILITY */}
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><ClipboardList className="h-5 w-5 text-slate-600" /> Quadro de Accountability — prometeu → entregou → provou</h3>

        {/* responsável (registro local) */}
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><UserCheck className="h-3.5 w-3.5" /> Quem responde por esta área</span>
            <button onClick={() => setForm("")} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"><Plus className="h-3 w-3" /> registrar</button>
          </div>
          {resp.length ? <ul className="mt-1.5 space-y-0.5">{resp.map((r, i) => <li key={i} className="text-xs text-slate-700">• {r.texto}</li>)}</ul>
            : <p className="mt-1 text-[11px] text-slate-400">Sem responsável registrado. Use “registrar” para informar a secretaria/gestor responsável (memória institucional, com data).</p>}
          {form !== null && (
            <div className="mt-2 flex gap-2">
              <input value={form} onChange={(e) => setForm(e.target.value)} placeholder="ex.: Secretaria Municipal de Saúde — responsável: Fulano (Plano Mun. de Saúde 2025)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <button onClick={salvar} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
              <button onClick={() => setForm(null)} className="rounded-lg px-2 text-sm text-slate-500">x</button>
            </div>
          )}
        </div>

        {/* compromisso x entregue */}
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-700">Compromisso × Entregue (indicadores do Previne)</div>
          <div className="mt-1.5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Indicador</th><th className="text-right">Meta</th><th className="text-right">Entregue</th><th className="text-right">Lacuna</th></tr></thead>
              <tbody>
                {inds.map((i) => (
                  <tr key={i.codigo} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-700">{i.saber.emoji} {i.saber.curto}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{i.meta}%</td>
                    <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${i.nv === "ok" ? "text-emerald-600" : i.nv === "warn" ? "text-amber-600" : "text-rose-600"}`}>{i.pct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{i.pct >= i.meta ? "✓" : `−${(i.meta - i.pct).toFixed(1)} p.p.`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* regularidade CAUC + calendário */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className={`rounded-xl border p-3 ${cauc?.apto ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">{cauc?.apto ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> : <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />} Regularidade p/ receber (CAUC)</div>
            {cauc ? (
              <>
                <div className={`mt-0.5 text-lg font-bold ${cauc.apto ? "text-emerald-700" : "text-rose-700"}`}>{cauc.apto ? "Apto" : `${cauc.nPendencias} pendência(s)`}</div>
                <div className="text-[11px] text-slate-500">{cauc.apto ? "sem pendências p/ transferências voluntárias" : cauc.grupos.slice(0, 3).join(" · ")}{cauc.dataPesquisa ? ` · ${cauc.dataPesquisa}` : ""}</div>
              </>
            ) : <div className="mt-0.5 text-sm text-slate-400">sem dado CAUC</div>}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><CalendarClock className="h-3.5 w-3.5" /> Calendário legal de prestação</div>
            <ul className="mt-1 space-y-0.5">
              {PRESTACAO.map((p) => (
                <li key={p.obr} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{p.obr} <span className="text-slate-400">· {p.periodo}</span></span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${p.verif === "local" ? "bg-slate-100 text-slate-500" : "bg-sky-100 text-sky-700"}`}>{p.verif === "local" ? "confirmar local" : p.verif}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500"><BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Dado oficial: repasse (FNS), indicadores (SISAB/Previne), regularidade (CAUC/Tesouro). Responsável e metas do plano: registro local auditável. Bases legais citadas; tom neutro.</p>
      </div>
    </div>
  );
}
