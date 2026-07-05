"use client";
// Análise ambiental por município — mapa coroplético de SC (desmatamento PRODES ou focos INPE), com o município em destaque
// e sua posição no ranking estadual. Wrapper client (toggle + dynamic import do renderizador). CSV + origem + data.
import dynamic from "next/dynamic";
import { useState } from "react";
import type { getMapaAmbientalSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import { Trees, Flame, Database } from "lucide-react";

type Data = NonNullable<Awaited<ReturnType<typeof getMapaAmbientalSC>>>;
const MapaCoropletico = dynamic(() => import("./mapa-coropletico"), { ssr: false, loading: () => <div className="flex h-[460px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400">Carregando mapa…</div> });

export function MapaAmbiental({ data, nome }: { data: Data; nome: string }) {
  const [metrica, setMetrica] = useState<"desmat" | "focos">("desmat");
  const posFocos = data.features.filter((f) => f.focos > data.atualFocos).length + 1;
  const csv = [...data.features].sort((a, b) => b.desmat - a.desmat).map((f) => ({ municipio: f.nome, desmatamento_km2: f.desmat, focos: f.focos }));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Análise ambiental por município — Santa Catarina</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px]">
            <button onClick={() => setMetrica("desmat")} className={`flex items-center gap-1 rounded px-2 py-1 font-semibold ${metrica === "desmat" ? "bg-green-100 text-green-800" : "text-slate-500"}`}><Trees className="h-3 w-3" /> Desmatamento</button>
            <button onClick={() => setMetrica("focos")} className={`flex items-center gap-1 rounded px-2 py-1 font-semibold ${metrica === "focos" ? "bg-orange-100 text-orange-800" : "text-slate-500"}`}><Flame className="h-3 w-3" /> Queimadas</button>
          </div>
          <BaixarCsv nome="ambiental-por-municipio-sc" label="CSV" linhas={csv as unknown as Record<string, unknown>[]} colunas={[{ chave: "municipio", rotulo: "Município" }, { chave: "desmatamento_km2", rotulo: "Desmatamento (km²)" }, { chave: "focos", rotulo: "Focos de calor" }]} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-slate-600">
        <div><b className="text-slate-800">{nome}:</b> {data.atualDesmat.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km² desmatados (2004-2024) · <b>{data.posDesmat}º</b> de {data.totalMunis} em SC</div>
        <div>· {data.atualFocos.toLocaleString("pt-BR")} focos · {posFocos}º em queimadas</div>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">Cada município pintado pela intensidade de <b>{metrica === "desmat" ? "desmatamento acumulado" : "focos de calor"}</b>. O seu está contornado em azul. Clique para ver os valores. SC desmatou <b>{data.scDesmat.toLocaleString("pt-BR")} km²</b> no período.</p>

      <div className="mt-3"><MapaCoropletico features={data.features} metrica={metrica} /></div>

      <p className="mt-2 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dados oficiais</span>Fontes: <b>INPE — PRODES</b> (desmatamento Mata Atlântica) e <b>INPE — BDQueimadas</b> (focos). Área por município via interseção espacial (polígonos × malha IBGE, PostGIS).{data.extraido && <> · extraído em {data.extraido}</>}</p>
    </section>
  );
}
