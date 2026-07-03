"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";

type Municipio = { codigo_ibge: string; nome: string; uf: string };
type Estado = { uf: string; nome: string };

export function LoginCard({
  municipios,
  destaqueMunicipio,
}: {
  municipios: Municipio[];
  estados?: Estado[]; // recebido da home mas não usado enquanto o modo Governador está bloqueado
  destaqueMunicipio: string;
  destaqueEstado?: string;
}) {
  const router = useRouter();
  const [codMun, setCodMun] = useState(destaqueMunicipio);
  const [pending, startTransition] = useTransition();

  const munOpts = useMemo(
    () => municipios.map((m) => ({ value: m.codigo_ibge, label: `${m.nome} — ${m.uf}` })),
    [municipios],
  );

  const entrar = () =>
    startTransition(() => router.push(`/real/${codMun}`));

  const tabBase =
    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Acesso do gestor</h2>
      <p className="mb-5 text-sm text-slate-500">
        Modo demonstração — escolha o nível de governo e o ente para explorar
      </p>

      {/* Modo Governador bloqueado até haver comparação Estado×Estado (mais UFs). Só Prefeito por ora. */}
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        <div className={`${tabBase} bg-teal-700 text-white`}>
          <Building2 className="h-4 w-4" />
          Prefeito
        </div>
      </div>

      <label className="mb-2 block text-sm font-medium text-slate-600">
        Selecione o município
      </label>

      <SearchableSelect options={munOpts} value={codMun} onChange={setCodMun} placeholder="Município" />

      <button
        onClick={entrar}
        disabled={pending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "Carregando..." : "Acessar painel"}
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-4 text-center text-xs text-slate-500">
        Demonstração institucional · dados simulados
      </p>
    </div>
  );
}
