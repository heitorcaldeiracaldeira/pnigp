"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRLCompact } from "@/lib/ui";

export function OrcadoExecutado({
  data,
}: {
  data: { label: string; orcado: number; executado: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={2} barCategoryGap={12}>
        <XAxis type="number" tickFormatter={(v) => fmtBRLCompact(Number(v))} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [fmtBRLCompact(Number(v)), ""]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Bar dataKey="orcado" name="Orçado" fill="#94a3b8" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        <Bar dataKey="executado" name="Executado" fill="#0f766e" radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
