"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  GraduationCap,
  HeartPulse,
  Landmark,
  Minus,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AREA_ORDER,
  AREAS,
  type AreaKey,
  evalDelta,
  fmtValor,
  melhorQueMedia,
} from "@/lib/ui";

type Row = {
  codigo: string;
  nome: string;
  area: string;
  unidade: string;
  fonte: string;
  direcao_melhor: "alta" | "baixa";
  valor: number;
  valor_anterior: number | null;
  media: number;
};

const ICONS: Record<string, LucideIcon> = {
  HeartPulse,
  GraduationCap,
  ShieldCheck,
  Landmark,
  Users,
  TrendingUp,
};

export function IndicatorsSection({
  indicadores,
  benchmarkLabel = "Média do porte",
}: {
  indicadores: Row[];
  benchmarkLabel?: string;
}) {
  const byArea = (a: AreaKey) => indicadores.filter((i) => i.area === a);

  return (
    <Tabs defaultValue={AREA_ORDER[0]} className="w-full">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
        {AREA_ORDER.map((a) => {
          const Icon = ICONS[AREAS[a].icon];
          return (
            <TabsTrigger key={a} value={a} className="gap-1.5 data-[state=active]:bg-white">
              <Icon className={`h-4 w-4 ${AREAS[a].color}`} />
              {AREAS[a].label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {AREA_ORDER.map((a) => (
        <TabsContent key={a} value={a} className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">vs. 2023</TableHead>
                <TableHead className="text-right">{benchmarkLabel}</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byArea(a).map((row) => {
                const delta = evalDelta(row.valor, row.valor_anterior, row.direcao_melhor);
                const melhor = melhorQueMedia(row.valor, row.media, row.direcao_melhor);
                return (
                  <TableRow key={row.codigo}>
                    <TableCell>
                      <div className="font-medium text-slate-800">{row.nome}</div>
                      <div className="text-xs text-slate-500">Fonte: {row.fonte}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtValor(row.valor, row.unidade)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {delta ? (
                        <span
                          className={`inline-flex items-center justify-end gap-0.5 ${
                            delta.bom ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {delta.pct > 0.05 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : delta.pct < -0.05 ? (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                          {Math.abs(delta.pct).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {fmtValor(row.media, row.unidade)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          melhor
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-orange-200 bg-orange-50 text-orange-700"
                        }
                      >
                        {melhor ? "Acima da média" : "Abaixo da média"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>
      ))}
    </Tabs>
  );
}
