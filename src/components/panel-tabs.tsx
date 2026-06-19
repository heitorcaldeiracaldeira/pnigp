"use client";

import { Fragment, useEffect, useRef, useState } from "react";

export function PanelTabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: React.ReactNode; grupo?: string }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Centraliza a aba ativa na barra rolável (mobile/desktop) — descoberta + sensação tátil
  useEffect(() => {
    const btn = barRef.current?.querySelector<HTMLElement>(`#tab-${CSS.escape(active)}`);
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  // Abre a aba indicada na URL (#financas) e reage a cliques que mudam o hash
  useEffect(() => {
    const aplicar = (rolar: boolean) => {
      const h = window.location.hash.replace("#", "");
      if (h && tabs.some((t) => t.id === h)) {
        setActive(h);
        if (rolar) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    aplicar(false);
    const onHash = () => aplicar(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [tabs]);

  const selecionar = (id: string) => {
    setActive(id);
    if (typeof window !== "undefined") history.replaceState(null, "", `#${id}`);
  };

  return (
    <div ref={ref} className="scroll-mt-[calc(var(--header-h)+0.75rem)]">
      <div
        role="tablist"
        aria-label="Seções do painel"
        className="no-print sticky top-[var(--header-h)] z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur lg:-mx-8 lg:px-8"
      >
        <div className="relative">
          <div ref={barRef} className="flex gap-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none]">
            {tabs.map((t, i) => {
              const novoGrupo = t.grupo && t.grupo !== tabs[i - 1]?.grupo;
              return (
                <Fragment key={t.id}>
                  {novoGrupo && (
                    <span className={`flex shrink-0 items-center self-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-400 ${i > 0 ? "ml-1.5 border-l border-slate-300 pl-2.5" : "pl-0.5"}`}>
                      {t.grupo}
                    </span>
                  )}
                  <button
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={active === t.id}
                    aria-controls={`panel-${t.id}`}
                    onClick={() => selecionar(t.id)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      active === t.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-200/70"
                    }`}
                  >
                    {t.label}
                  </button>
                </Fragment>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50 to-transparent sm:hidden" />
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
