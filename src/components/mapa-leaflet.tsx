"use client";
// Renderizador do mapa (Leaflet). Client-only — carregado via next/dynamic(ssr:false) pelo wrapper,
// pois o Leaflet acessa window/document no import. Usa CircleMarker (sem ícones de imagem → sem bug de bundler).
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import type { PontoEquip } from "@/lib/queries";

export default function MapaLeaflet({ pontos, center, cores, labels }: {
  pontos: PontoEquip[];
  center: [number, number];
  cores: Record<string, string>;
  labels: Record<string, string>;
}) {
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom={false} style={{ height: 540, width: "100%" }} className="z-0 rounded-2xl">
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pontos.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lon]} radius={6} pathOptions={{ color: "#ffffff", weight: 1, fillColor: cores[p.cat] || "#64748b", fillOpacity: 0.85 }}>
          {/* hover: informações da estrutura */}
          <Tooltip direction="top" offset={[0, -4]} opacity={1}>
            <div style={{ maxWidth: 240 }}>
              <b>{p.nome}</b><br />
              <span style={{ color: cores[p.cat] }}>● {labels[p.cat] || p.cat}</span> · {p.tipo}{p.bairro ? ` · ${p.bairro}` : ""}
              {p.aprox && <><br /><i style={{ color: "#94a3b8" }}>local aproximado (pelo CEP)</i></>}
            </div>
          </Tooltip>
          <Popup>
            <b>{p.nome}</b><br />
            <span style={{ color: cores[p.cat] }}>{labels[p.cat] || p.cat}</span> · {p.tipo}{p.bairro ? ` · ${p.bairro}` : ""}
            {p.aprox && <><br /><i style={{ color: "#94a3b8" }}>📍 local aproximado pelo CEP</i></>}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
