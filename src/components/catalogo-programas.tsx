"use client";

import { useState } from "react";
import { BadgeCheck, BookMarked, Building2, CalendarClock, ExternalLink, Search, Users } from "lucide-react";
import type { CatalogoItem } from "@/lib/queries";

const AREAS: Record<string, { lbl: string; ic: string }> = {
  saude: { lbl: "Saúde", ic: "🏥" },
  educacao: { lbl: "Educação", ic: "🎓" },
  assistencia: { lbl: "Assistência social", ic: "🤝" },
  infraestrutura: { lbl: "Infraestrutura", ic: "🚧" },
  habitacao: { lbl: "Habitação", ic: "🏘️" },
  cultura: { lbl: "Cultura", ic: "🎭" },
  esporte: { lbl: "Esporte", ic: "⚽" },
  agricultura: { lbl: "Agricultura", ic: "🌾" },
  seguranca: { lbl: "Segurança", ic: "🛡️" },
  outros: { lbl: "Outros", ic: "📋" },
};
const areaLbl = (a: string) => AREAS[a]?.lbl ?? a;
const areaIc = (a: string) => AREAS[a]?.ic ?? "📋";
const LIMITE = 90;

export function CatalogoProgramas({ programas }: { programas: CatalogoItem[] }) {
  const [area, setArea] = useState<string>("todas");
  const [busca, setBusca] = useState<string>("");
  if (!programas.length) return null;
  const areasComProg = Object.keys(AREAS).filter((a) => programas.some((p) => p.area === a));
  const b = busca.trim().toLowerCase();
  const lista = programas.filter((p) => (area === "todas" || p.area === area) && (!b || p.nome.toLowerCase().includes(b) || p.orgao.toLowerCase().includes(b)));
  const mostrados = lista.slice(0, LIMITE);
  const nCurados = programas.filter((p) => p.curado).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><BookMarked className="h-4 w-4 text-teal-600" /> Catálogo de programas federais</h3>
        <span className="text-xs text-slate-500">{programas.length} programas · {nCurados} curados + Transferegov</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Repositório consultável dos programas federais que o município pode pleitear — curados (descrição rica) e o catálogo do Transferegov (fundo a fundo e gestão ágil). Filtre por área ou busque pelo nome/órgão; o casamento acima já cruza os que combinam com a sua carência.</p>

      {/* busca */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou órgão…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
      </div>

      {/* filtro por área */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => setArea("todas")} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${area === "todas" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todas ({programas.length})</button>
        {areasComProg.map((a) => {
          const n = programas.filter((p) => p.area === a).length;
          return (
            <button key={a} onClick={() => setArea(a)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${area === a ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {areaIc(a)} {areaLbl(a)} ({n})
            </button>
          );
        })}
      </div>

      <div className="mt-2 text-[11px] text-slate-500">{lista.length} resultado(s){lista.length > LIMITE ? ` · mostrando os primeiros ${LIMITE} — refine pela busca ou área` : ""}</div>

      {/* lista de programas */}
      <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
        {mostrados.map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 ${p.curado ? "border-teal-200 bg-teal-50/40" : "border-slate-200 bg-slate-50/50"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">{p.curado && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-teal-600" />}{p.nome}</div>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{areaIc(p.area)} {areaLbl(p.area)}</span>
            </div>
            {p.objeto && <p className="mt-1 text-[13px] text-slate-600">{p.objeto}</p>}
            <div className="mt-2 space-y-1 text-[11px] text-slate-500">
              {p.orgao && <div className="flex items-start gap-1"><Building2 className="mt-0.5 h-3 w-3 shrink-0" /><span>{p.orgao}</span></div>}
              {p.elegibilidade && <div className="flex items-start gap-1"><Users className="mt-0.5 h-3 w-3 shrink-0" /><span>{p.elegibilidade}</span></div>}
              {p.janela && <div className="flex items-start gap-1"><CalendarClock className="mt-0.5 h-3 w-3 shrink-0" /><span>{p.janela}</span></div>}
            </div>
            {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline">{p.fonte || "Acessar"} <ExternalLink className="h-3 w-3" /></a>}
            {!p.link && p.fonte && <div className="mt-2 text-[11px] text-slate-400">{p.fonte}</div>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Curados (✓): registro próprio com base nas fontes oficiais. Demais: catálogo do Transferegov (api.transferegov.gestao.gov.br). Janelas e regras podem mudar — confirme sempre no portal do programa.</p>
    </section>
  );
}
