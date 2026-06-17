"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRLCompact } from "@/lib/ui";

export function LinhasFinanceiras({
  data,
  linhas,
  altura = 260,
}: {
  data: Record<string, number>[];
  linhas: { key: string; label: string; cor: string }[];
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="ano" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis tickFormatter={(v) => fmtBRLCompact(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [fmtBRLCompact(Number(v)), ""]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {linhas.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.cor} strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
