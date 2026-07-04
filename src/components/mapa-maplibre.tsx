"use client";
// Renderizador do mapa (MapLibre GL — WebGL/GPU). Client-only (via next/dynamic ssr:false).
// Clustering NATIVO via GeoJSON source. Tiles vetoriais OpenFreeMap (grátis, sem API key).
// Modo "colorir por indicador INEP" (afd/tdi/atu por escola): tira o cluster, mostra só escolas coloridas por valor.
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, Source, Layer, Popup, NavigationControl, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { useCallback, useMemo, useRef, useState } from "react";
import type { PontoEquip } from "@/lib/queries";

export type CorIndicador = "afd" | "tdi" | "atu" | null;
type Props = { pontos: PontoEquip[]; center: [number, number]; cores: Record<string, string>; labels: Record<string, string>; corIndicador?: CorIndicador };
type PopupInfo = { lng: number; lat: number; nome: string; cat: string; tipo: string; bairro: string; aprox: boolean; afd: number | null; tdi: number | null; atu: number | null };

// escalas de cor por indicador (verde=melhor, vermelho=pior). stops [valor, cor].
const ESCALA: Record<string, { stops: [number, string][] }> = {
  afd: { stops: [[40, "#dc2626"], [70, "#f59e0b"], [85, "#84cc16"], [100, "#16a34a"]] }, // % adequado — alto é bom
  tdi: { stops: [[0, "#16a34a"], [5, "#84cc16"], [15, "#f59e0b"], [30, "#dc2626"]] },     // distorção — baixo é bom
  atu: { stops: [[12, "#16a34a"], [20, "#84cc16"], [28, "#f59e0b"], [38, "#dc2626"]] },   // alunos/turma — baixo é bom
};

export default function MapaMaplibre({ pontos, center, cores, labels, corIndicador = null }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const modoInd = corIndicador != null;

  const geojson = useMemo(() => {
    // no modo indicador, só escolas com o indicador; senão, todos os pontos
    const base = modoInd ? pontos.filter((p) => p.cat === "educacao" && p[corIndicador!] != null) : pontos;
    return {
      type: "FeatureCollection" as const,
      features: base.filter((p) => p.lat != null && p.lon != null).map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: { nome: p.nome, cat: p.cat, tipo: p.tipo, bairro: p.bairro || "", aprox: p.aprox ? 1 : 0, cor: cores[p.cat] || "#64748b", afd: p.afd ?? null, tdi: p.tdi ?? null, atu: p.atu ?? null, valInd: modoInd ? (p[corIndicador!] as number) : null },
      })),
    };
  }, [pontos, cores, modoInd, corIndicador]);

  const corPonto = useMemo(() => {
    if (!modoInd) return ["get", "cor"] as unknown;
    const stops = ESCALA[corIndicador!].stops;
    return ["interpolate", ["linear"], ["get", "valInd"], ...stops.flat()] as unknown;
  }, [modoInd, corIndicador]);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) { setPopup(null); return; }
    const props = f.properties as Record<string, unknown>;
    const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
    if (props.cluster) {
      const src = mapRef.current?.getSource("pontos") as unknown as { getClusterExpansionZoom: (id: number) => Promise<number> };
      src?.getClusterExpansionZoom(Number(props.cluster_id)).then((z) => mapRef.current?.easeTo({ center: [lng, lat], zoom: z, duration: 500 })).catch(() => {});
      return;
    }
    const nn = (v: unknown) => (v == null ? null : Number(v));
    setPopup({ lng, lat, nome: String(props.nome || ""), cat: String(props.cat || ""), tipo: String(props.tipo || ""), bairro: String(props.bairro || ""), aprox: props.aprox === 1, afd: nn(props.afd), tdi: nn(props.tdi), atu: nn(props.atu) });
  }, []);

  return (
    <div style={{ height: 540 }} className="overflow-hidden rounded-2xl border border-slate-200">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom: 11 }}
        mapStyle="https://tiles.openfreemap.org/styles/positron"
        interactiveLayerIds={["clusters", "unclustered"]}
        onClick={onClick}
        onMouseEnter={() => { if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer"; }}
        onMouseLeave={() => { if (mapRef.current) mapRef.current.getCanvas().style.cursor = ""; }}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="pontos" type="geojson" data={geojson} cluster={!modoInd} clusterRadius={48} clusterMaxZoom={13}>
          <Layer id="clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": "#0d9488", "circle-opacity": 0.85, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24, 500, 30] }} />
          <Layer id="cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 }} paint={{ "text-color": "#ffffff" }} />
          <Layer id="unclustered" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-color": corPonto as never, "circle-radius": modoInd ? 7 : 6, "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff", "circle-opacity": 0.92 }} />
        </Source>
        {popup && (
          <Popup longitude={popup.lng} latitude={popup.lat} onClose={() => setPopup(null)} closeButton anchor="top" maxWidth="280px">
            <div style={{ maxWidth: 250 }}>
              <b>{popup.nome}</b><br />
              <span style={{ color: cores[popup.cat] }}>● {labels[popup.cat] || popup.cat}</span> · {popup.tipo}{popup.bairro ? ` · ${popup.bairro}` : ""}
              {popup.cat === "educacao" && (popup.afd != null || popup.tdi != null || popup.atu != null) && (
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#475569" }}>
                  {popup.afd != null && <>Formação docente: <b>{popup.afd}%</b> · </>}
                  {popup.tdi != null && <>Distorção: <b>{popup.tdi}%</b> · </>}
                  {popup.atu != null && <>Alunos/turma: <b>{popup.atu}</b></>}
                </div>
              )}
              {popup.aprox && <><br /><i style={{ color: "#94a3b8" }}>📍 local aproximado (pelo CEP)</i></>}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
