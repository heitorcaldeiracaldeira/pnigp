import { Building2, Database, HandHeart, MapPin, Phone } from "lucide-react";
import type { EquipamentosSuasSC } from "@/lib/queries";
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// rótulo/cor por tipo de unidade do SUAS
const TIPO: Record<string, { ic: string; cls: string }> = {
  "CRAS": { ic: "🏠", cls: "bg-emerald-100 text-emerald-700" },
  "CREAS": { ic: "🛡️", cls: "bg-sky-100 text-sky-700" },
  "CREAS REGIONAL": { ic: "🛡️", cls: "bg-sky-100 text-sky-700" },
  "CENTRO POP": { ic: "🏙️", cls: "bg-amber-100 text-amber-700" },
  "UNIDADE DE ACOLHIMENTO": { ic: "🏘️", cls: "bg-violet-100 text-violet-700" },
  "CENTRO DE CONVIVENCIA": { ic: "🤝", cls: "bg-teal-100 text-teal-700" },
  "CENTRO-DIA": { ic: "☀️", cls: "bg-orange-100 text-orange-700" },
  "POSTO CADASTRO UNICO": { ic: "📋", cls: "bg-slate-100 text-slate-600" },
  "OUTRA": { ic: "📌", cls: "bg-slate-100 text-slate-500" },
};
const meta = (t: string) => TIPO[t] || TIPO.OUTRA;

export function EquipamentosSuasDrill({ dados, nome }: { dados: NonNullable<EquipamentosSuasSC>; nome: string }) {
  const grupos = dados.lista.reduce<Record<string, typeof dados.lista>>((a, u) => { (a[u.tipo] ||= []).push(u); return a; }, {});
  const ordem = dados.porTipo.map((t) => t.tipo);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-white p-5">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900"><HandHeart className="h-4 w-4 text-teal-600" /> Equipamentos Públicos — Assistência Social</h3>
        <p className="text-sm text-slate-500">A rede socioassistencial de {nome}, unidade a unidade (CRAS, CREAS, Centro POP, acolhimento) — o nível mais concreto do SUAS. Base para regionalização, referência e contrarreferência.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" /> Unidades</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{dados.total}</div>
        </div>
        {dados.porTipo.map((t) => (
          <div key={t.tipo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{meta(t.tipo).ic} {t.tipo}</div>
            <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{t.n}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {ordem.map((tipo) => (
          <div key={tipo} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{meta(tipo).ic} {tipo}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">{grupos[tipo].length}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {grupos[tipo].map((u, i) => (
                <li key={i} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[13px] font-medium text-slate-800">{u.nome}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{u.nrId ? `nº ${u.nrId}` : ""}</span>
                  </div>
                  {(u.endereco || u.telefone) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      {u.endereco && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{u.endereco}</span>}
                      {u.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-slate-400" />{u.telefone}</span>}
                      {u.endereco && <a href={mapsUrl(`${u.nome} ${u.endereco}`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 hover:underline">📍 mapa</a>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fonte: CadSUAS — Cadastro Nacional do SUAS (MDS), consulta pública. Cada unidade da rede socioassistencial com nº identificador, endereço e telefone ({dados.comEndereco}/{dados.total} com endereço). Unidades de acolhimento incluem entidades conveniadas. O link "mapa" abre o endereço no Google Maps.
      </p>
    </div>
  );
}
