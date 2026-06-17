import Link from "next/link";
import { Building2, Landmark } from "lucide-react";

export function PanelSwitch({ active }: { active: "prefeito" | "governador" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition sm:px-3";
  const on = "bg-teal-700 text-white";
  const off = "text-slate-500 hover:bg-slate-100";

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
      <Link href="/painel" className={`${base} ${active === "prefeito" ? on : off}`}>
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Prefeito</span>
      </Link>
      <Link href="/governador" className={`${base} ${active === "governador" ? on : off}`}>
        <Landmark className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Governador</span>
      </Link>
    </div>
  );
}
