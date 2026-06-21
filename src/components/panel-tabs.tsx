"use client";

import { useEffect, useRef, useState } from "react";

export function PanelTabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: React.ReactNode; grupo?: string }[];
}) {
  const grupoDo = (id: string) => tabs.find((t) => t.id === id)?.grupo || "Geral";
  const grupos = [...new Set(tabs.map((t) => t.grupo || "Geral"))];
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const [grupo, setGrupo] = useState(tabs[0]?.grupo || "Geral");
  const ref = useRef<HTMLDivElement>(null);

  const selecionar = (id: string, rolar = false) => {
    setActive(id);
    setGrupo(grupoDo(id));
    if (typeof window !== "undefined") history.replaceState(null, "", `#${id}`);
    if (rolar) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // ao trocar de grupo, abre a 1ª sub-aba dele
  const abrirGrupo = (g: string) => {
    setGrupo(g);
    const primeira = tabs.find((t) => (t.grupo || "Geral") === g);
    if (primeira) selecionar(primeira.id);
  };

  // abre a aba do hash (#financas) — inclusive vindo de links internos
  useEffect(() => {
    const aplicar = (rolar: boolean) => {
      const h = window.location.hash.replace("#", "");
      if (h && tabs.some((t) => t.id === h)) selecionar(h, rolar);
    };
    aplicar(false);
    const onHash = () => aplicar(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const subtabs = tabs.filter((t) => (t.grupo || "Geral") === grupo);

  return (
    <div ref={ref} className="scroll-mt-[calc(var(--header-h)+0.75rem)]">
      <div className="no-print sticky top-[var(--header-h)] z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur lg:-mx-8 lg:px-8">
        {/* Nível 1 — grupos */}
        <div role="tablist" aria-label="Grupos" className="flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <button
              key={g}
              onClick={() => abrirGrupo(g)}
              aria-selected={g === grupo}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                g === grupo ? "bg-slate-800 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        {/* Nível 2 — sub-abas do grupo (cascata) */}
        <div role="tablist" aria-label={`Seções de ${grupo}`} className="mt-2 flex flex-wrap gap-1 border-t border-slate-200/70 pt-2">
          {subtabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => selecionar(t.id)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                active === t.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            hidden={t.id !== active}
            className="space-y-6"
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
