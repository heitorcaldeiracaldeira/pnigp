import { Info } from "lucide-react";

/** Dica explicativa acionável por hover e foco (sem JS, acessível por teclado). */
export function InfoTip({ text, label = "Mais informações" }: { text: string; label?: string }) {
  return (
    <span className="group/tip relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="rounded-full text-slate-500 transition-colors hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
