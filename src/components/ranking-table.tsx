"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RankRow = {
  posicao: number;
  codigo: string;
  nome: string;
  uf: string;
  grupo: string;
  igp360: number;
  iceb: number;
  invp: number;
};

export function RankingTable({
  ranking,
  codigoAtual,
  grupoHeader,
  destaqueLabel,
}: {
  ranking: RankRow[];
  codigoAtual: string;
  grupoHeader: string;
  destaqueLabel: string;
}) {
  const grupos = Array.from(new Set(ranking.map((r) => r.grupo)));
  const meuGrupo = ranking.find((r) => r.codigo === codigoAtual)?.grupo;
  const [filtro, setFiltro] = useState<string>("todos");

  const visiveis = filtro === "todos" ? ranking : ranking.filter((r) => r.grupo === filtro);

  const chip = (val: string, label: string) => (
    <button
      key={val}
      onClick={() => setFiltro(val)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
        filtro === val ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">Filtrar por {grupoHeader.toLowerCase()}:</span>
        {chip("todos", "Todos")}
        {meuGrupo && chip(meuGrupo, `Meu grupo (${meuGrupo})`)}
        {grupos
          .filter((g) => g !== meuGrupo)
          .map((g) => chip(g, g))}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{grupoHeader === "Região" ? "Estado" : "Município"}</TableHead>
              <TableHead className="hidden sm:table-cell">{grupoHeader}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">ICEB</TableHead>
              <TableHead className="hidden text-right sm:table-cell">INVP</TableHead>
              <TableHead className="text-right">IGP 360</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((r) => {
              const atual = r.codigo === codigoAtual;
              return (
                <TableRow key={r.codigo} className={atual ? "bg-teal-50 hover:bg-teal-50" : undefined}>
                  <TableCell className="font-semibold tabular-nums">
                    {r.posicao <= 3 ? <span aria-hidden="true">{["🥇", "🥈", "🥉"][r.posicao - 1]}</span> : r.posicao}
                    {r.posicao <= 3 && <span className="sr-only">{r.posicao}º lugar</span>}
                  </TableCell>
                  <TableCell className={atual ? "font-bold text-teal-800" : "font-medium"}>
                    {r.nome} — {r.uf}
                    {atual && (
                      <span className="ml-2 rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {destaqueLabel}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-slate-500 sm:table-cell">{r.grupo}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{r.iceb.toFixed(1)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{r.invp.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-teal-700">{r.igp360.toFixed(1)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
