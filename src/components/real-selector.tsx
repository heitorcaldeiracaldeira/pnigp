"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

export function RealSelector({
  options,
  atual,
}: {
  options: { value: string; label: string }[];
  atual: string;
}) {
  const router = useRouter();
  return (
    <SearchableSelect
      options={options}
      value={atual}
      onChange={(v) => v && router.push(`/real/${v}`)}
      placeholder="Buscar município de SC…"
      className="w-full sm:w-80"
    />
  );
}
