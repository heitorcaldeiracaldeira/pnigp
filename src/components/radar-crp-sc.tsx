"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Clock, ExternalLink, Landmark, ShieldAlert, ShieldCheck } from "lucide-react";
import { fmtBRLCompact, fmtPop } from "@/lib/ui";
import type { RadarCrpItem, RadarCrpSCData } from "@/lib/queries";

type Filtro = "risco" | "vencido" | "avencer" | "todos";
type Ordem = "urgencia" | "populacao" | "valor";

function alertaMeta(ev: string) {
  if (ev === "entrou_vencido") return { lbl: "CRP venceu — entrou em bloqueio", dot: "bg-rose-500" };
  if (ev === "entrou_30") return { lbl: "passou a vencer em ≤30 dias", dot: "bg-rose-400" };
  return { lbl: "entrou no radar (vence em ≤90 dias)", dot: "bg-amber-500" };
}

function statusDe(dias: number | null, vencido: boolean) {
  if (vencido) return { bucket: 0, label: dias != null ? `Vencida há ${Math.abs(dias)}d` : "Vencida", cls: "bg-rose-100 text-rose-700" };
  if (dias != null && dias <= 30) return { bucket: 1, label: `Vence em ${dias}d`, cls: "bg-rose-100 text-rose-700" };
  if (dias != null && dias <= 90) return { bucket: 2, label: `Vence em ${dias}d`, cls: "bg-amber-100 text-amber-700" };
  return { bucket: 3, label: "Regular", cls: "bg-emerald-100 text-emerald-700" };
}

// Bloco dedicado do Governo do Estado (ente próprio, com RPPS/CRP própria) — separado dos municípios.
function BlocoEstado({ e }: { e: RadarCrpItem }) {
  const s = statusDe(e.dias, e.vencido);
  const risco = e.vencido || (e.dias != null && e.dias <= 90);
  return (
    <div className={`rounded-2xl border p-5 ${e.vencido ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50" : risco ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Landmark className="h-4 w-4 text-slate-600" /> Governo do Estado de Santa Catarina</div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">RPPS dos servidores estaduais. A CRP do Estado é exigida para o próprio Governo estadual receber transferências voluntárias da União e contratar crédito.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Validade da CRP</div>
          <div className={`font-display text-lg font-bold tabular-nums ${e.vencido ? "text-rose-700" : "text-slate-900"}`}>{e.validade ?? "—"}</div>
          <div className="text-[11px] text-slate-500">{e.dias == null ? "" : e.dias < 0 ? `vencida há ${Math.abs(e.dias)} dia(s)` : `vence em ${e.dias} dia(s)`}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Nº do CRP</div>
          <div className="font-display text-lg font-bold tabular-nums text-slate-900">{e.nrCrp ?? "—"}</div>
          <div className="text-[11px] text-slate-500">consulta pública CADPREV</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Em jogo (janelas federais)</div>
          <div className="font-display text-lg font-bold tabular-nums text-slate-900">{fmtBRLCompact(e.valorEmJogo)}</div>
          <div className="text-[11px] text-slate-500">{e.nJanelas} janelas abertas</div>
        </div>
      </div>
      <div className="mt-3">
        <Link href={`/real/${e.codIbge}#previdencia`} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Ver Previdência do Estado <ExternalLink className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}

export function RadarCrpSC({ data }: { data: NonNullable<RadarCrpSCData> }) {
  const [filtro, setFiltro] = useState<Filtro>("risco");
  const [ordem, setOrdem] = useState<Ordem>("urgencia");

  const estado = data.municipios.find((x) => x.ehEstado) ?? null;
  const muns = useMemo(() => data.municipios.filter((x) => !x.ehEstado), [data.municipios]);

  const vencidos = muns.filter((x) => x.vencido).length;
  const aVencer30 = muns.filter((x) => !x.vencido && x.dias != null && x.dias <= 30).length;
  const aVencer90 = muns.filter((x) => !x.vencido && x.dias != null && x.dias <= 90).length;
  const regulares = muns.length - vencidos - aVencer90;

  const filtrados = useMemo(() => {
    let f = muns;
    if (filtro === "vencido") f = muns.filter((x) => x.vencido);
    else if (filtro === "avencer") f = muns.filter((x) => !x.vencido && x.dias != null && x.dias <= 90);
    else if (filtro === "risco") f = muns.filter((x) => x.vencido || (x.dias != null && x.dias <= 90));
    const bucket = (x: RadarCrpItem) => statusDe(x.dias, x.vencido).bucket;
    return [...f].sort((a, b) => {
      if (ordem === "populacao") return b.populacao - a.populacao;
      if (ordem === "valor") return b.valorEmJogo - a.valorEmJogo || a.nome.localeCompare(b.nome);
      const ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      if (ba === 0) return (b.dias ?? 0) - (a.dias ?? 0); // vencidos: o que venceu mais recentemente primeiro
      return (a.dias ?? 9999) - (b.dias ?? 9999); // a vencer: o mais próximo primeiro
    });
  }, [muns, filtro, ordem]);

  const chip = (id: Filtro, label: string, n: number) => (
    <button onClick={() => setFiltro(id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filtro === id ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}>
      {label} <span className="tabular-nums opacity-80">({n})</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ShieldAlert className="h-4 w-4 text-rose-600" /> Radar de CRP — Santa Catarina</div>
        <p className="mt-1 text-sm text-slate-600">Certificado de Regularidade Previdenciária <b>vencido ou a vencer</b> — separado em <b>Governo do Estado</b> e <b>municípios</b>. Sem CRP válida, o ente fica impedido de receber transferências voluntárias da União, emendas e convênios. Use para agir antes do vencimento.</p>
      </div>

      {/* NOVIDADES — transições detectadas pela varredura (o alerta proativo: quem VIROU risco) */}
      {data.alertas.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Bell className="h-4 w-4 text-amber-600" /> Novidades — transições de CRP detectadas</div>
          <p className="mt-0.5 text-[12px] text-slate-500">Entes que mudaram de status desde a última varredura. Mostrando as {data.alertas.length} mais recentes — lista completa na tabela abaixo.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {data.alertas.map((a, i) => {
              const m = alertaMeta(a.evento);
              return (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800"><b>{a.nome}</b>{a.ehEstado && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">governo estadual</span>} — {m.lbl}</div>
                    <div className="text-[11px] text-slate-500">{a.dias != null ? (a.dias < 0 ? `vencida há ${Math.abs(a.dias)}d` : `vence em ${a.dias}d`) : ""}{a.validade ? ` · validade ${a.validade}` : ""}{a.criado ? ` · detectado ${a.criado}` : ""}</div>
                  </div>
                  <Link href={`/real/${a.codIbge}#previdencia`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ver <ExternalLink className="h-3 w-3" /></Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* AÇÃO 1 — Governo do Estado */}
      {estado && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><Landmark className="h-4 w-4 text-slate-500" /> Governo do Estado</h3>
          <BlocoEstado e={estado} />
        </section>
      )}

      {/* AÇÃO 2 — Municípios */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><ShieldAlert className="h-4 w-4 text-slate-500" /> Municípios <span className="font-normal text-slate-400">({muns.length})</span></h3>

        {/* cards-resumo (municípios) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-4 ${vencidos ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex items-center gap-1 text-xs text-slate-500"><ShieldAlert className="h-3.5 w-3.5" /> CRP vencida</div>
            <div className={`font-display text-3xl font-bold tabular-nums ${vencidos ? "text-rose-700" : "text-emerald-700"}`}>{vencidos}</div>
            <div className="text-[11px] text-slate-500">transferências bloqueadas hoje</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" /> A vencer ≤ 30 dias</div>
            <div className="font-display text-3xl font-bold tabular-nums text-amber-700">{aVencer30}</div>
            <div className="text-[11px] text-slate-500">{aVencer90} a vencer em até 90 dias</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Regulares</div>
            <div className="font-display text-3xl font-bold tabular-nums text-emerald-700">{regulares}</div>
            <div className="text-[11px] text-slate-500">de {muns.length} municípios com RPPS</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-1 text-xs text-slate-500"><AlertTriangle className="h-3.5 w-3.5" /> Em jogo agora</div>
            <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(data.valorPool)}</div>
            <div className="text-[11px] text-slate-500">{data.janelasAbertas} janelas federais abertas — comuns a todos</div>
          </div>
        </div>

        {/* filtros + ordenação */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {chip("risco", "Em risco", vencidos + aVencer90)}
            {chip("vencido", "Vencidas", vencidos)}
            {chip("avencer", "A vencer", aVencer90)}
            {chip("todos", "Todos", muns.length)}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">ordenar por
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
              <option value="urgencia">urgência</option>
              <option value="populacao">população</option>
              <option value="valor">valor em jogo</option>
            </select>
          </label>
        </div>

        {/* tabela (municípios) */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
                <th>#</th>
                <th>Município</th>
                <th>Status CRP</th>
                <th className="text-right">Validade</th>
                <th className="hidden text-right sm:table-cell">População</th>
                <th className="hidden text-right md:table-cell">Em jogo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((x, i) => {
                const s = statusDe(x.dias, x.vencido);
                return (
                  <tr key={x.codIbge} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{x.nome}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{x.validade ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 sm:table-cell">{fmtPop(x.populacao)}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 md:table-cell">{fmtBRLCompact(x.valorEmJogo)}<span className="ml-1 text-[10px] text-slate-400">{x.nJanelas}j</span></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/real/${x.codIbge}#previdencia`} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700">Ver <ExternalLink className="h-3 w-3" /></Link>
                    </td>
                  </tr>
                );
              })}
              {!filtrados.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Nenhum município neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        Fonte: CRP — CADPREV/SPREV (Consulta Pública, casada por ente). Janelas federais abertas e elegibilidade — Transferegov (programas e <code>programa_beneficiario_sc</code>). O <b>status</b> é calculado pela data de validade real (a flag da fonte pode estar defasada). O <b>valor em jogo</b> é o porte dos programas abertos que o ente pode pleitear — janelas voluntárias valem para todos; específicas/emenda, só para os elegíveis (lista municipal). Exibição neutra, sem juízo sobre a gestão.
      </p>
    </div>
  );
}
