import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import type { CaucSC } from "@/lib/queries";

export function CaucSCView({ data }: { data: NonNullable<CaucSC> }) {
  const d = data;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${d.apto ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50" : "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-teal-600" /> Regularidade fiscal — CAUC{d.dataPesquisa ? ` · ${d.dataPesquisa}` : ""}</div>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${d.apto ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {d.apto ? <><CheckCircle2 className="h-3.5 w-3.5" /> Apto a transferências voluntárias</> : <><AlertTriangle className="h-3.5 w-3.5" /> {d.nPendencias} pendência(s)</>}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          O <b>CAUC</b> consolida os requisitos fiscais (Receita/PGFN, FGTS, envio de RREO/RGF, aplicação em saúde/educação, dívida) e lê o <b>CADIN</b> diariamente. Pendência aqui <b>bloqueia convênios e transferências voluntárias</b> da União.
        </p>
      </div>

      {d.apto ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="mb-1 inline h-4 w-4" /> Todos os requisitos do CAUC estão regulares — o ente está <b>apto a celebrar convênios e receber transferências voluntárias</b>.
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Requisitos pendentes (a regularizar)</h3>
          {d.grupos.map((g, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border-l-4 border-l-rose-500 bg-white p-3 text-sm shadow-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span className="text-slate-700">{g}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">Códigos pendentes no CAUC: {d.pendencias.join(", ")}. Cada um corresponde a uma certidão/declaração específica — regularizar libera novos convênios.</p>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fonte: CAUC — Sistema de Informações sobre Requisitos Fiscais (Tesouro Nacional), atualizado diariamente com o CADIN. Situação na data da pesquisa.
      </p>
    </div>
  );
}
