"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Building2, Landmark } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";

type Municipio = { codigo_ibge: string; nome: string; uf: string };
type Estado = { uf: string; nome: string };

export function LoginCard({
  municipios,
  estados,
  destaqueMunicipio,
  destaqueEstado,
}: {
  municipios: Municipio[];
  estados: Estado[];
  destaqueMunicipio: string;
  destaqueEstado: string;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"prefeito" | "governador">("prefeito");
  const [codMun, setCodMun] = useState(destaqueMunicipio);
  const [uf, setUf] = useState(destaqueEstado);
  const [pending, startTransition] = useTransition();

  const munOpts = useMemo(
    () => municipios.map((m) => ({ value: m.codigo_ibge, label: `${m.nome} — ${m.uf}` })),
    [municipios],
  );
  const estOpts = useMemo(
    () => estados.map((e) => ({ value: e.uf, label: `${e.nome} — ${e.uf}` })),
    [estados],
  );

  const entrar = () =>
    startTransition(() =>
      router.push(modo === "prefeito" ? `/painel/${codMun}` : `/governador/${uf}`),
    );

  const tabBase =
    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Acesso do gestor</h2>
      <p className="mb-5 text-sm text-slate-500">
        Modo demonstração — escolha o nível de governo e o ente para explorar
      </p>

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setModo("prefeito")}
          className={`${tabBase} ${modo === "prefeito" ? "bg-teal-700 text-white" : "text-slate-500"}`}
        >
          <Building2 className="h-4 w-4" />
          Prefeito
        </button>
        <button
          onClick={() => setModo("governador")}
          className={`${tabBase} ${modo === "governador" ? "bg-teal-700 text-white" : "text-slate-500"}`}
        >
          <Landmark className="h-4 w-4" />
          Governador
        </button>
      </div>

      <label className="mb-2 block text-sm font-medium text-slate-600">
        {modo === "prefeito" ? "Selecione o município" : "Selecione o estado"}
      </label>

      {modo === "prefeito" ? (
        <SearchableSelect options={munOpts} value={codMun} onChange={setCodMun} placeholder="Município" />
      ) : (
        <SearchableSelect options={estOpts} value={uf} onChange={setUf} placeholder="Estado" />
      )}

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
