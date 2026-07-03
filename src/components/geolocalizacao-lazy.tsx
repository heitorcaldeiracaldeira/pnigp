"use client";

// Wrapper que carrega o mapa SOB DEMANDA (client-fetch ao montar) — tira ~846 KB do HTML inicial do painel.
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Geolocalizacao } from "@/components/geolocalizacao";
import type { MapaEquipamentosSC } from "@/lib/queries";

export function GeolocalizacaoLazy({ codigo, nome }: { codigo: string; nome: string }) {
  const [data, setData] = useState<MapaEquipamentosSC | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/equipamentos-geo/${codigo}`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setData(d); })
      .catch(() => { if (vivo) setData(null); });
    return () => { vivo = false; };
  }, [codigo]);

  if (data === undefined)
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <MapPin aria-hidden className="h-4 w-4 animate-pulse text-teal-600" /> Carregando o mapa de equipamentos…
      </div>
    );
  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Mapa de equipamentos indisponível no momento.</div>;
  return <Geolocalizacao data={data} nome={nome} />;
}
