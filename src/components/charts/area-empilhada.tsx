"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRLCompact } from "@/lib/ui";

// Área empilhada — leitura de COMPOSIÇÃO ao longo do tempo (distinta da linha, que mostra trajetória).
export function AreaEmpilhada({
  data,
  areas,
  altura = 260,
  moeda = true,
}: {
  data: Record<string, number>[];
  areas: { key: string; label: string; cor: string }[];
  altura?: number;
  moeda?: boolean;
}) {
  const fmtNum = (v: number) => {
    const n = Math.abs(v);
    if (n >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (n >= 1e3) return (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  };
  const fmt = (v: number) => (moeda ? fmtBRLCompact(v) : fmtNum(v));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <defs>
          {areas.map((a) => (
            <linearGradient key={a.key} id={`grad-${a.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={a.cor} stopOpacity={0.7} />
              <stop offset="100%" stopColor={a.cor} stopOpacity={0.15} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="ano" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }} formatter={(v, n) => [fmt(Number(v)), n as string]} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
        {areas.map((a) => (
          <Area key={a.key} type="monotone" dataKey={a.key} name={a.label} stackId="1" stroke={a.cor} strokeWidth={1.5} fill={`url(#grad-${a.key})`} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
