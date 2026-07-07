"use client";
// Mapa choropleth INTRAURBANO — setores censitários do município pintados por densidade populacional (hab/km²).
// Revela a desigualdade DENTRO do município. Client-only (via next/dynamic ssr:false). Tiles OpenFreeMap.
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useMemo, useState } from "react";

const CORES = ["#ede9fe", "#c4b5fd", "#a78bfa", "#7c3aed", "#5b21b6", "#3b0764"];

export default function MapaSetores({ geojson, maxDens, centro }: { geojson: unknown; maxDens: number; centro: [number, number] }) {
  const [popup, setPopup] = useState<{ lng: number; lat: number; densPop: number; pop: number } | null>(null);
  const fill = useMemo(() => (["interpolate", ["linear"], ["get", "densPop"],
    0, CORES[0], maxDens * 0.05, CORES[1], maxDens * 0.15, CORES[2], maxDens * 0.35, CORES[3], maxDens * 0.65, CORES[4], maxDens, CORES[5]] as unknown), [maxDens]);

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]; if (!f) { setPopup(null); return; }
    const p = f.properties as Record<string, unknown>;
    setPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, densPop: Number(p.densPop), pop: Number(p.pop) });
  };
  const faixas = [0, 0.05, 0.15, 0.35, 0.65, 1].map((f, i) => ({ cor: CORES[i], v: Math.round(maxDens * f) }));

  return (
    <div style={{ height: 420 }} className="relative overflow-hidden rounded-2xl border border-slate-200">
      <Map initialViewState={{ longitude: centro[0], latitude: centro[1], zoom: 10.5 }} mapStyle="https://tiles.openfreemap.org/styles/positron" interactiveLayerIds={["setores-fill"]} onClick={onClick} style={{ width: "100%", height: "100%" }} attributionControl={{ compact: true }}>
        <Source id="setores" type="geojson" data={geojson as never}>
          <Layer id="setores-fill" type="fill" paint={{ "fill-color": fill as never, "fill-opacity": 0.72 }} />
          <Layer id="setores-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 0.3 }} />
        </Source>
        {popup && (
          <Popup longitude={popup.lng} latitude={popup.lat} onClose={() => setPopup(null)} closeButton anchor="top" maxWidth="220px">
            <div style={{ fontSize: 12 }}>Densidade: <b>{popup.densPop.toLocaleString("pt-BR")} hab/km²</b><br />População do setor: <b>{popup.pop.toLocaleString("pt-BR")}</b></div>
          </Popup>
        )}
      </Map>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1.5 text-[9px] shadow-sm">
        <div className="mb-0.5 font-semibold text-slate-600">Densidade (hab/km²)</div>
        <div className="flex items-center gap-0.5">{faixas.map((f) => (<span key={f.cor} className="inline-block h-2.5 w-6" style={{ background: f.cor }} title={`${f.v}`} />))}</div>
        <div className="flex justify-between text-slate-400"><span>0</span><span>{maxDens.toLocaleString("pt-BR")}</span></div>
      </div>
    </div>
  );
}
