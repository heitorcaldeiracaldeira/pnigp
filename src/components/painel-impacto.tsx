"use client";

// Painel de impacto + escalonamento — o ROI do serviço de notificação: alertas ativos, o que escalou (crítico sem
// tratar há +30 dias sobe para o gabinete) e o resultado (resolvidos / recurso destravado / captado). É o que a i10
// mostra na renovação do contrato: "das N pendências, X foram resolvidas e R$Y destravados".
import { Activity, ArrowUpCircle, Trophy, Users } from "lucide-react";

type Resumo = { ativos: number; criticosAtivos: number; escalonados: number; cadastrados: number; impacto: { tipo: string; n: number; valor: number }[]; valorImpacto: number } | null;
const brl = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : `R$ ${v.toFixed(0)}`);
const ROTULO: Record<string, string> = { resolvido: "Resolvidos", recurso_destravado: "Recurso destravado", recurso_captado: "Recurso captado" };

export function PainelImpacto({ resumo }: { resumo: Resumo }) {
  if (!resumo) return null;
  const { ativos, criticosAtivos, escalonados, cadastrados, impacto, valorImpacto } = resumo;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Activity className="h-4 w-4 text-teal-600" /> Painel de monitoramento & impacto</h3>
      <p className="mt-1 text-[11px] text-slate-500">O ciclo do serviço: detectar → notificar → <b>resolver</b> → medir. É o retorno que a gestão acompanha e que o Instituto i10 reporta.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Activity className="h-3 w-3" /> Alertas ativos</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-800">{ativos}</div>
          {criticosAtivos > 0 && <div className="text-[10px] font-semibold text-rose-600">{criticosAtivos} crítico(s)</div>}
        </div>
        <div className={`rounded-xl border p-3 ${escalonados > 0 ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/60"}`}>
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><ArrowUpCircle className="h-3 w-3" /> Escalonados</div>
          <div className={`font-display text-xl font-bold tabular-nums ${escalonados > 0 ? "text-rose-700" : "text-slate-400"}`}>{escalonados}</div>
          <div className="text-[9px] text-slate-400">crítico +30d → gabinete</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Trophy className="h-3 w-3" /> Impacto</div>
          <div className="font-display text-xl font-bold tabular-nums text-emerald-700">{valorImpacto > 0 ? brl(valorImpacto) : "—"}</div>
          <div className="text-[9px] text-slate-400">destravado + captado</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Users className="h-3 w-3" /> Equipe cadastrada</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-800">{cadastrados}</div>
          <div className="text-[9px] text-slate-400">servidores recebendo</div>
        </div>
      </div>

      {impacto.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {impacto.map((i) => (
            <span key={i.tipo} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">{ROTULO[i.tipo] || i.tipo}: <b>{i.n}</b>{i.valor > 0 ? ` · ${brl(i.valor)}` : ""}</span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-400">Ainda sem impacto registrado. Conforme os alertas forem <b>resolvidos</b> (e o recurso destravado/captado), o histórico aparece aqui — a base do relatório de resultado do serviço.</p>
      )}

      <p className="mt-3 text-[10px] text-slate-400"><b>Escalonamento (SLA):</b> alerta crítico não tratado em 30 dias sobe automaticamente do servidor para o secretário e o gabinete — garante que o urgente não fique parado.</p>
    </section>
  );
}
