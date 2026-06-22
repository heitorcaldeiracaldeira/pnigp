"use client";

import { useState } from "react";
import type { EscolasSC } from "@/lib/queries";

// Drill escola a escola (rede municipal): lista com infraestrutura + quadro de pessoal; cada escola EXPANDE para
// séries/etapas (alunos por etapa, que somam ao total), turmas e relação aluno/turma. Nível operacional/técnico.
const ICO = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{ok ? "✓" : "✗"} {label}</span>
);

type Escola = NonNullable<EscolasSC>["lista"][number];

function EscolaItem({ e, media }: { e: Escola; media: number | null }) {
  const [open, setOpen] = useState(false);
  const sobrec = media != null && e.alunoPorDoc != null && e.alunoPorDoc > media * 1.3;
  const maxE = Math.max(1, ...e.etapas.map((x) => x.n));
  const mapa = e.lat != null && e.lon != null ? `https://www.google.com/maps?q=${e.lat},${e.lon}` : null;
  return (
    <div className="border-b border-slate-50 last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-2 p-2.5 text-left hover:bg-slate-50/70">
        <span className="mt-0.5 text-slate-400">{open ? "▾" : "▸"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-[13px] font-medium text-slate-800">{e.nome}{e.bairro ? <span className="font-normal text-slate-400"> · {e.bairro}</span> : null}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.infraScore >= 75 ? "bg-emerald-100 text-emerald-700" : e.infraScore >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>infra {e.infraScore}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span>{e.matriculas.toLocaleString("pt-BR")} alunos</span>
            <span>{e.turmas || "—"} turmas</span>
            <span>{e.docentes} prof.</span>
            {e.alunoPorDoc != null && <span className={sobrec ? "font-semibold text-rose-600" : ""}>{e.alunoPorDoc} alunos/prof.{sobrec ? " ⚠️" : ""}</span>}
            {e.zona === 2 && <span>· rural</span>}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 bg-slate-50/60 px-4 pb-3 pt-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center"><div className="text-base font-bold tabular-nums text-slate-800">{e.matriculas.toLocaleString("pt-BR")}</div><div className="text-[10px] text-slate-500">alunos</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center"><div className="text-base font-bold tabular-nums text-slate-800">{e.turmas || "—"}</div><div className="text-[10px] text-slate-500">turmas</div></div>
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-2 text-center"><div className="text-base font-bold tabular-nums text-teal-700">{e.alunoPorTurma ?? "—"}</div><div className="text-[10px] text-slate-500">alunos/turma</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center"><div className="text-base font-bold tabular-nums text-slate-800">{e.alunoPorDoc ?? "—"}</div><div className="text-[10px] text-slate-500">alunos/professor</div></div>
          </div>

          {e.etapas.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Alunos por etapa de ensino</div>
              <div className="space-y-1">
                {e.etapas.map((et) => (
                  <div key={et.etapa} className="flex items-center gap-2 text-xs">
                    <span className="w-48 shrink-0 text-slate-600">{et.etapa}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-slate-200"><div className="h-3 rounded bg-teal-500" style={{ width: `${(et.n / maxE) * 100}%` }} /></div>
                    <span className="w-12 shrink-0 text-right tabular-nums text-slate-700">{et.n.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
              {e.especial > 0 && (
                <p className="mt-1.5 rounded-lg border border-sky-100 bg-sky-50/60 px-2 py-1.5 text-[11px] text-slate-600">
                  ♿ <b>{e.especial.toLocaleString("pt-BR")}</b> alunos em <b>educação especial</b> (inclusão em classe comum — <b>já contados</b> nas etapas acima, não somam de novo).
                  <br /><span className="text-slate-500">No <b>FUNDEB</b>, esses alunos (classe comum + AEE) podem ser contados <b>em dobro</b> na distribuição de recursos (Lei 14.113/2020, art. 8º) — aumenta o repasse, sem inflar a matrícula real.</span>
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Infraestrutura</div>
            <div className="flex flex-wrap gap-1">
              <ICO ok={e.infra.internet} label="internet" /><ICO ok={e.infra.biblioteca} label="biblioteca" /><ICO ok={e.infra.quadra} label="quadra" />
              <ICO ok={e.infra.labInfo} label="lab. info" /><ICO ok={e.infra.refeitorio} label="refeitório" /><ICO ok={e.infra.esgoto} label="esgoto" /><ICO ok={e.infra.agua} label="água" /><ICO ok={e.infra.acessibilidade} label="acessib." />
            </div>
          </div>

          {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] font-medium text-teal-600 hover:underline">📍 ver no mapa</a>}
        </div>
      )}
    </div>
  );
}

export function EscolasDrill({ dados, nome }: { dados: EscolasSC; nome: string }) {
  if (!dados) return null;
  const L = dados.lacunas;
  const lac = [
    { n: L.semInternet, t: "sem internet" }, { n: L.semBiblioteca, t: "sem biblioteca" }, { n: L.semQuadra, t: "sem quadra" },
    { n: L.semEsgoto, t: "sem esgoto" }, { n: L.semAcessibilidade, t: "sem acessibilidade" },
  ];
  const media = dados.alunoPorDocente;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏫 Escolas da rede municipal — uma a uma</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">INEP {dados.ano}</span>
      </div>
      <p className="text-sm text-slate-500">{dados.total} escolas municipais em {nome} · {dados.matriculas.toLocaleString("pt-BR")} matrículas. <b>Clique numa escola</b> para ver séries/etapas, turmas e infraestrutura.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(() => { const m = dados.infraMedia; const cls = m >= 75 ? "border-emerald-200 bg-emerald-50/60 text-emerald-700" : m >= 50 ? "border-amber-200 bg-amber-50/60 text-amber-700" : "border-rose-200 bg-rose-50/60 text-rose-700"; return (
          <div className={`rounded-xl border p-3 ${cls}`}><div className="text-xl font-bold tabular-nums">{m}<span className="text-sm">/100</span></div><div className="text-[11px] text-slate-600">índice de infraestrutura (média)</div></div>
        ); })()}
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.docentes.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">docentes (professores)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.profissionais.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">profissionais de apoio</div></div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3"><div className="text-xl font-bold tabular-nums text-teal-700">{media ?? "—"}</div><div className="text-[11px] text-slate-600">alunos por professor (média)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.alunoPorProf ?? "—"}</div><div className="text-[11px] text-slate-600">alunos por profissional de apoio</div></div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {lac.map((c) => (
          <div key={c.t} className={`rounded-xl border p-2.5 text-center ${c.n > 0 ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
            <div className={`text-lg font-bold tabular-nums ${c.n > 0 ? "text-rose-700" : "text-emerald-700"}`}>{c.n}</div>
            <div className="text-[11px] text-slate-600">{c.t}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 max-h-[34rem] overflow-y-auto rounded-xl border border-slate-100">
        {dados.lista.map((e, i) => <EscolaItem key={i} e={e} media={media} />)}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: INEP — Censo Escolar {dados.ano}. Rede municipal, escolas em atividade. As etapas somam ao total de matrículas; educação especial é recorte de inclusão (não soma). Turmas = QT_TUR_BAS. ⚠️ = +30% acima da média de alunos/professor.</p>
    </section>
  );
}
