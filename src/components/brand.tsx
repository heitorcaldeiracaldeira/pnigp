// Marca PNIGP — monograma próprio (arcos concêntricos = inteligência/radar territorial 360°).

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-sm ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-[58%] w-[58%]" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round">
        <path d="M23 23 A14 14 0 0 0 9 9" />
        <path d="M18.5 23 A9.5 9.5 0 0 0 9 13.5" />
        <path d="M14 23 A5 5 0 0 0 9 18" />
        <circle cx="9" cy="23" r="1.7" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Wordmark({
  subtitle,
  logoClass = "h-9 w-9",
}: {
  subtitle?: string;
  logoClass?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo className={logoClass} />
      <span className="leading-tight">
        <span className="block font-display text-base font-bold tracking-tight text-slate-900">PNIGP</span>
        {subtitle && <span className="block text-[11px] text-slate-500">{subtitle}</span>}
      </span>
    </span>
  );
}
