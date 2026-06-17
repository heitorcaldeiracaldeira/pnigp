"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type Item = { codigo_ibge: string; nome: string; uf: string };

export function MunicipioSelector({
  municipios,
  atual,
}: {
  municipios: Item[];
  atual: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const options = municipios.map((m) => ({
    value: m.codigo_ibge,
    label: `${m.nome} — ${m.uf}`,
  }));

  return (
    <SearchableSelect
      options={options}
      value={atual}
      onChange={(codigo) => startTransition(() => router.push(`/painel/${codigo}`))}
      placeholder="Selecione o município"
      className="w-[260px]"
    />
  );
}
