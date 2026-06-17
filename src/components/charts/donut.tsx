"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtBRLCompact } from "@/lib/ui";

const CORES = ["#0f766e", "#0891b2", "#2563eb", "#7c3aed", "#f59e0b", "#10b981", "#64748b"];

export function Donut({
  data,
  moeda = true,
}: {
  data: { label: string; valor: number }[];
  moeda?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="valor" nameKey="label" innerRadius="52%" outerRadius="80%" paddingAngle={2} stroke="none" isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={CORES[i % CORES.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [moeda ? fmtBRLCompact(Number(v)) : String(v), ""]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
