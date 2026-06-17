"use client";

import { useState } from "react";
import { CheckCircle2, Flag, Target, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { fmtValor } from "@/lib/ui";

type Meta = {
  codigo: string;
  nome: string;
  unidade: string;
  direcao_melhor: "alta" | "baixa";
  valor_atual: number;
  valor_alvo: number;
  valor_base: number;
  ano_alvo: number;
  descricao: string;
};

type Status = "atingida" | "nocaminho" | "atencao" | "risco";

const STATUS: Record<Status, { label: string; dot: string; chip: string; bar: string }> = {
  atingida: { label: "Atingida", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  nocaminho: { label: "No caminho", dot: "bg-teal-500", chip: "bg-teal-100 text-teal-700", bar: "bg-teal-500" },
  atencao: { label: "Atenção", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  risco: { label: "Em risco", dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
};

// Avanço desde a linha de base (PPA): quanto do caminho base → meta já foi percorrido.
function progresso(m: Meta): number {
  const total = m.direcao_melhor === "alta" ? m.valor_alvo - m.valor_base : m.valor_base - m.valor_alvo;
  const feito = m.direcao_melhor === "alta" ? m.valor_atual - m.valor_base : m.valor_base - m.valor_atual;
  if (total <= 0) return m.valor_atual >= m.valor_alvo === (m.direcao_melhor === "alta") ? 100 : 0;
  return Math.max(0, Math.min(135, (feito / total) * 100));
}

function statusDe(p: number): Status {
  return p >= 99.5 ? "atingida" : p >= 70 ? "nocaminho" : p >= 40 ? "atencao" : "risco";
}

function faltaTexto(m: Meta): string {
  if (m.direcao_melhor === "alta") {
    const falta = m.valor_alvo - m.valor_atual;
    return falta <= 0 ? "Meta superada" : `Faltam ${fmtValor(falta, m.unidade)} para a meta`;
  }
  const reduzir = m.valor_atual - m.valor_alvo;
  return reduzir <= 0 ? "Meta superada" : `Reduzir ${fmtValor(reduzir, m.unidade)} para a meta`;
}

export function MetasSection({ metas }: { metas: Meta[] }) {
  const dados = metas
    .map((m) => ({ m, p: progresso(m), st: statusDe(progresso(m)) }))
    .sort((a, b) => a.p - b.p);

  const cont = { atingida: 0, nocaminho: 0, atencao: 0, risco: 0 };
  dados.forEach((d) => (cont[d.st] += 1));
  const overall = dados.length ? Math.round(dados.reduce((s, d) => s + d.p, 0) / dados.length) : 0;
  const precisamAtencao = cont.atencao + cont.risco;

  const [filtro, setFiltro] = useState<"todas" | "atencao" | "nocaminho" | "atingida">("todas");
  const visiveis = dados.filter((d) => {
    if (filtro === "todas") return true;
    if (filtro === "atencao") return d.st === "atencao" || d.st === "risco";
    return d.st === filtro;
  });

  const chip = (id: typeof filtro, label: string, n: number) => (
    <button
      onClick={() => setFiltro(id)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
        filtro === id ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">({n})</span>
    </button>
  );

  if (dados.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma meta cadastrada para este ente.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <TrendingUp className="h-4 w-4 text-teal-600" /> Progresso geral
          </div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-slate-900">{overall}%</div>
          <Progress value={overall} className="mt-2 h-1.5" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Atingidas
          </div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-emerald-700">
            {cont.atingida}<span className="text-base font-medium text-slate-400"> / {dados.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Target className="h-4 w-4 text-teal-600" /> No caminho
          </div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-teal-700">{cont.nocaminho}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${precisamAtencao > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Flag className="h-4 w-4 text-amber-600" /> Precisam de atenção
          </div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-amber-700">{precisamAtencao}</div>
          <div className="text-[11px] text-slate-500">{cont.risco} em risco · {cont.atencao} em atenção</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {chip("todas", "Todas", dados.length)}
        {chip("atencao", "Precisam de atenção", precisamAtencao)}
        {chip("nocaminho", "No caminho", cont.nocaminho)}
        {chip("atingida", "Atingidas", cont.atingida)}
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map(({ m, p, st }) => {
          const s = STATUS[st];
          return (
            <div key={m.codigo} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{m.nome}</div>
                  <div className="text-xs text-slate-500">{m.descricao}</div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium tabular-nums text-slate-700">{p.toFixed(0)}% da meta</span>
                  <span className="text-slate-500">Prazo: {m.ano_alvo}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${Math.min(100, p)}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                  <span>Atual: <strong className="text-slate-700">{fmtValor(m.valor_atual, m.unidade)}</strong></span>
                  <span>Meta: <strong className="text-slate-700">{fmtValor(m.valor_alvo, m.unidade)}</strong></span>
                </div>
              </div>

              <div className={`mt-2 text-xs font-medium ${st === "atingida" ? "text-emerald-600" : st === "risco" ? "text-rose-600" : "text-slate-500"}`}>
                {faltaTexto(m)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
