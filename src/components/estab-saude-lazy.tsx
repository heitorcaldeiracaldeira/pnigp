"use client";

// Defere o RENDER dos Equipamentos de Saúde (~2,4MB de HTML, todos os estabelecimentos) para o cliente.
import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import type { EstabSaudeSC, PerfilSaudeSC } from "@/lib/queries";

const carregando = (
  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
    <Activity aria-hidden className="h-4 w-4 animate-pulse text-teal-600" /> Carregando os equipamentos de saúde…
  </div>
);
const PerfilSaude = dynamic(() => import("@/components/perfil-saude").then((m) => ({ default: m.PerfilSaude })), { ssr: false });
const EstabSaudeDrill = dynamic(() => import("@/components/estab-saude-drill").then((m) => ({ default: m.EstabSaudeDrill })), { ssr: false, loading: () => carregando });

export function EstabSaudeLazy({ estabSaude, perfilSaude, nome }: { estabSaude: EstabSaudeSC; perfilSaude: PerfilSaudeSC; nome: string }) {
  return (
    <>
      {perfilSaude && <div className="mt-4"><PerfilSaude dados={perfilSaude} nome={nome} /></div>}
      <div className="mt-4"><EstabSaudeDrill dados={estabSaude} nome={nome} /></div>
    </>
  );
}
