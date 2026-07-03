"use client";

// Auditoria sob demanda: o `diag` (~2,6 MB) é buscado via API ao abrir a aba (não vai no HTML inicial),
// e o RENDER (AuditoriaSC) ocorre no cliente. Tira o maior bloco do painel /real.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ShieldAlert } from "lucide-react";
import type { DiagGestor } from "@/lib/queries";

type Radar = { dimensao: string; valor: number; bruto: string }[];

const AuditoriaSC = dynamic(() => import("@/components/auditoria-sc").then((m) => ({ default: m.AuditoriaSC })), { ssr: false });

const carregando = (
  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
    <ShieldAlert aria-hidden className="h-4 w-4 animate-pulse text-rose-600" /> Carregando a auditoria…
  </div>
);

export function AuditoriaLazy({ codigo, radar }: { codigo: string; radar?: Radar }) {
  const [diag, setDiag] = useState<DiagGestor | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/auditoria-diag/${codigo}`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setDiag(d); })
      .catch(() => { if (vivo) setDiag(null); });
    return () => { vivo = false; };
  }, [codigo]);
  if (diag === undefined) return carregando;
  if (!diag) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Auditoria indisponível no momento.</div>;
  return <AuditoriaSC data={diag} radar={radar} />;
}
