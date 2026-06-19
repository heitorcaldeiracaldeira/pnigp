import { Activity, Building2, Database, HeartPulse, Stethoscope, Users } from "lucide-react";
import type { SaudeSC, PrevineSC, FnsSC } from "@/lib/queries";
import { Termo, GlossarioStrip } from "@/components/termo";

const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const brMi = (x: number) => "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
function cmp(v: number, m: number) {
  if (m <= 0) return { txt: "—", cls: "text-slate-400" };
  if (v >= m * 1.15) return { txt: "▲ acima dos pares", cls: "text-emerald-600" };
  if (v <= m * 0.85) return { txt: "▼ abaixo dos pares", cls: "text-amber-600" };
  return { txt: "≈ na média dos pares", cls: "text-slate-500" };
}

export function SaudeSC({ data, previne, fns }: { data: NonNullable<SaudeSC>; previne?: NonNullable<PrevineSC> | null; fns?: NonNullable<FnsSC> | null }) {
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
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" /> Gasto em saúde (<Termo k="ASPS" />)</div>
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

      {d.transfSaudeValor != null && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Database className="h-3.5 w-3.5 text-teal-600" /> De onde vem o dinheiro da saúde (repasse federal SUS)</div>
          <p className="mt-1 text-slate-700">
            Transferências recebidas para saúde: <b>R$ {(d.transfSaudeValor / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi</b>
            {d.transfUniaoPct != null ? <> — <b>{n1(d.transfUniaoPct)}%</b> vêm da União{d.transfUniaoValor != null ? ` (R$ ${(d.transfUniaoValor / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi)` : ""}.</> : "."}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">SIOPS — transferências SUS para a saúde do município (quanto maior a fatia da União, maior a dependência de repasse federal).</p>
        </div>
      )}

      {fns && fns.total > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Database className="h-4 w-4" /> Repasses federais do FNS por bloco ({fns.ano})</div>
          <p className="mt-1 text-sm text-slate-600">O que a União repassou fundo-a-fundo, por bloco e área — fonte: Fundo Nacional de Saúde. Total <b>{brMi(fns.total)}</b> ({fns.investimento > 0 ? `${brMi(fns.custeio)} custeio + ${brMi(fns.investimento)} investimento` : "custeio"}).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fns.areas.map((a) => (
              <div key={a.nome} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">{a.nome.charAt(0) + a.nome.slice(1).toLowerCase()}</div>
                <div className="font-display text-lg font-bold tabular-nums text-slate-900">{brMi(a.valor)}</div>
                <div className="text-[11px] text-slate-500">{n1(a.valor / fns.total * 100)}% do repasse federal</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.popIndigena != null && d.popIndigena > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><Users className="h-3.5 w-3.5" /> Saúde indígena — relevante neste município</div>
          <p className="mt-1 text-slate-700">
            População indígena: <b>{d.popIndigena.toLocaleString("pt-BR")} habitantes</b> ({n1(d.popIndigena / d.pop * 100)}% da população — Censo IBGE 2022).
            {d.popIndigena / d.pop >= 0.1 ? " Presença expressiva — atenção básica indígena é prioridade local." : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">A atenção primária à população indígena é responsabilidade compartilhada (DSEI/SESAI + município). Atendimentos por DSEI não têm dado aberto confiável por município (API do MS instável); população é o indicador sólido disponível.</p>
        </div>
      )}

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

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Gasto: SIOPS (ASPS, LC 141). Previne Brasil: SISAB/Min. Saúde. Rede: CNES (inclui pública e privada). Produção: SIH (internações) e SIA (ambulatorial) — DATASUS, por local de atendimento. População: IBGE. Benchmarks por grupo de porte. Ciclo completo: insumo (gasto) → capacidade (rede) → entrega (produção).
      </p>
      <GlossarioStrip ks={["ASPS", "APS", "FNS", "SIOPS"]} />
    </div>
  );
}
