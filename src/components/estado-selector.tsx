"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type Item = { uf: string; nome: string };

export function EstadoSelector({ estados, atual }: { estados: Item[]; atual: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const options = estados.map((e) => ({ value: e.uf, label: `${e.nome} — ${e.uf}` }));

  return (
    <SearchableSelect
      options={options}
      value={atual}
      onChange={(uf) => startTransition(() => router.push(`/governador/${uf}`))}
      placeholder="Selecione o estado"
      className="w-[260px]"
    />
  );
}
