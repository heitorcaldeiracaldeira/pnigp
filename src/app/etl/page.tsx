"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Database, RefreshCw } from "lucide-react";

type Fonte = {
  id: string; label: string; api: string; max_ano: number | null;
  ultima_exec: string | null; ultimo_status: string | null; devido: boolean | null; msg: string | null;
  atualizado_em: string | null; idade_exec: number | null;
};
type Resp = { ts: number; fontes: Fonte[]; erro?: string };

const POLL = 30000;
const API_COR: Record<string, string> = { siconfi: "bg-blue-100 text-blue-700", pncp: "bg-violet-100 text-violet-700", siops: "bg-rose-100 text-rose-700", ibge: "bg-amber-100 text-amber-700", cgu: "bg-teal-100 text-teal-700" };
function idade(s: number | null) {
  if (s == null) return "nunca";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

export default function EtlPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [now, setNow] = useState(0);
  const carregar = useCallback(async () => {
    try { const r = await fetch("/api/etl-catalogo", { cache: "no-store" }); setD(await r.json()); setNow(Date.now()); } catch {}
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, POLL); return () => clearInterval(t); }, [carregar]);

  const fontes = d?.fontes ?? [];
  const pendentes = fontes.filter((f) => f.devido).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Coleta — Fontes de Dados</h1>
          <p className="text-sm text-slate-500">Orquestrador incremental · agendado diariamente às 03:30 · atualiza a cada {POLL / 1000}s</p>
        </div>
        <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {/* resumo */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Fontes monitoradas</p>
          <p className="font-display text-2xl font-bold text-slate-900">{fontes.length}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${pendentes ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-xs text-slate-500">Pendentes de coleta</p>
          <p className={`font-display text-2xl font-bold ${pendentes ? "text-amber-700" : "text-emerald-700"}`}>{pendentes}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Próxima coleta automática</p>
          <p className="font-display text-base font-semibold text-slate-800">diária · 03:30</p>
        </div>
      </div>

      {d?.erro && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Catálogo indisponível: {d.erro}</div>}

      {/* tabela */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
              <th>Fonte</th><th>Provedor</th><th className="text-center">Ano mais recente</th><th>Última coleta</th><th className="text-center">Situação</th>
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{f.label}</div>
                  {f.ultimo_status && <div className="text-[11px] text-slate-400">último: {f.ultimo_status}</div>}
                </td>
                <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${API_COR[f.api] || "bg-slate-100 text-slate-600"}`}>{f.api}</span></td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-700">{f.max_ano || "—"}</td>
                <td className="px-4 py-3 text-slate-500"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{idade(f.idade_exec)}</span></td>
                <td className="px-4 py-3 text-center">
                  {f.devido ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> pendente</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> em dia</span>
                  )}
                </td>
              </tr>
            ))}
            {fontes.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sem dados do catálogo ainda — rode o orquestrador (MODO=plan) para popular.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        <p className="mb-1 flex items-center gap-1 font-semibold text-slate-700"><Database className="h-3.5 w-3.5" /> Como funciona</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>O orquestrador detecta <b>novidade por fonte</b> (competência nova vs. o que já está no Neon) e coleta <b>só o que falta</b> — idempotente, sem duplicar.</li>
          <li>Rodada automática diária 03:30. Manual: <code>MODO=run node scripts/etl_orquestrador.mjs</code> (ou <code>MODO=plan</code> só p/ detectar).</li>
          <li><b>"Pendente"</b> = há competência nova ou a janela de atualização venceu. <b>"Em dia"</b> = base atualizada.</li>
        </ul>
      </div>
    </div>
  );
}
