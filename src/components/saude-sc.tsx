import { Activity, Building2, Database, HeartPulse, Stethoscope } from "lucide-react";
import type { SaudeSC, PrevineSC } from "@/lib/queries";

const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
function cmp(v: number, m: number) {
  if (m <= 0) return { txt: "—", cls: "text-slate-400" };
  if (v >= m * 1.15) return { txt: "▲ acima dos pares", cls: "text-emerald-600" };
  if (v <= m * 0.85) return { txt: "▼ abaixo dos pares", cls: "text-amber-600" };
  return { txt: "≈ na média dos pares", cls: "text-slate-500" };
}

export function SaudeSC({ data, previne }: { data: NonNullable<SaudeSC>; previne?: NonNullable<PrevineSC> | null }) {
  const d = data;
  const cEstab = cmp(d.estabMil, d.estabMilPares);
  const cSus = cmp(d.susMil, d.susMilPares);
  const gastoOk = d.saudePct == null ? null : d.saudePct >= 15;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><HeartPulse className="h-4 w-4" /> Saúde — gasto × rede × população ({n1(d.pop)} hab · grupo {d.grupo})</div>
        <p className="mt-1 text-sm text-slate-600">Cruza o <b>quanto se gasta</b> (SIOPS/ASPS) com a <b>rede instalada</b> (CNES), relativizado pela população e comparado aos municípios de porte semelhante.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-4 ${gastoOk === false ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" /> Gasto em saúde (ASPS)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.saudePct == null ? "—" : `${n1(d.saudePct)}%`}</div>
          <div className="text-[11px] text-slate-500">mínimo CF 15%{d.saudeAno ? ` · ${d.saudeAno}` : ""} {gastoOk === false ? "· ⚠ abaixo" : gastoOk ? "· ✓" : ""}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" /> Estabelecimentos / mil hab</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n1(d.estabMil)}</div>
          <div className={`text-[11px] ${cEstab.cls}`}>pares {n1(d.estabMilPares)} · {cEstab.txt}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Stethoscope className="h-3.5 w-3.5" /> Unidades SUS / mil hab</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n1(d.susMil)}</div>
          <div className={`text-[11px] ${cSus.cls}`}>pares {n1(d.susMilPares)} · {cSus.txt}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" /> Atenção hospitalar</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.hospitalar}</div>
          <div className="text-[11px] text-slate-500">{d.temHospital ? "tem hospital" : "sem hospital"} · {d.cirurgico} c/ centro cirúrgico</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Activity className="h-4 w-4 text-rose-600" /> Produção (entrega ao cidadão)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" /> Internações / mil hab (SIH)</div>
            <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.internMil > 0 ? n1(d.internMil) : "—"}</div>
            <div className={`text-[11px] ${d.internMil > 0 ? cmp(d.internMil, d.internMilPares).cls : "text-slate-400"}`}>
              {d.internMil > 0 ? `pares ${n1(d.internMilPares)} · ${cmp(d.internMil, d.internMilPares).txt}${d.sihAno ? ` · ${d.sihAno}` : ""}` : "sem internação local (depende de referência regional)"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" /> Procedimentos ambulatoriais / hab (SIA)</div>
            <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.siaHab > 0 ? n1(d.siaHab) : "—"}</div>
            <div className={`text-[11px] ${d.siaHab > 0 ? cmp(d.siaHab, d.siaHabPares).cls : "text-slate-400"}`}>
              {d.siaHab > 0 ? `pares ${n1(d.siaHabPares)} · ${cmp(d.siaHab, d.siaHabPares).txt}${d.siaAno ? ` · ${d.siaAno}` : ""}` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p className="mb-1 font-semibold text-slate-800">Leitura (insumo × capacidade × entrega)</p>
        <p>
          O município aplicou <b>{d.saudePct == null ? "—" : `${n1(d.saudePct)}%`}</b> da receita própria em saúde (mín. 15%) e mantém <b>{n1(d.estabMil)}</b> estabelecimentos por mil habitantes
          ({cEstab.txt.replace("▲ ", "").replace("▼ ", "")}). {d.temHospital ? "Possui atenção hospitalar instalada." : "Não possui estabelecimento com atendimento hospitalar — depende de referência regional."}
        </p>
      </div>

      {previne && previne.indicadores.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Stethoscope className="h-4 w-4 text-indigo-600" /> Atenção Primária — Previne Brasil ({previne.competencia})</h3>
          <p className="mb-2 text-xs text-slate-500">Indicadores de desempenho da APS (SISAB) — quanto maior, melhor; comparado aos pares de porte.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {previne.indicadores.map((i) => {
              const c = cmp(i.pct, i.paresPct);
              return (
                <div key={i.nome} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs text-slate-500">{i.nome}</div>
                  <div className="font-display text-xl font-bold tabular-nums text-slate-900">{n1(i.pct)}%</div>
                  <div className={`text-[11px] ${c.cls}`}>pares {n1(i.paresPct)}% · {c.txt}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Gasto: SIOPS (ASPS, LC 141). Previne Brasil: SISAB/Min. Saúde. Rede: CNES (inclui pública e privada). Produção: SIH (internações) e SIA (ambulatorial) — DATASUS, por local de atendimento. População: IBGE. Benchmarks por grupo de porte. Ciclo completo: insumo (gasto) → capacidade (rede) → entrega (produção).
      </p>
    </div>
  );
}
