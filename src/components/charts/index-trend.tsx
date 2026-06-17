"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  ano: number;
  iceb: number;
  invp: number;
  igp360: number;
};

export function IndexTrend({ data }: { data: Point[] }) {
  const vals = data.flatMap((d) => [d.iceb, d.invp, d.igp360]);
  const min = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 5) / 5) * 5) : 0;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 12, right: 28, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="ano" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={false} />
        <YAxis domain={[min, 100]} tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(v) => [Number(v).toFixed(1), ""]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* IGP 360 em destaque; ICEB/INVP como contexto */}
        <Line type="monotone" dataKey="iceb" name="ICEB" stroke="#2563eb" strokeWidth={1.5} strokeOpacity={0.55} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="invp" name="INVP" stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.55} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="igp360" name="IGP 360" stroke="#0f766e" strokeWidth={3.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
