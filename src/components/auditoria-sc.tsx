import { AlertTriangle, BadgeCheck, ClipboardList, Database, Gavel, ShieldAlert } from "lucide-react";
import type { DiagGestor } from "@/lib/queries";

type Radar = { dimensao: string; valor: number; bruto: string }[];
const PARECER = {
  ok: { rotulo: "Sem ressalvas", desc: "Indicadores dentro dos limites legais e da mediana dos pares.", chip: "bg-emerald-100 text-emerald-700" },
  ressalva: { rotulo: "Com ressalvas", desc: "Há pontos fora do parâmetro que merecem atenção e plano de correção.", chip: "bg-amber-100 text-amber-700" },
  critico: { rotulo: "Com apontamentos relevantes", desc: "Indicadores fora de limites legais — risco de apontamento em contas.", chip: "bg-rose-100 text-rose-700" },
};

export function AuditoriaSC({ data, radar }: { data: NonNullable<DiagGestor>; radar?: Radar }) {
  const eRisco = (p: { sugestao: string }) => /limite|déficit|abaixo do mínimo|acima do limite|recondução/i.test(p.sugestao);
  const risco = data.pontos.filter((p) => p.alerta && eRisco(p));
  const ressalva = data.pontos.filter((p) => p.alerta && !eRisco(p));
  const conforme = data.pontos.filter((p) => !p.alerta);
  const tom = risco.length ? "critico" : ressalva.length ? "ressalva" : "ok";
  const pc = PARECER[tom];
  const barCor = (v: number) => (v >= 60 ? "bg-emerald-500" : v >= 45 ? "bg-slate-400" : "bg-amber-500");

  return (
    <div className="space-y-4">
      {/* Parecer */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><Gavel className="h-4 w-4 text-amber-300" /> Parecer de auditoria — exercício {data.ano} ({data.grupo})</div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${pc.chip}`}>{pc.rotulo}</span>
        </div>
        <p className="mt-1.5 text-sm text-slate-200">{pc.desc} {risco.length + ressalva.length > 0 ? `${risco.length} risco(s) · ${ressalva.length} ressalva(s) · ` : ""}{conforme.length} item(ns) em conformidade.</p>
      </div>

      {/* Matriz de desempenho por área */}
      {radar && radar.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Matriz de desempenho por área</h3>
          <p className="mb-3 text-xs text-slate-500">Barra = posição vs pares de porte · o traço vertical é a <b>mediana do grupo (50)</b>; à direita é melhor.</p>
          <div className="space-y-2.5">
            {radar.map((d) => (
              <div key={d.dimensao}>
                <div className="flex items-center justify-between text-xs"><span className="text-slate-700">{d.dimensao}</span><span className="text-[11px] text-slate-400">{d.bruto}</span></div>
                <div className="relative mt-0.5 h-2.5 rounded-full bg-slate-100">
                  <div className={`h-2.5 rounded-full ${barCor(d.valor)}`} style={{ width: `${Math.min(100, Math.max(2, d.valor))}%` }} />
                  <div className="absolute top-[-2px] h-[14px] w-px bg-slate-500" style={{ left: "50%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achados */}
      {(risco.length > 0 || ressalva.length > 0) && (
        <div className="space-y-2">
          {[...risco.map((p) => ({ p, t: "risco" as const })), ...ressalva.map((p) => ({ p, t: "ressalva" as const }))].map(({ p, t }, i) => (
            <div key={i} className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${t === "risco" ? "border-l-rose-500" : "border-l-amber-400"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  {t === "risco" ? <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                  {p.titulo}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t === "risco" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{t === "risco" ? "RISCO" : "RESSALVA"}</span>
                </span>
                <span className="shrink-0 font-display text-base font-bold tabular-nums text-slate-900">{p.valor}</span>
              </div>
              <div className="mt-0.5 pl-[22px] text-[11px] text-slate-500">{p.ref}</div>
              {p.sugestao && <div className="mt-2 flex items-start gap-1 pl-[22px] text-sm text-slate-700"><ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" /> <span><b>Recomendação:</b> {p.sugestao}</span></div>}
            </div>
          ))}
        </div>
      )}

      {/* Conformidade / boas práticas */}
      {conforme.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><BadgeCheck className="h-4 w-4" /> Em conformidade / boas práticas ({conforme.length})</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {conforme.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-1.5 text-sm">
                <span className="text-slate-700">{p.titulo}</span>
                <span className="tabular-nums font-semibold text-emerald-700">{p.valor}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Regras ancoradas em LRF (pessoal/dívida), CF art. 212 (educação), LC 141 (saúde) e mediana dos pares de porte. Achados são pontos a verificar, não decisões de mérito. Integridade validada continuamente (registros inconsistentes excluídos).
      </p>
    </div>
  );
}
