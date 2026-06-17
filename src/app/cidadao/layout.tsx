import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand";

export default function CidadaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 lg:px-6">
          <Link href="/cidadao" className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="font-display text-base font-bold tracking-tight text-slate-900">Portal do Cidadão</div>
              <div className="text-[11px] text-slate-500">PNIGP · Instituto I10</div>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-teal-700"
          >
            Sou gestor <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
