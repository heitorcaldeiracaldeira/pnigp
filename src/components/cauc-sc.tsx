import { AlertTriangle, CheckCircle2, Database, MinusCircle, ShieldCheck, XCircle } from "lucide-react";
import type { CaucSC } from "@/lib/queries";
import { CAUC_GRUPOS, CAUC_REQUISITOS } from "@/lib/cauc-requisitos";

const STATUS = {
  regular: { Icon: CheckCircle2, cls: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700", rotulo: "Regular", txt: (v: string | null) => (v ? `válido até ${v}` : "regular") },
  vencido: { Icon: XCircle, cls: "text-rose-600", chip: "bg-rose-100 text-rose-700", rotulo: "Vencido", txt: (v: string | null) => (v ? `vencido em ${v}` : "vencido") },
  pendente: { Icon: AlertTriangle, cls: "text-amber-600", chip: "bg-amber-100 text-amber-700", rotulo: "Não comprovado", txt: (_v: string | null) => "não comprovado pelo CAUC (!)" },
  desabilitado: { Icon: MinusCircle, cls: "text-slate-400", chip: "bg-slate-100 text-slate-500", rotulo: "Não se aplica", txt: (_v: string | null) => "item não se aplica nesta data" },
} as const;

export function CaucSCView({ data }: { data: NonNullable<CaucSC> }) {
  const d = data;
  const grupos = d.itens.reduce<Record<string, typeof d.itens>>((acc, it) => { const g = it.codigo.split(".")[0]; (acc[g] ||= []).push(it); return acc; }, {});
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

      {/* EXTRATO DETALHADO — requisito a requisito (mesma visão do extrato oficial do CAUC) */}
      {d.itens.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Extrato do CAUC — requisito a requisito</h3>
          {Object.entries(grupos).map(([g, items]) => (
            <div key={g} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">{CAUC_GRUPOS[g] || `Grupo ${g}`}</div>
              <ul className="divide-y divide-slate-100">
                {items.map((it) => {
                  const s = STATUS[it.status];
                  const req = CAUC_REQUISITOS[it.codigo];
                  return (
                    <li key={it.codigo} className="flex items-start gap-3 px-4 py-2.5">
                      <s.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.cls}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-slate-800"><b className="tabular-nums">{it.codigo}</b> · {req?.label || "Requisito do CAUC"}</div>
                        <div className="text-[11px] text-slate-500">{s.txt(it.validade)}{req?.fonte ? ` · fonte ${req.fonte}` : ""}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>{s.rotulo}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Legenda: <b className="text-emerald-700">Regular</b> = comprovado, com data de validade · <b className="text-rose-700">Vencido</b> = validade no passado · <b className="text-amber-700">Não comprovado</b> = o CAUC não obteve a informação (&ldquo;!&rdquo;) · <b className="text-slate-500">Não se aplica</b> = item desabilitado na data.</p>
        </section>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fonte: CAUC — Sistema de Informações sobre Requisitos Fiscais (Tesouro Nacional), atualizado diariamente com o CADIN. Situação na data da pesquisa. Extrato item a item conforme os Metadados do CAUC.
      </p>
    </div>
  );
}
