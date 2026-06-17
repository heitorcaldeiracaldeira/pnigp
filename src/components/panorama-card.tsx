import { ArrowRight } from "lucide-react";

/** Card do painel "Panorama" — clicável, leva à aba detalhada via #hash. */
export function PanoramaCard({
  href,
  titulo,
  sub,
  className = "",
  children,
}: {
  href: string;
  titulo: string;
  sub: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`group block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${className}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-500">{sub}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
          Ver detalhe <ArrowRight className="h-3 w-3" />
        </span>
      </div>
      {children}
    </a>
  );
}
