"use client";
// Mapa coroplético (MapLibre) — municípios de SC pintados por intensidade (desmatamento km² ou focos de queimada).
// Município atual em destaque. Client-only (via next/dynamic ssr:false). Tiles OpenFreeMap.
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useMemo, useState } from "react";
import type { FeatureAmbiental } from "@/lib/queries";

type Metrica = "desmat" | "focos";
const LABELS: Record<Metrica, { nome: string; unidade: string; cor: string[] }> = {
  desmat: { nome: "Desmatamento acumulado", unidade: "km²", cor: ["#f0fdf4", "#86efac", "#f59e0b", "#dc2626", "#7f1d1d"] },
  focos: { nome: "Focos de calor", unidade: "focos", cor: ["#fffbeb", "#fde68a", "#f59e0b", "#dc2626", "#7f1d1d"] },
};

export default function MapaCoropletico({ features, metrica }: { features: FeatureAmbiental[]; metrica: Metrica }) {
  const [popup, setPopup] = useState<{ lng: number; lat: number; nome: string; desmat: number; focos: number } | null>(null);
  const cfg = LABELS[metrica];
  const max = useMemo(() => Math.max(...features.map((f) => f[metrica]), 1), [features, metrica]);

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: features.filter((f) => f.geom).map((f) => ({ type: "Feature" as const, geometry: f.geom as GeoJSON.Geometry, properties: { nome: f.nome, desmat: f.desmat, focos: f.focos, val: f[metrica], atual: f.atual ? 1 : 0 } })),
  }), [features, metrica]);

  const fill = ["interpolate", ["linear"], ["get", "val"], 0, cfg.cor[0], max * 0.05, cfg.cor[1], max * 0.2, cfg.cor[2], max * 0.5, cfg.cor[3], max, cfg.cor[4]] as unknown;

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]; if (!f) { setPopup(null); return; }
    const p = f.properties as Record<string, unknown>;
    setPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, nome: String(p.nome), desmat: Number(p.desmat), focos: Number(p.focos) });
  };

  return (
    <div style={{ height: 460 }} className="overflow-hidden rounded-2xl border border-slate-200">
      <Map initialViewState={{ longitude: -50.2, latitude: -27.3, zoom: 6.2 }} mapStyle="https://tiles.openfreemap.org/styles/positron" interactiveLayerIds={["munis-fill"]} onClick={onClick} style={{ width: "100%", height: "100%" }} attributionControl={{ compact: true }}>
      <Source id="munis" type="geojson" data={geojson}>
        <Layer id="munis-fill" type="fill" paint={{ "fill-color": fill as never, "fill-opacity": 0.75 }} />
        <Layer id="munis-line" type="line" paint={{ "line-color": "#94a3b8", "line-width": 0.4 }} />
        <Layer id="munis-atual" type="line" filter={["==", ["get", "atual"], 1]} paint={{ "line-color": "#1d4ed8", "line-width": 2.5 }} />
      </Source>
      {popup && (
        <Popup longitude={popup.lng} latitude={popup.lat} onClose={() => setPopup(null)} closeButton anchor="top" maxWidth="220px">
          <div style={{ fontSize: 12 }}><b>{popup.nome}</b><br />Desmatamento: <b>{popup.desmat.toLocaleString("pt-BR")} km²</b><br />Focos de calor: <b>{popup.focos.toLocaleString("pt-BR")}</b></div>
        </Popup>
      )}
      </Map>
    </div>
  );
}
