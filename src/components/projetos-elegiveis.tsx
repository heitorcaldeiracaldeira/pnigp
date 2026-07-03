"use client";

// Motor de projetos elegíveis — cruza os programas federais curados (programas_federais_sc) com as áreas em que o
// município tem lacuna detectada (saúde/educação/assistência) e apresenta "projetos que você pode captar agora".
// A plataforma aponta a lacuna + o programa aberto; a i10 DESENVOLVE o projeto (viabilidade → cadastro no sistema
// federal → captação → prestação de contas). Fica na aba Soluções i10.
import { Rocket, ExternalLink, Star } from "lucide-react";
import type { ProgramaFederal } from "@/lib/queries";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function ProjetosElegiveis({ nome, programas, prioridades }: { nome: string; programas: ProgramaFederal[]; prioridades: string[] }) {
  if (!programas.length) return null;
  const prio = new Set(prioridades.map(norm));
  const ehPrio = (area: string) => [...prio].some((p) => norm(area).includes(p) || p.includes(norm(area)));

  // agrupa por área; áreas prioritárias (com lacuna detectada) vêm primeiro
  const mapa = new Map<string, ProgramaFederal[]>();
  for (const p of programas) { const a = p.area || "Outros"; if (!mapa.has(a)) mapa.set(a, []); mapa.get(a)!.push(p); }
  const grupos = [...mapa.entries()].sort((a, b) => {
    const pa = ehPrio(a[0]) ? 0 : 1, pb = ehPrio(b[0]) ? 0 : 1;
    return pa - pb || a[0].localeCompare(b[0]);
  });

  return (
    <section className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Rocket aria-hidden className="h-4 w-4 text-emerald-600" /> Projetos que {nome} pode captar agora</div>
      <p className="mt-1 text-[12px] text-slate-600">Programas federais abertos cruzados com as necessidades detectadas na plataforma. A i10 <b>desenvolve o projeto</b> — viabilidade técnica, cadastro no sistema federal, captação e prestação de contas. Áreas com <Star className="inline h-3 w-3 text-amber-500" /> têm lacuna identificada em {nome}.</p>

      <div className="mt-3 space-y-4">
        {grupos.map(([area, lista]) => (
          <div key={area}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
              {ehPrio(area) && <Star aria-hidden className="h-3.5 w-3.5 text-amber-500" />}
              {area}
              {ehPrio(area) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">prioritário para {nome}</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((p) => (
                <div key={p.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-[12px] font-semibold text-slate-800">{p.nome}</span>
                    {p.janela && <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{p.janela}</span>}
                  </div>
                  {p.objeto && <p className="mt-0.5 text-[11px] text-slate-500">{p.objeto}</p>}
                  <div className="mt-auto pt-1.5 text-[10px] text-slate-400">{[p.orgao, p.fonte].filter(Boolean).join(" · ")}</div>
                  {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:underline">Sistema/edital <ExternalLink className="h-2.5 w-2.5" /></a>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-slate-400">Fonte: catálogo de programas federais (curadoria i10) cruzado com os motores de lacuna. Valor e elegibilidade dependem do edital vigente — a i10 confirma a janela antes de propor.</p>
    </section>
  );
}
