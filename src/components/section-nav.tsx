"use client";

import { useEffect, useState } from "react";

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav className="no-print sticky top-[var(--header-h)] z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="relative">
        <div className="flex gap-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none]">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              aria-current={active === it.id ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                active === it.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {it.label}
            </a>
          ))}
        </div>
        {/* indicador de rolagem horizontal (mobile) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50 to-transparent sm:hidden" />
      </div>
    </nav>
  );
}
