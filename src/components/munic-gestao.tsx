// IBGE MUNIC — instrumentos de gestão do município (planos, conselhos, fundos, instrumentos legais).
// Muitos são pré-requisito de transferências federais. Fonte: base de dados oficial da MUNIC (não SIDRA).
import { ClipboardCheck, Check, X } from "lucide-react";
import type { MunicSC } from "@/lib/queries";

export function MunicGestao({ data, nome }: { data: NonNullable<MunicSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><ClipboardCheck className="h-4 w-4 text-indigo-600" /> Instrumentos de gestão — IBGE MUNIC {data.ano}</h3>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">{data.totalTem} de {data.total} instrumentos</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Planos, conselhos, fundos e instrumentos legais que <b>{nome}</b> possui, segundo a Pesquisa de Informações Básicas Municipais do IBGE. Muitos são <b>pré-requisito para transferências federais</b> — a ausência fecha portas de captação.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {data.grupos.map((g) => (
          <div key={g.grupo} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.grupo}</span>
              <span className="text-[11px] font-semibold text-slate-400">{g.tem}/{g.total}</span>
            </div>
            <ul className="space-y-1.5">
              {g.itens.map((it, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  {it.tem ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />}
                  <span className={it.tem ? "text-slate-700" : "text-slate-400"}>{it.label}{it.valor && it.valor.length > 4 && !/^sim|^n[ãa]o/i.test(it.valor) ? <span className="text-[10px] text-slate-400"> — {it.valor}</span> : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Fonte: IBGE — Pesquisa de Informações Básicas Municipais (MUNIC), base de dados oficial. Indicador "possui/não possui" por instrumento. A MUNIC rotaciona temas por edição; a presente reflete a edição mais recente que cobriu legislação, planos e conselhos setoriais.</p>
    </section>
  );
}
