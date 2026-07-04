// Indicadores educacionais INEP (rede municipal) — AFD (formação docente), TDI (distorção idade-série), ATU (alunos/turma).
// Retrato de QUALIDADE ao lado do FUNDEB. Comparação com a mediana SC. Server component. Fonte: INEP. Exibição neutra.
import type { IndicadoresInepSC } from "@/lib/queries";
import { UserCheck, Clock, Users2, Info, TrendingUp, LogOut } from "lucide-react";

const f1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function Ind({ icon, titulo, sub, valor, unidade, med, melhorAlto, interpreta }: { icon: React.ReactNode; titulo: string; sub: string; valor: number | null; unidade: string; med: number; melhorAlto: boolean; interpreta: string }) {
  const bom = valor != null && med > 0 ? (melhorAlto ? valor >= med : valor <= med) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">{icon} {titulo}</div>
      <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-800">{f1(valor)}<span className="text-sm font-normal text-slate-400">{unidade}</span></div>
      {med > 0 && <div className={`text-[10px] ${bom == null ? "text-slate-400" : bom ? "text-emerald-600" : "text-amber-600"}`}>mediana SC: {f1(med)}{unidade} · {bom == null ? "" : bom ? "melhor que a mediana" : "abaixo da mediana"}</div>}
      <div className="mt-1 text-[11px] text-slate-500">{interpreta}</div>
    </div>
  );
}

export function IndicadoresInep({ data, nome }: { data: NonNullable<IndicadoresInepSC>; nome: string }) {
  const d = data;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><UserCheck className="h-4 w-4 text-teal-600" /> Qualidade da rede municipal — indicadores INEP</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">{d.ano} · rede municipal</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">Além de <b>quanto</b> (FUNDEB), o <b>como</b>: quem ensina (AFD), o ritmo (distorção), a lotação (turma) e o fluxo (aprovação/abandono). Valores dos <b>anos iniciais</b>, com a mediana de SC.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Ind icon={<UserCheck className="h-3.5 w-3.5 text-emerald-600" />} titulo="Formação docente adequada" sub="AFD — % de docentes com licenciatura na área" valor={d.afd.funAi} unidade="%" med={d.medSC.afdAi} melhorAlto interpreta={`Anos finais ${f1(d.afd.funAf)}% · infantil ${f1(d.afd.edInf)}%. Quanto maior, mais professores formados na disciplina que lecionam.`} />
        <Ind icon={<Clock className="h-3.5 w-3.5 text-amber-600" />} titulo="Distorção idade-série" sub="TDI — % de alunos com atraso ≥ 2 anos" valor={d.tdi.funAi} unidade="%" med={d.medSC.tdiAi} melhorAlto={false} interpreta={`Anos finais ${f1(d.tdi.funAf)}%. Quanto menor, melhor o fluxo (menos reprovação/atraso).`} />
        <Ind icon={<Users2 className="h-3.5 w-3.5 text-slate-500" />} titulo="Alunos por turma" sub="ATU — média de alunos por turma" valor={d.atu.funAi} unidade="" med={d.medSC.atuAi} melhorAlto={false} interpreta={`Anos finais ${f1(d.atu.funAf)} · infantil ${f1(d.atu.edInf)}. Turmas menores tendem a favorecer o aprendizado.`} />
        <Ind icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />} titulo="Taxa de aprovação" sub="rendimento — % de alunos aprovados" valor={d.aprovacao.funAi} unidade="%" med={d.medSC.aprovAi} melhorAlto interpreta={`Anos finais ${f1(d.aprovacao.funAf)}%. Quanto maior, melhor o fluxo escolar.`} />
        <Ind icon={<LogOut className="h-3.5 w-3.5 text-rose-500" />} titulo="Taxa de abandono" sub="rendimento — % que deixaram a escola" valor={d.abandono.funAi} unidade="%" med={d.medSC.abandAi} melhorAlto={false} interpreta={`Anos finais ${f1(d.abandono.funAf)}%. Quanto menor, melhor a permanência dos alunos.`} />
      </div>
      <p className="mt-2 text-[10px] text-slate-400"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700"><Info aria-hidden className="h-3 w-3" /> Dado oficial</span>Fonte: <b>INEP</b> — Indicadores Educacionais {d.ano} (AFD, TDI, ATU, Taxas de Rendimento por município, rede municipal). O detalhe por escola (georreferenciado) fica no mapa em Equipamentos Públicos. Exibição neutra.</p>
    </div>
  );
}
