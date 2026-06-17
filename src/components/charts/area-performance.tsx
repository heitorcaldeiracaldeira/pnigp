"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Item = { label: string; score: number; classe: "acima" | "media" | "abaixo" };

const COR: Record<Item["classe"], string> = {
  acima: "#10b981",
  media: "#f59e0b",
  abaixo: "#e11d48",
};

export function AreaPerformance({ data }: { data: Item[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 28, left: 8, bottom: 4 }} barCategoryGap={6}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [`${Number(v).toFixed(0)}/100`, "vs. pares"]}
        />
        <ReferenceLine x={50} stroke="#94a3b8" strokeDasharray="4 3" />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={COR[d.classe]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
