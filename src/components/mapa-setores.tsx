"use client";
// Mapa choropleth INTRAURBANO — setores censitários pintados por variável selecionável (densidade populacional
// ou % de idosos 60+). Revela a desigualdade DENTRO do município. Client-only (dynamic ssr:false). Tiles OpenFreeMap.
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useMemo, useState } from "react";

type MetricaId = "densPop" | "pctIdosos" | "pctCriancas";
const METRICAS: Record<MetricaId, { label: string; unidade: string; cores: string[] }> = {
  densPop: { label: "Densidade", unidade: "hab/km²", cores: ["#ede9fe", "#c4b5fd", "#a78bfa", "#7c3aed", "#5b21b6", "#3b0764"] },
  pctIdosos: { label: "% idosos (60+)", unidade: "%", cores: ["#f0fdfa", "#99f6e4", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"] },
  pctCriancas: { label: "% crianças (0-14)", unidade: "%", cores: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e40af", "#172554"] },
};

export default function MapaSetores({ geojson, maxDens, maxIdosos, maxCriancas, centro }: { geojson: unknown; maxDens: number; maxIdosos: number; maxCriancas: number; centro: [number, number] }) {
  const [metrica, setMetrica] = useState<MetricaId>("densPop");
  const [popup, setPopup] = useState<{ lng: number; lat: number; densPop: number; pop: number; pctIdosos: number; pctCriancas: number } | null>(null);
  const cfg = METRICAS[metrica];
  const max = metrica === "densPop" ? maxDens : metrica === "pctIdosos" ? maxIdosos : maxCriancas;

  const fill = useMemo(() => (["interpolate", ["linear"], ["get", metrica],
    0, cfg.cores[0], max * 0.05, cfg.cores[1], max * 0.15, cfg.cores[2], max * 0.35, cfg.cores[3], max * 0.65, cfg.cores[4], max, cfg.cores[5]] as unknown), [metrica, max, cfg]);

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]; if (!f) { setPopup(null); return; }
    const p = f.properties as Record<string, unknown>;
    setPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, densPop: Number(p.densPop), pop: Number(p.pop), pctIdosos: Number(p.pctIdosos ?? 0), pctCriancas: Number(p.pctCriancas ?? 0) });
  };
  const faixas = [0, 0.05, 0.15, 0.35, 0.65, 1].map((f, i) => ({ cor: cfg.cores[i], v: Math.round(max * f * 10) / 10 }));

  return (
    <div style={{ height: 440 }} className="relative overflow-hidden rounded-2xl border border-slate-200">
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg bg-white/90 p-1 shadow-sm">
        {(Object.keys(METRICAS) as MetricaId[]).map((m) => (
          <button key={m} onClick={() => setMetrica(m)} className={`rounded px-2 py-1 text-[10px] font-semibold transition ${metrica === m ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{METRICAS[m].label}</button>
        ))}
      </div>
      <Map initialViewState={{ longitude: centro[0], latitude: centro[1], zoom: 10.5 }} mapStyle="https://tiles.openfreemap.org/styles/positron" interactiveLayerIds={["setores-fill"]} onClick={onClick} style={{ width: "100%", height: "100%" }} attributionControl={{ compact: true }}>
        <Source id="setores" type="geojson" data={geojson as never}>
          <Layer id="setores-fill" type="fill" paint={{ "fill-color": fill as never, "fill-opacity": 0.72 }} />
          <Layer id="setores-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 0.3 }} />
        </Source>
        {popup && (
          <Popup longitude={popup.lng} latitude={popup.lat} onClose={() => setPopup(null)} closeButton anchor="top" maxWidth="220px">
            <div style={{ fontSize: 12 }}>População do setor: <b>{popup.pop.toLocaleString("pt-BR")}</b><br />Densidade: <b>{popup.densPop.toLocaleString("pt-BR")} hab/km²</b><br />Idosos (60+): <b>{popup.pctIdosos.toLocaleString("pt-BR")}%</b><br />Crianças (0-14): <b>{popup.pctCriancas.toLocaleString("pt-BR")}%</b></div>
          </Popup>
        )}
      </Map>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1.5 text-[9px] shadow-sm">
        <div className="mb-0.5 font-semibold text-slate-600">{cfg.label} ({cfg.unidade})</div>
        <div className="flex items-center gap-0.5">{faixas.map((f, i) => (<span key={i} className="inline-block h-2.5 w-6" style={{ background: f.cor }} title={`${f.v}`} />))}</div>
        <div className="flex justify-between text-slate-400"><span>0</span><span>{max.toLocaleString("pt-BR")}</span></div>
      </div>
    </div>
  );
}
