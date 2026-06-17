"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";

type Item = { codigo_ibge: string; nome: string; uf: string };

export function CidadaoPicker({ municipios, destaque }: { municipios: Item[]; destaque: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(destaque);
  const [pending, startTransition] = useTransition();
  const options = municipios.map((m) => ({ value: m.codigo_ibge, label: `${m.nome} — ${m.uf}` }));

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchableSelect
        options={options}
        value={codigo}
        onChange={setCodigo}
        placeholder="Encontre sua cidade"
        className="flex-1"
      />
      <button
        onClick={() => startTransition(() => router.push(`/cidadao/${codigo}`))}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "Abrindo…" : "Ver minha cidade"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
