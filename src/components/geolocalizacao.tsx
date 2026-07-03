"use client";
// Aba GEOLOCALIZAÇÃO — o ÚNICO mapa da aplicação, por camadas. Para "ligar" uma nova camada
// (ex.: compras, obras, captação), basta adicionar uma entrada em CAMADAS e fornecer os pontos
// com esse `cat` em getMapaEquipamentosSC. Legenda, filtros e mapa se atualizam sozinhos.
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Database, MapPin, Search } from "lucide-react";
import type { MapaEquipamentosSC, PontoEquip } from "@/lib/queries";

const CAMADAS: { cat: PontoEquip["cat"]; label: string; cor: string }[] = [
  { cat: "saude", label: "Saúde", cor: "#e11d48" },
  { cat: "saude_filantropica", label: "Saúde filantrópica", cor: "#db2777" },
  { cat: "educacao", label: "Educação", cor: "#2563eb" },
  { cat: "assistencia", label: "Assistência", cor: "#7c3aed" },
  { cat: "policia", label: "Polícia", cor: "#0d9488" },
  { cat: "guarda_municipal", label: "Guarda Municipal", cor: "#16a34a" },
  { cat: "bombeiros", label: "Bombeiros", cor: "#b91c1c" },
  { cat: "defesa_civil", label: "Defesa Civil", cor: "#ca8a04" },
  { cat: "prisional", label: "Prisional", cor: "#334155" },
  { cat: "socioeducativo", label: "Socioeducativo", cor: "#ea580c" },
];
const CORES = Object.fromEntries(CAMADAS.map((c) => [c.cat, c.cor]));
const LABELS = Object.fromEntries(CAMADAS.map((c) => [c.cat, c.label]));

const MapaLeaflet = dynamic(() => import("./mapa-leaflet"), {
  ssr: false,
  loading: () => <div className="flex h-[540px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400">Carregando mapa…</div>,
});

export function Geolocalizacao({ data, nome }: { data: NonNullable<MapaEquipamentosSC>; nome: string }) {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(CAMADAS.map((c) => [c.cat, true])));
  const [tipoSel, setTipoSel] = useState("");
  const [precisao, setPrecisao] = useState("todos");
  const [busca, setBusca] = useState("");
  const toggle = (cat: string) => setOn((s) => ({ ...s, [cat]: !s[cat] }));

  // pontos das camadas ativas → base p/ os selects (tipos disponíveis dependem das camadas ligadas)
  const pontosCamada = useMemo(() => data.pontos.filter((p) => on[p.cat]), [data, on]);
  const tiposDisp = useMemo(() => [...new Set(pontosCamada.map((p) => p.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [pontosCamada]);
  const tipoEfetivo = tiposDisp.includes(tipoSel) ? tipoSel : "";
  const temAprox = useMemo(() => data.pontos.some((p) => p.aprox), [data]);
  const pontos = useMemo(() => pontosCamada.filter((p) =>
    (!tipoEfetivo || p.tipo === tipoEfetivo) &&
    (precisao !== "precisos" || !p.aprox) &&
    (!busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  ), [pontosCamada, tipoEfetivo, precisao, busca]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><MapPin className="h-4 w-4 text-teal-600" /> Geolocalização — equipamentos públicos de {nome}</div>
        <p className="mt-1 text-sm text-slate-600">Um único mapa com toda a rede pública no território — saúde, educação, assistência, segurança (polícia/bombeiros), defesa civil, prisional e socioeducativo — em camadas que se ligam e desligam. A base para regionalização, cobertura e planejamento espacial.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CAMADAS.map((c) => (
          <button key={c.cat} onClick={() => toggle(c.cat)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${on[c.cat] ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: on[c.cat] ? c.cor : "#cbd5e1" }} />
            {c.label} <span className="tabular-nums opacity-70">({data.porCat[c.cat] || 0})</span>
          </button>
        ))}
        <span className="ml-auto text-[12px] text-slate-500">{pontos.length} de {data.pontos.length} no mapa</span>
      </div>

      {/* SELECTS — o usuário compõe a visão: busca, tipo e precisão */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">tipo
          <select value={tipoEfetivo} onChange={(e) => setTipoSel(e.target.value)} className="max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">
            <option value="">Todos os tipos ({tiposDisp.length})</option>
            {tiposDisp.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {temAprox && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">precisão
            <select value={precisao} onChange={(e) => setPrecisao(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">
              <option value="todos">Todos</option>
              <option value="precisos">Só localização precisa</option>
            </select>
          </label>
        )}
        {(busca || tipoEfetivo || precisao !== "todos") && (
          <button onClick={() => { setBusca(""); setTipoSel(""); setPrecisao("todos"); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">limpar</button>
        )}
      </div>

      <MapaLeaflet pontos={pontos} center={data.center} cores={CORES} labels={LABELS} />

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Saúde (pública e filantrópica — ex.: Santas Casas): CNES. Educação: INEP/Censo Escolar. Assistência: CadSUAS (geocodificado). Polícia/Bombeiros/Defesa Civil/Prisional: OpenStreetMap. Socioeducativo: SAP/SC (DEASE). Mapa © OpenStreetMap.
        {data.assistOcultos > 0 && <> <b className="text-slate-600">{data.assistOcultos} unidade(s) de assistência não exibida(s)</b> — sem endereço público (ex.: acolhimento com local sigiloso, para proteção das pessoas atendidas).</>}
      </p>
    </div>
  );
}
