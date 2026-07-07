"use client";
// Wrapper client do mapa intraurbano com LAZY-LOAD: o GeoJSON (até ~1 MB) só é buscado quando
// o mapa entra na viewport (IntersectionObserver), fora do payload inicial da página.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const MapaSetores = dynamic(() => import("./mapa-setores"), { ssr: false });

type Geo = { geojson: unknown; maxDens: number; centro: [number, number] };

export default function MapaSetoresWrap({ codigo }: { codigo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [estado, setEstado] = useState<"idle" | "load" | "erro" | "vazio">("idle");

  useEffect(() => {
    const el = ref.current; if (!el || estado !== "idle") return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting) {
        io.disconnect(); setEstado("load");
        fetch(`/api/setores-geo/${codigo}`).then((r) => r.json()).then((d: Geo | null) => {
          if (d && d.geojson) { setGeo(d); setEstado("idle"); } else setEstado("vazio");
        }).catch(() => setEstado("erro"));
      }
    }, { rootMargin: "300px" });
    io.observe(el); return () => io.disconnect();
  }, [codigo, estado]);

  if (geo) return <MapaSetores geojson={geo.geojson} maxDens={geo.maxDens} centro={geo.centro} />;
  return (
    <div ref={ref} className="flex h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400">
      {estado === "erro" ? "Não foi possível carregar o mapa." : estado === "vazio" ? "Malha de setores indisponível." : "Carregando mapa intraurbano…"}
    </div>
  );
}
