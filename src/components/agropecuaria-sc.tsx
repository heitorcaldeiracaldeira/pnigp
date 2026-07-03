import { Database, FileText, Landmark, Leaf, Sprout, Tractor, Users } from "lucide-react";
import type { AgropecuariaSC } from "@/lib/queries";

const n0 = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const ha = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " ha";
const brl = (n: number) => n >= 1e6 ? "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function Agropecuaria({ data, nome }: { data: NonNullable<AgropecuariaSC>; nome: string }) {
  const acimaMediana = data.pctEstabFamiliar >= data.medEstabFamiliarSC;
  const { caf, car, pronaf } = data;
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-lime-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sprout aria-hidden className="h-4 w-4 text-lime-600" /> Agricultura e Agricultura Familiar · {nome}</div>
        <p className="mt-1 text-sm text-slate-600">Estrutura do campo segundo o <b>Censo Agropecuário 2017 (IBGE)</b>: quantas propriedades, quanta terra, e o peso da <b>agricultura familiar</b> (Lei 11.326) — a base para programas como PAA, PRONAF e crédito rural.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Tractor aria-hidden className="h-3.5 w-3.5" /> Estabelecimentos</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(data.estabTotal)}</div>
          <div className="text-[11px] text-slate-500">propriedades rurais (total)</div>
        </div>
        <div className="rounded-xl border border-lime-200 bg-lime-50/60 p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Users aria-hidden className="h-3.5 w-3.5" /> Agricultura familiar</div>
          <div className="font-display text-2xl font-bold tabular-nums text-lime-700">{data.pctEstabFamiliar.toFixed(0)}%</div>
          <div className="text-[11px] text-slate-500">{n0(data.estabFamiliar)} estab. · mediana SC {data.medEstabFamiliarSC.toFixed(0)}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Sprout aria-hidden className="h-3.5 w-3.5" /> Área total</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(data.areaTotal / 1000)} mil</div>
          <div className="text-[11px] text-slate-500">hectares de estabelecimentos</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Sprout aria-hidden className="h-3.5 w-3.5" /> Área familiar</div>
          <div className="font-display text-2xl font-bold tabular-nums text-lime-700">{data.pctAreaFamiliar.toFixed(0)}%</div>
          <div className="text-[11px] text-slate-500">{ha(data.areaFamiliar)} da área</div>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-l-lime-500 bg-white p-3 text-sm shadow-sm">
        <p className="text-slate-700">A agricultura familiar responde por <b>{data.pctEstabFamiliar.toFixed(0)}% das propriedades</b> de {nome}, mas ocupa <b>{data.pctAreaFamiliar.toFixed(0)}% da área</b> — o padrão do setor (muitas propriedades pequenas). {acimaMediana ? "Acima" : "Abaixo"} da mediana de SC ({data.medEstabFamiliarSC.toFixed(0)}%), {acimaMediana ? "o que reforça a vocação de agricultura familiar do município" : "indicando perfil mais empresarial/concentrado"}.</p>
      </div>

      {(caf || car || pronaf) && (
        <div className="space-y-3 pt-1">
          <div className="text-sm font-semibold text-slate-800">Registros e crédito da agricultura familiar — atualizados</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {caf && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-1 text-xs text-slate-500"><Leaf aria-hidden className="h-3.5 w-3.5 text-lime-600" /> Agricultores familiares (CAF)</div>
                <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(caf.fisica)}</div>
                <div className="text-[11px] text-slate-500">CAFs de pessoa física{caf.juridica ? ` · ${n0(caf.juridica)} jurídicas` : ""}{caf.competencia ? ` · ${caf.competencia}` : ""}</div>
              </div>
            )}
            {car && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-1 text-xs text-slate-500"><FileText aria-hidden className="h-3.5 w-3.5 text-emerald-600" /> Imóveis rurais no CAR</div>
                <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(car.total)}</div>
                <div className="text-[11px] text-slate-500">{n0(car.ativos)} com cadastro ativo</div>
              </div>
            )}
            {pronaf && (
              <div className="rounded-xl border border-lime-200 bg-lime-50/60 p-4">
                <div className="flex items-center gap-1 text-xs text-slate-500"><Landmark aria-hidden className="h-3.5 w-3.5 text-lime-700" /> Crédito PRONAF {pronaf.anoMax}</div>
                <div className="font-display text-2xl font-bold tabular-nums text-lime-700">{brl(pronaf.vlTotal)}</div>
                <div className="text-[11px] text-slate-500">custeio {brl(pronaf.vlCusteio)} · investimento {brl(pronaf.vlInvestimento)}</div>
              </div>
            )}
          </div>
          {pronaf && pronaf.serie.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-600">PRONAF contratado por ano (R$)</div>
              <div className="mt-2 flex items-end gap-2" style={{ height: 64 }}>
                {(() => { const max = Math.max(...pronaf.serie.map((s) => s.vl), 1); return pronaf.serie.map((s) => (
                  <div key={s.ano} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="text-[9px] tabular-nums text-slate-500">{brl(s.vl)}</div>
                    <div className="w-full rounded-t bg-lime-400" style={{ height: `${Math.max(4, (s.vl / max) * 44)}px` }} />
                    <div className="text-[10px] tabular-nums text-slate-500">{s.ano}</div>
                  </div>
                )); })()}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dados oficiais</span>Fontes: IBGE — Censo Agropecuário 2017 (estrutura: estabelecimentos e área){caf ? "; MDA — Cadastro Nacional da Agricultura Familiar (CAF, mensal)" : ""}{car ? "; SICAR — Cadastro Ambiental Rural (imóveis rurais)" : ""}{pronaf ? "; Banco Central — SICOR/Matriz do Crédito Rural (PRONAF, valor contratado por ano)" : ""}. Recorte de agricultura familiar conforme Lei 11.326/2006.</p>
    </section>
  );
}
