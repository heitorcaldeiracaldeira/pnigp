"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function CapacityRadar({
  data,
}: {
  data: { dimensao: string; valor: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="dimensao" tick={{ fontSize: 11, fill: "#475569" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} angle={90} />
        <Radar dataKey="valor" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [Number(v).toFixed(1), "Pontuação"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
